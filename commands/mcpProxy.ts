import express, { Express, Request, Response, NextFunction } from "express";
import { spawn, ChildProcess } from "child_process";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import chalk from "chalk";
import ora, { Ora } from "ora";
import { MCPMessage, MCPConfig, GlobalConfig, ExtendedRequest, SessionStats } from "../types";
import { createErrorResponse, parseCommand } from "../helpers/mcp";
import { logger } from "../helpers/logger";
import { showExamples, displayBanner, promptForConfig, displayServerInfo } from "./mcp/ui";
import { getSessionKey } from "./mcp/utils";
import { MCPSession } from "./mcp/session";

const activeSessions = new Map<string, MCPSession>();

async function getSession(
  req: ExtendedRequest,
  res: Response,
  next: NextFunction,
  globalConfig: GlobalConfig,
): Promise<void> {
  try {
    const apiKey = (req.headers["x-api-key"] as string) || "default";
    const sessionId = (req.headers["x-session-id"] as string) ||
      (req.query.session as string) ||
      "default";
    const sessionKey = getSessionKey(sessionId, apiKey);

    if (!activeSessions.has(sessionKey)) {
      try {
        const session = new MCPSession({}, globalConfig);
        if (globalConfig.spawnCommand && globalConfig.spawnArgs) {
          session.startMCPProcess(
            globalConfig.spawnCommand,
            globalConfig.spawnArgs,
          );
        }
        activeSessions.set(sessionKey, session);
      } catch (error: any) {
        logger.error(`Failed to create session: ${error.message}`);
        res.status(500).json(
          createErrorResponse(-32000, `Failed to create session: ${error.message}`),
        );
        return;
      }
    }

    const session = activeSessions.get(sessionKey);

    if(session) {
      req.mcpSession = session;
    }
    next();
  } catch (error: any) {
    res.status(500).json(
      createErrorResponse(-32000, `Session error: ${error.message}`),
    );
  }
}

function setupRoutes(app: Express, globalConfig: GlobalConfig): void {
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE", "PATCH"],
      allowedHeaders: "*",
      exposedHeaders: "*",
      credentials: true,
    }),
  );

  app.use(express.json());

  // MCP endpoint
  app.all(
    "/mcp",
    async (req: ExtendedRequest, res: Response, next: NextFunction) => {
      await getSession(req, res, next, globalConfig);
    },
    async (req: ExtendedRequest, res: Response) => {
      const startTime = Date.now();

      try {
        let response;
        const { method, params = {}, id = null } = req.body || {};

        if (!method) {
          res.status(400).json(
            createErrorResponse(-32000, "Bad Request: Missing method", id),
          );
          return;
        }

        logger.info(`📋 Processing ${chalk.cyan(method)} ${id ? `(id: ${id})` : ""}`);

        if (method.startsWith("notifications/")) {
          logger.info(`📢 Received notification: ${method}`);
          res.json({
            jsonrpc: "2.0",
            id,
            result: { success: true }
          });
          return;
        }

        if (method === "initialize") {
          response = await req.mcpSession!.initialize(params);
        } else {
          response = await req.mcpSession!.callMethod(method, params);
        }

        const duration = Date.now() - startTime;
        logger.info(`✅ ${chalk.cyan(method)} completed in ${chalk.yellow(duration)}ms`);

        res.json({ ...response, id });
      } catch (error: any) {
        const duration = Date.now() - startTime;
        logger.error(`❌ Request failed in ${duration}ms: ${error.message}`);

        const errorResponse = createErrorResponse(
          -32000,
          error.message.includes("not initialized")
            ? "Bad Request: Server not initialized"
            : `Internal error: ${error.message}`,
          req.body?.id || null,
        );

        res.status(500).json(errorResponse);
      }
    },
  );

  // Health endpoint
  app.get("/health", (req: Request, res: Response) => {
    const apiKey = req.headers["x-api-key"];
    const sessions = Array.from(activeSessions.entries()).map(([key, session]) => ({
      key: key.split("-")[0],
      ...session.getStats(),
    }));

    res.json({
      status: "ok",
      mode: "stdio",
      activeSessions: activeSessions.size,
      sessions,
      timestamp: new Date().toISOString(),
      authenticated: !!apiKey,
      version: "2.0.0",
    });
  });

  // Debug endpoint
  app.post(
    "/debug/mcp",
    async (req: ExtendedRequest, res: Response, next: NextFunction) => {
      await getSession(req, res, next, globalConfig);
    },
    async (req: ExtendedRequest, res: Response) => {
      try {
        const { method, params = {} } = req.body;
        const response = await req.mcpSession!.callMethod(method, params);
        res.json(response);
      } catch (error: any) {
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  // Sessions endpoint
  app.get("/sessions", (req: Request, res: Response) => {
    const sessions = Array.from(activeSessions.entries()).map(([key, session]) => ({
      key,
      ...session.getStats(),
    }));
    res.json({ sessions });
  });

  // CORS preflight
  app.options("*", (req: Request, res: Response) => {
    const origin = req.headers.origin || "*";
    res.header("Access-Control-Allow-Origin", origin);
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS, PUT, DELETE, PATCH",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, x-session-id, x-api-key, x-owner-id, Cache-Control, Pragma",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    res.sendStatus(200);
  });
}

function setupCleanup(): void {
  const cleanup = (): void => {
    console.log(chalk.yellow("\n🧹 Cleaning up sessions..."));
    let cleaned = 0;
    activeSessions.forEach((session) => {
      session.cleanup();
      cleaned++;
    });
    console.log(chalk.green(`Cleaned up ${cleaned} sessions`));
    console.log(chalk.green("👋 Goodbye!"));
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

const mcpProxy = async (options: MCPConfig): Promise<void> => {
  if (options.examples) {
    showExamples();
    return;
  }

  const globalConfig: GlobalConfig = {
    verbose: options.verbose || false,
    quiet: options.quiet || false,
    color: options.color !== false,
  };

  if (globalConfig.verbose) {
    logger.level = "debug";
  }

  let commandStr = options.command;
  let port = Number(options.port);

  if (options.interactive || !commandStr) {
    displayBanner(globalConfig.quiet);
    const answers = await promptForConfig(commandStr, port, globalConfig.verbose);
    
    if (!answers.start) {
      console.log(chalk.yellow("👋 Setup cancelled"));
      return;
    }

    commandStr = answers.command;
    port = answers.port;
    globalConfig.verbose = answers.verbose;
  }

  if (!commandStr) {
    console.log(chalk.red("❌ Command is required"));
    console.log(chalk.yellow("💡 Try: brimble mcp interactive"));
    return;
  }

  const { command, args } = parseCommand(commandStr);
  globalConfig.spawnCommand = command;
  globalConfig.spawnArgs = args;

  logger.info(`📡 Standard MCP server detected, using stdio proxy mode`);


  const defaultSession = new MCPSession({}, globalConfig);
  defaultSession.startMCPProcess(command, args);
  activeSessions.set(getSessionKey("default", "default"), defaultSession);

  const app: Express = express();
  setupRoutes(app, globalConfig);
  setupCleanup();

  const server = app.listen(port, () => {
    displayServerInfo(port, command, args);
    console.log(chalk.blue("📡 Mode: Stdio"));
  });

  server.on("error", (error: any) => {
    if (error.code === "EADDRINUSE") {
      logger.error(`Port ${port} is already in use. Try a different port with --port`);
    } else {
      logger.error(`Server error: ${error.message}`);
    }
    process.exit(1);
  });
};

export default mcpProxy;