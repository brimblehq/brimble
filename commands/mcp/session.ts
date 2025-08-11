import { spawn, ChildProcess } from "child_process";
import { v4 as uuidv4 } from "uuid";
import chalk from "chalk";
import ora, { Ora } from "ora";
import { MCPMessage } from "../../types";
import { logger } from "../../helpers/logger";

interface GlobalConfig {
  verbose: boolean;
  quiet: boolean;
  color: boolean;
  spawnCommand?: string;
  spawnArgs?: string[];
}

interface SessionStats {
  id: string;
  pid?: number;
  uptime: string;
  messages: number;
  initialized: boolean;
  alive: boolean;
}

export class MCPSession {
  public id: string;
  public initialized: boolean;
  public process: ChildProcess | null;
  public messageQueue: any[];
  public responseCallbacks: Map<string | number, (response: MCPMessage) => void>;
  public currentMessageId: number;
  public initResponse: MCPMessage | null;
  public options: any;
  public startTime: number;
  public messageCount: number;
  public globalConfig: GlobalConfig;
  private stdoutBuffer: string = "";
  private stderrBuffer: string = "";
  public fullyInitialized: boolean;
  private initializationPromise: Promise<void> | null = null;

  constructor(options: any = {}, globalConfig: GlobalConfig) {
    this.id = uuidv4();
    this.initialized = false;
    this.process = null;
    this.messageQueue = [];
    this.responseCallbacks = new Map();
    this.currentMessageId = 1;
    this.initResponse = null;
    this.options = options;
    this.startTime = Date.now();
    this.messageCount = 0;
    this.globalConfig = globalConfig;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.fullyInitialized = false;
    this.initializationPromise = null;
  }

  isValidJSON(str: string): boolean {
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === "object" && parsed !== null;
    } catch {
      return false;
    }
  }

  startMCPProcess(command: string, args: string[]): void {
    const sessionSpinner: Ora = ora({
      text: `Starting MCP process: ${chalk.cyan(command)} ${chalk.gray(args.join(" "))}`,
      spinner: "dots",
    }).start();

    try {
      this.process = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: this.globalConfig.color ? "1" : "0",
        },
      });

      sessionSpinner.succeed(
        `Process started ${chalk.green("✓")} PID: ${chalk.yellow(this.process.pid)}`
      );

      this.setupProcessHandlers();

      if (this.globalConfig.verbose) {
        logger.info(
          `Session ${chalk.magenta(this.id.slice(0, 8))} created for process ${this.process.pid}`
        );
      }
    } catch (error: any) {
      sessionSpinner.fail(`Failed to start process: ${error.message}`);
      throw error;
    }
  }

  setupProcessHandlers(): void {
    if (!this.process) return;

    const processBuffer = (buffer: string, source: "stdout" | "stderr"): string => {
      //let remainingBuffer = buffer;
      const lines = buffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (this.isValidJSON(line)) {
          try {
            const response: MCPMessage = JSON.parse(line);

            if (response.method?.startsWith("notifications/")) {
              logger.info(`📢 Server notification: ${response.method}`);
              return lines[lines.length - 1] || "";
            }

            this.handleMCPResponse(response);
            this.messageCount++;

            if (this.globalConfig.verbose) {
              logger.debug(
                `📥 Received from ${source}: ${chalk.gray(JSON.stringify(response, null, 2))}`
              );
            }
          } catch (error: any) {
            logger.error(`Failed to parse MCP response from ${source}: ${error.message}`);
          }
        } else {
          if (line.includes("🚨") || line.toLowerCase().includes("error")) {
            logger.warn(`Error: ${line}`);
          } else if (this.globalConfig.verbose) {
            logger.info(`Server (${source}): ${line}`);
          }
        }
      }

      return lines[lines.length - 1] || "";
    };

    this.process.stdout?.on("data", (data: Buffer) => {
      this.stdoutBuffer += data.toString();
      this.stdoutBuffer = processBuffer(this.stdoutBuffer, "stdout");
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.stderrBuffer += data.toString();
      this.stderrBuffer = processBuffer(this.stderrBuffer, "stderr");
    });

    this.process.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.stdoutBuffer) {
        logger.error(`====> Last stdout output:\n${this.stdoutBuffer}`);
      }
      if (this.stderrBuffer) {
        logger.error(`====> Last stderr output:\n${this.stderrBuffer}`);
      }
      const uptime = ((Date.now() - this.startTime) / 1000).toFixed(1);
      if (code === 0) {
        logger.info(
          `Process ${chalk.yellow(this.process?.pid)} exited normally ` +
            `(uptime: ${chalk.cyan(uptime)}s, messages: ${chalk.cyan(this.messageCount)})`
        );
      } else {
        logger.error(
          `Process ${chalk.yellow(this.process?.pid)} exited with code ${chalk.red(code)} ` +
            `${signal ? `signal ${signal} ` : ""}(uptime: ${chalk.cyan(uptime)}s)`
        );
      }
      this.cleanup();
    });

    this.process.on("error", (error: Error) => {
      logger.error(`Process spawn failed: ${error.message}`);
      logger.error(`Process error details: ${error.stack}`);
      throw new Error(`Process spawn failed: ${error.message}`);
    });
  }

  handleMCPResponse(response: MCPMessage): void {
    if (this.globalConfig.verbose) {
      logger.debug(
        `🎯 Handling response: ID=${response.id} (type=${typeof response.id}), Method=${response.method}`
      );
    }

    logger.info(`📥 Received MCP Response: ${JSON.stringify(response, null, 2)}`);

    if (
      response.id !== undefined &&
      response.id !== null &&
      this.responseCallbacks.has(response.id)
    ) {
      const callback = this.responseCallbacks.get(response.id);
      if (callback) {
        this.responseCallbacks.delete(response.id);
        callback(response);
        if (this.globalConfig.verbose) {
          logger.debug(`✅ Successfully delivered response for ID: ${response.id}`);
        }
      }
    } else {
      logger.warn(
        `⚠️ No callback found for response ID: ${response.id} (type=${typeof response.id})`
      );
      logger.debug(`📋 Active callbacks: ${Array.from(this.responseCallbacks.keys()).join(", ")}`);
    }
  }

  sendMessage(message: MCPMessage): Promise<MCPMessage> {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.killed) {
        logger.error("❌ MCP process not available");
        reject(new Error("MCP process not available"));
        return;
      }

      logger.info(`📤 Sending MCP Message: ${JSON.stringify(message, null, 2)}`);

      if (message.id) {
        this.responseCallbacks.set(message.id, resolve);
        logger.debug(`📝 Registered callback for message ID: ${message.id}`);
      }

      const messageStr = JSON.stringify(message);
      this.process.stdin?.write(messageStr + "\n");

      if (this.globalConfig.verbose) {
        logger.debug(`📤 Sent: ${chalk.gray(messageStr)}`);
      }

      const getTimeoutForMethod = (method?: string): number => {
        if (!method) return 30000;

        if (method.includes("tools/list") || method.includes("tools/call")) {
          return 120000;
        }
        if (method.includes("resources/") || method.includes("prompts/")) {
          return 60000;
        }
        if (method.includes("notifications/")) {
          return 60000;
        }
        return 30000;
      };

      const timeoutMs = getTimeoutForMethod(message.method);
      logger.debug(`⏱️ Set timeout of ${timeoutMs}ms for method: ${message.method}`);

      const timeoutId = setTimeout(() => {
        if (message.id && this.responseCallbacks.has(message.id)) {
          this.responseCallbacks.delete(message.id);
          logger.error(
            `⏰ Request timeout after ${timeoutMs / 1000}s for method: ${message.method}`
          );
          reject(
            new Error(`Request timeout after ${timeoutMs / 1000}s for method: ${message.method}`)
          );
        }
      }, timeoutMs);

      if (message.id) {
        const originalCallback = this.responseCallbacks.get(message.id);
        if (originalCallback) {
          this.responseCallbacks.set(message.id, (response: MCPMessage) => {
            clearTimeout(timeoutId);
            logger.debug(`✅ Received response for message ID: ${message.id}`);
            originalCallback(response);
          });
        }
      }
    });
  }

  async initialize(params: any): Promise<MCPMessage> {
    logger.info(`🔄 Initializing MCP session with params: ${JSON.stringify(params, null, 2)}`);

    if (this.initialized && this.initResponse) {
      logger.info("✅ Using cached initialization response");
      return this.initResponse;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return this.initResponse!;
    }

    this.initializationPromise = this.performInitialization(params);
    await this.initializationPromise;
    return this.initResponse!;
  }

  private async performInitialization(params: any): Promise<void> {
    const initSpinner: Ora = ora("Initializing MCP session...").start();

    try {
      const initMessage: MCPMessage = {
        jsonrpc: "2.0",
        id: this.currentMessageId++,
        method: "initialize",
        params,
      };

      console.log("\nSSE Message -->", JSON.stringify(initMessage));

      const response = await this.sendMessage(initMessage);
      this.initialized = true;
      this.initResponse = response;

      await this.sendNotification("notifications/initialized");

      initSpinner.succeed(`MCP session initialized ${chalk.green("✓")}`);

      if (this.globalConfig.verbose && response.result) {
        const serverInfo = response.result.serverInfo;
        if (serverInfo) {
          logger.info(
            `Connected to ${chalk.cyan(serverInfo.name)} v${chalk.yellow(serverInfo.version)}`
          );
        }
      }
    } catch (error: any) {
      initSpinner.fail(`Initialization failed: ${error.message}`);
      logger.error(`❌ Initialization error: ${error.message}`);
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  sendNotification(method: string, params: any = {}): void {
    if (!this.process || this.process.killed) {
      logger.error("❌ MCP process not available");
      return;
    }

    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const messageStr = JSON.stringify(notification);
    this.process.stdin?.write(messageStr + "\n");

    logger.info(`📤 Sent notification: ${chalk.gray(messageStr)}`);
  }

  async callMethod(method: string, params: any = {}): Promise<MCPMessage> {
    logger.info(`🔄 Calling method: ${method} with params: ${JSON.stringify(params, null, 2)}`);

    if (!this.initialized && method !== "initialize") {
      logger.error("❌ Server not initialized");
      throw new Error("Server not initialized");
    }

    const message: MCPMessage = {
      jsonrpc: "2.0",
      id: this.currentMessageId++,
      method,
      params,
    };

    return await this.sendMessage(message);
  }

  cleanup(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.responseCallbacks.clear();
    this.initResponse = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  getStats(): SessionStats {
    const uptime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return {
      id: this.id.slice(0, 8),
      pid: this.process?.pid,
      uptime: `${uptime}s`,
      messages: this.messageCount,
      initialized: this.initialized,
      alive: !!(this.process && !this.process.killed),
    };
  }
}
