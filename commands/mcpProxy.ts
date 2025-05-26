import express, { Express, Request, Response, NextFunction } from 'express';
import { spawn, ChildProcess } from 'child_process';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import figlet from 'figlet';
import ora, { Ora } from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { createLogger, format, transports, Logger } from 'winston';
import { verifyKey } from "@unkey/api";

interface MCPMessage {
  jsonrpc: string;
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

interface MCPError {
  code: number;
  message: string;
}

interface MCPOptions {
  command?: string;
  port?: string;
  verbose?: boolean;
  quiet?: boolean;
  color?: boolean;
  interactive?: boolean;
  examples?: boolean;
}

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

interface ExtendedRequest extends Request {
  mcpSession?: MCPSession;
}

const commands = [
		"initialize",
		"tools/list",
		"tools/call",
		
		"resources/list",
		"resources/read",
		"resources/subscribe",
		"resources/unsubscribe",
		
		"prompts/list",
		"prompts/get",
		
		"completion/complete",
		
		"logging/setLevel",
		
		"notifications/initialized",
		"notifications/cancelled",
		"notifications/progress",
		"notifications/message",
		"notifications/roots_list_changed",
		"notifications/tool_list_changed",
		"notifications/prompt_list_changed",
		"notifications/resource_list_changed",
		"notifications/resource_updated",
		
		"ping",
	]

const logger: Logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const colorMap: Record<string, any> = {
        error: chalk.red,
        warn: chalk.yellow,
        info: chalk.blue,
        debug: chalk.gray
      };
      const colorFn = colorMap[level] || chalk.white;
      return `${chalk.gray(timestamp)} ${colorFn(level.toUpperCase().padEnd(5))} ${message}${stack ? '\n' + stack : ''}`;
    })
  ),
  transports: [
    new transports.Console()
  ]
});

class MCPSession {
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

  constructor(options: any = {}) {
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
  }

  isValidJSON(str: string): boolean {
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }

  startMCPProcess(command: string, args: string[], globalConfig: GlobalConfig): void {
    const sessionSpinner: Ora = ora({
      text: `Starting MCP process: ${chalk.cyan(command)} ${chalk.gray(args.join(' '))}`,
      spinner: 'dots'
    }).start();

    try {
      this.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: globalConfig.color ? '1' : '0'
        }
      });

      sessionSpinner.succeed(
        `Process started ${chalk.green('✓')} PID: ${chalk.yellow(this.process.pid)}`
      );

      this.setupProcessHandlers(globalConfig);
      
      if (globalConfig.verbose) {
        logger.info(`Session ${chalk.magenta(this.id.slice(0, 8))} created for process ${this.process.pid}`);
      }

    } catch (error: any) {
      sessionSpinner.fail(`Failed to start process: ${error.message}`);
      throw error;
    }
  }

  setupProcessHandlers(globalConfig: GlobalConfig): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data: Buffer) => {
      const messages = data.toString().trim().split('\n');
      messages.forEach(message => {
        const trimmed = message.trim();
        if (!trimmed) return;

        if (this.isValidJSON(trimmed)) {
          try {
            const response: MCPMessage = JSON.parse(trimmed);
            this.handleMCPResponse(response);
            this.messageCount++;
            
            if (globalConfig.verbose) {
              logger.debug(`📥 Received: ${chalk.gray(JSON.stringify(response, null, 2))}`);
            }
          } catch (error: any) {
            logger.error(`Failed to parse MCP response: ${error.message}`);
          }
        } else {
          if (globalConfig.verbose) {
            logger.info(`📢 Server: ${chalk.italic(trimmed)}`);
          }
        }
      });
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const errorMessage = data.toString().trim();
      logger.warn(`🔴 MCP Server Error: ${chalk.red(errorMessage)}`);
    });

    this.process.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      const uptime = ((Date.now() - this.startTime) / 1000).toFixed(1);
      if (code === 0) {
        logger.info(
          `Process ${chalk.yellow(this.process?.pid)} exited normally ` +
          `(uptime: ${chalk.cyan(uptime)}s, messages: ${chalk.cyan(this.messageCount)})`
        );
      } else {
        logger.error(
          `Process ${chalk.yellow(this.process?.pid)} exited with code ${chalk.red(code)} ` +
          `${signal ? `signal ${signal} ` : ''}(uptime: ${chalk.cyan(uptime)}s)`
        );
      }
      this.cleanup();
    });

    this.process.on('error', (error: Error) => {
      logger.error(`Process spawn failed: ${error.message}`);
      throw new Error(`Process spawn failed: ${error.message}`);
    });
  }

  handleMCPResponse(response: MCPMessage): void {
    if (response.id && this.responseCallbacks.has(response.id)) {
      const callback = this.responseCallbacks.get(response.id);
      if (callback) {
        this.responseCallbacks.delete(response.id);
        callback(response);
      }
    }
  }

  sendMessage(message: MCPMessage, globalConfig: GlobalConfig): Promise<MCPMessage> {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.killed) {
        reject(new Error('MCP process not available'));
        return;
      }

      if (message.id) {
        this.responseCallbacks.set(message.id, resolve);
      }

      const messageStr = JSON.stringify(message);
      this.process.stdin?.write(messageStr + '\n');

      if (globalConfig.verbose) {
        logger.debug(`📤 Sent: ${chalk.gray(messageStr)}`);
      }

      const timeoutId = setTimeout(() => {
        if (message.id && this.responseCallbacks.has(message.id)) {
          this.responseCallbacks.delete(message.id);
          reject(new Error(`Request timeout after 30s for method: ${message.method}`));
        }
      }, 30000);

      if (message.id) {
        const originalCallback = this.responseCallbacks.get(message.id);
        if (originalCallback) {
          this.responseCallbacks.set(message.id, (response: MCPMessage) => {
            clearTimeout(timeoutId);
            originalCallback(response);
          });
        }
      }
    });
  }

  async initialize(params: any, globalConfig: GlobalConfig): Promise<MCPMessage> {
    if (this.initialized && this.initResponse) {
      return this.initResponse;
    }

    const initSpinner: Ora = ora('Initializing MCP session...').start();

    try {
      const initMessage: MCPMessage = {
        jsonrpc: "2.0",
        id: this.currentMessageId++,
        method: "initialize",
        params
      };

      const response = await this.sendMessage(initMessage, globalConfig);
      this.initialized = true;
      this.initResponse = response;
      
      initSpinner.succeed(`MCP session initialized ${chalk.green('✓')}`);
      
      if (globalConfig.verbose && response.result) {
        const serverInfo = response.result.serverInfo;
        if (serverInfo) {
          logger.info(`Connected to ${chalk.cyan(serverInfo.name)} v${chalk.yellow(serverInfo.version)}`);
        }
      }
      
      return response;
    } catch (error: any) {
      initSpinner.fail(`Initialization failed: ${error.message}`);
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  async callMethod(method: string, params: any = {}, globalConfig: GlobalConfig): Promise<MCPMessage> {
    if (!this.initialized && method !== 'initialize') {
      throw new Error('Server not initialized');
    }

    const message: MCPMessage = {
      jsonrpc: "2.0",
      id: this.currentMessageId++,
      method,
      params
    };

    return await this.sendMessage(message, globalConfig);
  }

  cleanup(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.responseCallbacks.clear();
    this.initResponse = null;
    this.initialized = false;
  }

  getStats(): SessionStats {
    const uptime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return {
      id: this.id.slice(0, 8),
      pid: this.process?.pid,
      uptime: `${uptime}s`,
      messages: this.messageCount,
      initialized: this.initialized,
      alive: !!(this.process && !this.process.killed)
    };
  }
}

function parseCommand(commandStr: string): { command: string; args: string[] } {
  const parts = commandStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const command = parts[0]?.replace(/['"]/g, '') || '';
  const args = parts.slice(1).map(arg => arg.replace(/['"]/g, ''));
  
  return { command, args };
}

function displayBanner(quiet: boolean): void {
  if (quiet) return;
  
  console.log(
    chalk.cyan.bold(
      figlet.textSync('MCP Proxy', { 
        font: 'Small',
        horizontalLayout: 'fitted' 
      })
    )
  );
  
  console.log(chalk.gray('  Server-Sent Events Proxy for MCP Servers\n'));
}

function displayServerInfo(port: number, command: string, args: string[]): void {
  const info = boxen(
    `${chalk.green('🚀 Server Started')}\n\n` +
    `${chalk.blue('Port:')} ${chalk.yellow(port)}\n` +
    `${chalk.blue('Command:')} ${chalk.cyan(command)} ${chalk.gray(args.join(' '))}\n\n` +
    `${chalk.blue('Endpoints:')}\n` +
    `  📡 MCP: ${chalk.underline(`http://localhost:${port}/mcp`)}\n` +
    `  🏥 Health: ${chalk.underline(`http://localhost:${port}/health`)}\n` +
    `${chalk.blue('Required Header:')} ${chalk.yellow('x-api-key')}\n` +
    `${chalk.gray('Press Ctrl+C to stop')}`,
    {
      padding: 1,
      margin: 1,
      borderColor: 'green'
    }
  );
  
  console.log(info);
}

function showExamples(): void {
  displayBanner(false);
  
  console.log(boxen(
    `${chalk.blue.bold('Usage Examples')}` +
    `\n\n${chalk.yellow('Start MCP proxy:')}` +
    `\n  brimble mcp start --command \"node ./dist/index.js\"` +
    `\n\n${chalk.yellow('With custom port and verbose output:')}` +
    `\n  brimble mcp start --command \"node ./dist/index.js\" --port 9000 --verbose` +
    `\n\n${chalk.yellow('Interactive setup:')}` +
    `\n  brimble mcp interactive` +
    `\n\n${chalk.yellow('Docker example:')}` +
    `\n  brimble mcp start --command \"docker run -i my-mcp-server\"` +
    `\n\n${chalk.blue.bold('Testing endpoints:')}` +
    `\n  curl http://localhost:3001/health` +
    `\n  curl -X POST http://localhost:3001/mcp \\` +
    `\n    -H \"Content-Type: application/json\" \\` +
    `\n    -H \"x-api-key: your-api-key\" \\` +
    `\n    -d '{"method": "tools/list", "id": 1}'`,
    {
      padding: 1,
      margin: 1,
      borderColor: 'blue'
    }
  ));
}

async function getSession(req: ExtendedRequest, res: Response, next: NextFunction, globalConfig: GlobalConfig): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Unauthorized: x-api-key header is required"
      },
      id: null
    });
    return;
  }

  try {
    const result = await verifyKey({
      apiId: process.env.UNKEY_APP_ID!,
      key: apiKey
    });

    if (result.error) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: result.error.message
        },
        id: null
      });
      return;
    }

    const sessionId = (req.headers['x-session-id'] as string) || (req.query.session as string) || 'default';
    const sessionKey = `${sessionId}-${apiKey.slice(-8)}`;
    
    if (!activeSessions.has(sessionKey)) {
      try {
        const session = new MCPSession();
        if (globalConfig.spawnCommand && globalConfig.spawnArgs) {
          session.startMCPProcess(globalConfig.spawnCommand, globalConfig.spawnArgs, globalConfig);
        }
        activeSessions.set(sessionKey, session);
      } catch (error: any) {
        logger.error(`Failed to create session: ${error.message}`);
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: `Failed to create session: ${error.message}`
          },
          id: null
        });
        return;
      }
    }
    
    req.mcpSession = activeSessions.get(sessionKey);
    next();
  } catch (error: any) {
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Authentication error: ${error.message}`
      },
      id: null
    });
  }
}

const activeSessions = new Map<string, MCPSession>();

const mcpProxy = async (options: MCPOptions): Promise<void> => {
  if (options.examples) {
    showExamples();
    return;
  }

  const requiredEnvVars = {
    UNKEY_APP_ID: process.env.UNKEY_APP_ID,
    UNKEY_ROOT_KEY: process.env.UNKEY_ROOT_KEY
  };

  for (const [name, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      logger.error(`${name} Unable to start MCP proxy server. Please set the environment variable in your env`);
      process.exit(1);
    }
  }

  const globalConfig: GlobalConfig = {
    verbose: options.verbose || false,
    quiet: options.quiet || false,
    color: options.color !== false
  };

  if (globalConfig.verbose) {
    logger.level = 'debug';
  }

  let commandStr = options.command;

  if (options.interactive || !commandStr) {
    displayBanner(globalConfig.quiet);
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: 'Enter the command to run your MCP server:',
        default: commandStr,
        validate: (input: string) => input.trim() ? true : 'Command cannot be empty'
      },
      {
        type: 'number',
        name: 'port',
        message: 'Port to run on:',
        default: parseInt(options.port || '3001'),
        validate: (input: number) => (input > 0 && input < 65536) ? true : 'Port must be between 1-65535'
      },
      {
        type: 'confirm',
        name: 'verbose',
        message: 'Enable verbose logging?',
        default: globalConfig.verbose
      },
      {
        type: 'confirm',
        name: 'start',
        message: (answers: any) => `Start server with: ${chalk.cyan(answers.command)}?`,
        default: true
      }
    ]);

    if (!answers.start) {
      console.log(chalk.yellow('👋 Setup cancelled'));
      return;
    }

    commandStr = answers.command;
    options.port = answers.port.toString();
    globalConfig.verbose = answers.verbose;
  }

  if (!commandStr) {
    console.log(chalk.red('❌ Command is required'));
    console.log(chalk.yellow('💡 Try: brimble mcp interactive'));
    return;
  }

  const { command, args } = parseCommand(commandStr);
  globalConfig.spawnCommand = command;
  globalConfig.spawnArgs = args;
  
  displayBanner(globalConfig.quiet);

  const app: Express = express();
  const PORT = parseInt(options.port || '3001');

  // Middleware
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'x-session-id', 'x-api-key']
  }));
  app.use(express.json());

  if (globalConfig.verbose) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${chalk.cyan(req.method)} ${chalk.gray(req.path)} from ${chalk.yellow(req.ip)}`);
      next();
    });
  }

  const sessionMiddleware = (req: ExtendedRequest, res: Response, next: NextFunction) => {
    getSession(req, res, next, globalConfig);
  };

  app.all('/mcp', sessionMiddleware, async (req: ExtendedRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      let response: MCPMessage;
      const { method, params = {}, id = null } = req.body || {};

      if (!method) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: Missing method"
          },
          id
        });
        return;
      }

      logger.info(`📋 Processing ${chalk.cyan(method)} ${id ? `(id: ${id})` : ''}`);

      if (method === 'initialize') {
        response = await req.mcpSession!.initialize(params, globalConfig);
      } else if (commands.includes(method)) {
        response = await req.mcpSession!.callMethod(method, params, globalConfig);
      } else if (method.startsWith('custom/') || method.includes('/')) {
        response = await req.mcpSession!.callMethod(method, params, globalConfig);
      } else {
        response = {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          },
          id
        };
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ ${chalk.cyan(method)} completed in ${chalk.yellow(duration)}ms`);

      const acceptHeader = req.headers.accept || '';
      
      if (acceptHeader.includes('text/event-stream')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*'
        });

        res.write('event: message\n');
        res.write(`data: ${JSON.stringify({ ...response, id })}\n\n`);
        res.end();
      } else {
        res.json({ ...response, id });
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Request failed in ${duration}ms: ${error.message}`);
      
      const errorResponse: MCPMessage = {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: error.message.includes('not initialized') 
            ? "Bad Request: Server not initialized"
            : `Internal error: ${error.message}`
        },
        id: req.body?.id || null
      };

      res.status(500).json(errorResponse);
    }
  });

  app.get('/health', (req: Request, res: Response) => {
    const apiKey = req.headers['x-api-key'];
    const sessions: any[] = [];
    
    activeSessions.forEach((session, key) => {
      sessions.push({
        key: key.split('-')[0],
        ...session.getStats()
      });
    });

    res.json({ 
      status: 'ok', 
      activeSessions: activeSessions.size,
      sessions,
      timestamp: new Date().toISOString(),
      authenticated: !!apiKey,
      command: `${command} ${args.join(' ')}`,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '2.0.0'
    });
  });

  app.post('/debug/mcp', sessionMiddleware, async (req: ExtendedRequest, res: Response) => {
    try {
      const { method, params = {} } = req.body;
      const response = await req.mcpSession!.callMethod(method, params, globalConfig);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get('/sessions', (req: Request, res: Response) => {
    const sessions: any[] = [];
    activeSessions.forEach((session, key) => {
      sessions.push({
        key,
        ...session.getStats()
      });
    });
    res.json({ sessions });
  });

  app.options('*', (req: Request, res: Response) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, x-session-id, x-api-key');
    res.sendStatus(200);
  });

  const cleanup = (): void => {
    console.log(chalk.yellow('\n🧹 Cleaning up sessions...'));
    const spinner: Ora = ora('Stopping sessions').start();
    
    let cleaned = 0;
    activeSessions.forEach((session) => {
      session.cleanup();
      cleaned++;
    });
    
    spinner.succeed(`Cleaned up ${cleaned} sessions`);
    console.log(chalk.green('👋 Goodbye!'));
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  const server = app.listen(PORT, () => {
    displayServerInfo(PORT, command, args);
  });

  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use. Try a different port with --port`);
    } else {
      logger.error(`Server error: ${error.message}`);
    }
    process.exit(1);
  });
};

export default mcpProxy;