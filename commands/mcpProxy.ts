import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import chalk from "chalk";
import { MCPConfig, GlobalConfig, ExtendedRequest } from "../types";
import { createErrorResponse, parseCommand } from "../helpers/mcp";
import { logger } from "../helpers/logger";
import { showExamples, displayBanner, promptForConfig, displayServerInfo } from "./mcp/ui";
import { getSessionKey } from "./mcp/utils";
import { MCPSession } from "./mcp/session";

type ActiveSession = {
  session: MCPSession;
  sessionId: string;
  apiKey: string;
  ip: string;
  createdAt: number;
  lastAccessedAt: number;
};

const activeSessions = new Map<string, ActiveSession>();
const MAX_GLOBAL_SESSIONS = Number(process.env.MCP_MAX_GLOBAL_SESSIONS || 100);
const MAX_SESSIONS_PER_API_KEY = Number(process.env.MCP_MAX_SESSIONS_PER_API_KEY || 10);
const MAX_SESSIONS_PER_IP = Number(process.env.MCP_MAX_SESSIONS_PER_IP || 25);
const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS || 30 * 60 * 1000);
const REQUIRE_API_KEY = (process.env.MCP_REQUIRE_API_KEY || "true").toLowerCase() === "true";
const ALLOWED_API_KEYS = new Set(
  (process.env.MCP_ALLOWED_API_KEYS || "")
    .split(",")
    .map(key => key.trim())
    .filter(Boolean)
);
const DEFAULT_CORS_ALLOWLIST = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:4200",
];
const CORS_ALLOWLIST = process.env.MCP_CORS_ORIGINS
  ? process.env.MCP_CORS_ORIGINS.split(",")
      .map(origin => origin.trim())
      .filter(Boolean)
  : DEFAULT_CORS_ALLOWLIST;
const CORS_ALLOW_CREDENTIALS =
  (process.env.MCP_CORS_ALLOW_CREDENTIALS || "false").toLowerCase() === "true";

function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function normalizeSessionId(rawSessionId: string): string | null {
  if (!rawSessionId) return "default";
  if (rawSessionId.length > 128) {
    return null;
  }
  if (!/^[A-Za-z0-9:_-]+$/.test(rawSessionId)) {
    return null;
  }
  return rawSessionId;
}

function removeSessionByKey(sessionKey: string): void {
  activeSessions.delete(sessionKey);
}

function evictStaleSessions(): void {
  const now = Date.now();
  const staleKeys: string[] = [];

  activeSessions.forEach((entry, key) => {
    const idleMs = now - entry.lastAccessedAt;
    const alive = entry.session.getStats().alive;
    if (idleMs > SESSION_TTL_MS || !alive) {
      staleKeys.push(key);
    }
  });

  staleKeys.forEach(key => {
    const entry = activeSessions.get(key);
    if (entry) {
      entry.session.cleanup();
      removeSessionByKey(key);
    }
  });
}

function countSessionsByApiKey(apiKey: string): number {
  let count = 0;
  activeSessions.forEach(entry => {
    if (entry.apiKey === apiKey) count++;
  });
  return count;
}

function countSessionsByIp(ip: string): number {
  let count = 0;
  activeSessions.forEach(entry => {
    if (entry.ip === ip) count++;
  });
  return count;
}

function isAuthorizedApiKey(apiKey: string): boolean {
  if (REQUIRE_API_KEY && (!apiKey || apiKey === "default")) {
    return false;
  }

  if (ALLOWED_API_KEYS.size > 0 && !ALLOWED_API_KEYS.has(apiKey)) {
    return false;
  }

  return true;
}

async function getSession(
  req: ExtendedRequest,
  res: Response,
  next: NextFunction,
  globalConfig: GlobalConfig
): Promise<void> {
  try {
    evictStaleSessions();

    const apiKey = String(req.headers["x-api-key"] || "").trim() || "default";
    if (!isAuthorizedApiKey(apiKey)) {
      res.status(401).json(createErrorResponse(-32001, "Unauthorized API key"));
      return;
    }

    const rawSessionId =
      String(req.headers["x-session-id"] || "").trim() ||
      String(req.query.session || "").trim() ||
      "default";
    const sessionId = normalizeSessionId(rawSessionId);
    if (!sessionId) {
      res.status(400).json(createErrorResponse(-32000, "Invalid session id"));
      return;
    }

    const clientIp = getClientIp(req);
    const sessionKey = getSessionKey(sessionId, apiKey);

    if (!activeSessions.has(sessionKey)) {
      if (activeSessions.size >= MAX_GLOBAL_SESSIONS) {
        res
          .status(429)
          .json(createErrorResponse(-32000, "Global session limit reached, retry later"));
        return;
      }

      if (countSessionsByApiKey(apiKey) >= MAX_SESSIONS_PER_API_KEY) {
        res.status(429).json(createErrorResponse(-32000, "API key session quota exceeded"));
        return;
      }

      if (countSessionsByIp(clientIp) >= MAX_SESSIONS_PER_IP) {
        res.status(429).json(createErrorResponse(-32000, "IP session quota exceeded"));
        return;
      }

      try {
        const session = new MCPSession(
          {
            onSessionEnd: () => {
              removeSessionByKey(sessionKey);
            },
          },
          globalConfig
        );
        if (globalConfig.spawnCommand && globalConfig.spawnArgs) {
          session.startMCPProcess(globalConfig.spawnCommand, globalConfig.spawnArgs);
        }
        activeSessions.set(sessionKey, {
          session,
          sessionId,
          apiKey,
          ip: clientIp,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        });
      } catch (error: any) {
        logger.error(`Failed to create session: ${error.message}`);
        res
          .status(500)
          .json(createErrorResponse(-32000, `Failed to create session: ${error.message}`));
        return;
      }
    }

    const sessionEntry = activeSessions.get(sessionKey);
    if (sessionEntry) {
      sessionEntry.lastAccessedAt = Date.now();
      req.mcpSession = sessionEntry.session;
    }

    next();
  } catch (error: any) {
    res.status(500).json(createErrorResponse(-32000, `Session error: ${error.message}`));
  }
}

function setupRoutes(app: Express, globalConfig: GlobalConfig): void {
  const corsOrigin: cors.CorsOptions["origin"] = (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (CORS_ALLOWLIST.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS policy"), false);
  };

  app.use(
    cors({
      origin: corsOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept", "x-session-id", "x-api-key"],
      exposedHeaders: [],
      credentials: CORS_ALLOW_CREDENTIALS,
    })
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
          res.status(400).json(createErrorResponse(-32000, "Bad Request: Missing method", id));
          return;
        }

        logger.info(
          ` Processing ${chalk.cyan(method)} ${
            id !== undefined && id !== null ? `(id: ${id})` : ""
          }`
        );

        if (method.startsWith("notifications/")) {
          logger.info(` Received notification: ${method}`);
          res.json({
            jsonrpc: "2.0",
            id,
            result: { success: true },
          });
          return;
        }

        if (method === "initialize") {
          response = await req.mcpSession!.initialize(params);
        } else {
          response = await req.mcpSession!.callMethod(method, params);
        }

        const duration = Date.now() - startTime;
        logger.info(` ${chalk.cyan(method)} completed in ${chalk.yellow(duration)}ms`);

        res.json(response);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        logger.error(` Request failed in ${duration}ms: ${error.message}`);

        const errorResponse = createErrorResponse(
          -32000,
          error.message.includes("not initialized")
            ? "Bad Request: Server not initialized"
            : `Internal error: ${error.message}`,
          req.body?.id || null
        );

        res.status(500).json(errorResponse);
      }
    }
  );

  // Health endpoint
  app.get("/health", (req: Request, res: Response) => {
    const apiKey = req.headers["x-api-key"];
    const sessions = Array.from(activeSessions.entries()).map(([key, entry]) => ({
      key: key.split("-")[0],
      sessionId: entry.sessionId,
      ip: entry.ip,
      ...entry.session.getStats(),
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
    }
  );

  // Sessions endpoint
  app.get("/sessions", (req: Request, res: Response) => {
    const sessions = Array.from(activeSessions.entries()).map(([key, entry]) => ({
      key,
      sessionId: entry.sessionId,
      ip: entry.ip,
      createdAt: new Date(entry.createdAt).toISOString(),
      lastAccessedAt: new Date(entry.lastAccessedAt).toISOString(),
      ...entry.session.getStats(),
    }));
    res.json({ sessions });
  });
}

function setupCleanup(): void {
  const cleanup = (): void => {
    console.log(chalk.yellow("\n Cleaning up sessions..."));
    let cleaned = 0;
    activeSessions.forEach(entry => {
      entry.session.cleanup();
      cleaned++;
    });
    activeSessions.clear();
    console.log(chalk.green(`Cleaned up ${cleaned} sessions`));
    console.log(chalk.green(" Goodbye!"));
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
      console.log(chalk.yellow(" Setup cancelled"));
      return;
    }

    commandStr = answers.command;
    port = answers.port;
    globalConfig.verbose = answers.verbose;
  }

  if (!commandStr) {
    console.log(chalk.red(" Command is required"));
    console.log(chalk.yellow(" Try: brimble mcp interactive"));
    return;
  }

  const { command, args } = parseCommand(commandStr);
  globalConfig.spawnCommand = command;
  globalConfig.spawnArgs = args;

  logger.info(` Standard MCP server detected, using stdio proxy mode`);

  const defaultSessionKey = getSessionKey("default", "default");
  const defaultSession = new MCPSession(
    {
      onSessionEnd: () => {
        removeSessionByKey(defaultSessionKey);
      },
    },
    globalConfig
  );
  defaultSession.startMCPProcess(command, args);
  activeSessions.set(defaultSessionKey, {
    session: defaultSession,
    sessionId: "default",
    apiKey: "default",
    ip: "local",
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  });

  const app: Express = express();
  setupRoutes(app, globalConfig);
  setupCleanup();
  setInterval(evictStaleSessions, Math.max(10_000, Math.floor(SESSION_TTL_MS / 2))).unref();

  const server = app.listen(port, () => {
    displayServerInfo(port, command, args);
    console.log(chalk.blue(" Mode: Stdio"));
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
