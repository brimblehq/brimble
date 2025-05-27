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
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';

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
  hasSSE?: boolean;
  ssePort?: number;
  sseEndpoint?: string;
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

function createErrorResponse(code: number, message: string, id: string | number | null = null): MCPMessage {
  return {
    jsonrpc: "2.0",
    error: {
      code,
      message
    },
    id
  };
}

async function verifyApiKey(apiKey: string, ownerId: string): Promise<void> {
  if (!apiKey) {
    throw new Error("Unauthorized: x-api-key header is required");
  }

  try {
    await axios.post(`https://core.brimble.io/v1/api-key/validate`, {
      apiKey,
      ownerId,
    });
  } catch (error) {
    throw new Error('Invalid API key');
  }
}

function getSessionKey(sessionId: string, apiKey: string): string {
  return `${sessionId}-${apiKey.slice(-8)}`;
}

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
  public globalConfig: GlobalConfig;
  private stdoutBuffer: string = '';
  private stderrBuffer: string = '';

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
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
  }

  isValidJSON(str: string): boolean {
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }

  startMCPProcess(command: string, args: string[]): void {
    const sessionSpinner: Ora = ora({
      text: `Starting MCP process: ${chalk.cyan(command)} ${chalk.gray(args.join(' '))}`,
      spinner: 'dots'
    }).start();

    try {
      this.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: this.globalConfig.color ? '1' : '0'
        }
      });

      sessionSpinner.succeed(
        `Process started ${chalk.green('✓')} PID: ${chalk.yellow(this.process.pid)}`
      );

      this.setupProcessHandlers();
      
      if (this.globalConfig.verbose) {
        logger.info(`Session ${chalk.magenta(this.id.slice(0, 8))} created for process ${this.process.pid}`);
      }

    } catch (error: any) {
      sessionSpinner.fail(`Failed to start process: ${error.message}`);
      throw error;
    }
  }

  setupProcessHandlers(): void {
    if (!this.process) return;

    const processBuffer = (buffer: string, source: 'stdout' | 'stderr'): string => {
      let remainingBuffer = buffer;
      const lines = buffer.split('\n');
      
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (this.isValidJSON(line)) {
          try {
            const response: MCPMessage = JSON.parse(line);
            this.handleMCPResponse(response);
            this.messageCount++;
            
            if (this.globalConfig.verbose) {
              logger.debug(`📥 Received from ${source}: ${chalk.gray(JSON.stringify(response, null, 2))}`);
            }
          } catch (error: any) {
            logger.error(`Failed to parse MCP response from ${source}: ${error.message}`);
          }
        } else {
          if (line.includes('✅ Stripe MCP Server running on stdio')) {
            if (this.globalConfig.verbose) {
              logger.info(`📢 Server ready: ${chalk.green(line)}`);
            }
          } else if (line.includes('🚨') || line.toLowerCase().includes('error')) {
            logger.warn(`🔴 MCP Server Error: ${chalk.red(line)}`);
          } else if (this.globalConfig.verbose) {
            logger.info(`📢 Server (${source}): ${chalk.italic(line)}`);
          }
        }
      }
      
      return lines[lines.length - 1] || '';
    };

    this.process.stdout?.on('data', (data: Buffer) => {
      this.stdoutBuffer += data.toString();
      this.stdoutBuffer = processBuffer(this.stdoutBuffer, 'stdout');
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.stderrBuffer += data.toString();
      this.stderrBuffer = processBuffer(this.stderrBuffer, 'stderr');
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
    if (this.globalConfig.verbose) {
      logger.debug(`🎯 Handling response: ID=${response.id} (type=${typeof response.id}), Method=${response.method}`);
    }
    
    if (response.id !== undefined && response.id !== null && this.responseCallbacks.has(response.id)) {
      const callback = this.responseCallbacks.get(response.id);
      if (callback) {
        this.responseCallbacks.delete(response.id);
        callback(response);
        if (this.globalConfig.verbose) {
          logger.debug(`✅ Successfully delivered response for ID: ${response.id}`);
        }
      }
    } else {
      if (this.globalConfig.verbose) {
        logger.debug(`❌ No callback found for response ID: ${response.id} (type=${typeof response.id})`);
        logger.debug(`📋 Active callbacks: ${Array.from(this.responseCallbacks.keys()).join(', ')}`);
      }
    }
  }

  sendMessage(message: MCPMessage): Promise<MCPMessage> {
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

      if (this.globalConfig.verbose) {
        logger.debug(`📤 Sent: ${chalk.gray(messageStr)}`);
      }

      const getTimeoutForMethod = (method?: string): number => {
        if (!method) return 30000;
        
        if (method.includes('tools/list') || method.includes('tools/call')) {
          return 120000;
        }
        if (method.includes('resources/') || method.includes('prompts/')) {
          return 60000;
        }
        return 30000;
      };

      const timeoutMs = getTimeoutForMethod(message.method);
      
      const timeoutId = setTimeout(() => {
        if (message.id && this.responseCallbacks.has(message.id)) {
          this.responseCallbacks.delete(message.id);
          reject(new Error(`Request timeout after ${timeoutMs/1000}s for method: ${message.method}`));
        }
      }, timeoutMs);

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

  async initialize(params: any): Promise<MCPMessage> {
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

      const response = await this.sendMessage(initMessage);
      this.initialized = true;
      this.initResponse = response;
      
      initSpinner.succeed(`MCP session initialized ${chalk.green('✓')}`);
      
      if (this.globalConfig.verbose && response.result) {
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

  async callMethod(method: string, params: any = {}): Promise<MCPMessage> {
    if (!this.initialized && method !== 'initialize') {
      throw new Error('Server not initialized');
    }

    const message: MCPMessage = {
      jsonrpc: "2.0",
      id: this.currentMessageId++,
      method,
      params
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

async function detectSSECapabilities(command: string, args: string[], options: MCPOptions): Promise<{ hasSSE: boolean; port?: number; endpoint?: string }> {
  return new Promise((resolve) => {
    logger.info(`🔍 Checking if MCP server has SSE capabilities...`);
    
    const tempProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let hasDetectedSSE = false;
    let ssePort: number | undefined;
    let sseEndpoint: string | undefined;
    
    const timeout = setTimeout(() => {
      if (!hasDetectedSSE) {
        tempProcess.kill();
        resolve({ hasSSE: false });
      }
    }, 5000); 

    const checkOutput = (data: Buffer, source: 'stdout' | 'stderr') => {
      const output = data.toString();
      
      const ssePatterns = [
        /server.*running.*(?:on|at).*(?:port\s*)?(\d+)/i,
        /listening.*(?:on|at).*(?:port\s*)?(\d+)/i,
        /sse.*server.*(?:port\s*)?(\d+)/i,
        /http.*server.*(?:port\s*)?(\d+)/i,
        /server.*started.*(?:port\s*)?(\d+)/i
      ];

      const endpointPatterns = [
        /endpoint.*['"](\/[^'"]*mcp[^'"]*)['"]/i,
        /path.*['"](\/[^'"]*mcp[^'"]*)['"]/i,
        /route.*['"](\/[^'"]*mcp[^'"]*)['"]/i
      ];

      for (const pattern of ssePatterns) {
        const match = output.match(pattern);
        if (match && match[1]) {
          hasDetectedSSE = true;
          ssePort = parseInt(match[1]) || Number(options.port);
          logger.info(`✅ Detected SSE server on port ${ssePort}`);
          break;
        }
      }

      for (const pattern of endpointPatterns) {
        const match = output.match(pattern);
        if (match && match[1]) {
          sseEndpoint = match[1];
          logger.info(`✅ Detected SSE endpoint: ${sseEndpoint}`);
          break;
        }
      }

      if (hasDetectedSSE) {
        clearTimeout(timeout);
        tempProcess.kill();
        resolve({ 
          hasSSE: true, 
          port: ssePort, 
          endpoint: sseEndpoint || '/mcp' 
        });
      }
    };

    tempProcess.stdout?.on('data', (data) => checkOutput(data, 'stdout'));
    tempProcess.stderr?.on('data', (data) => checkOutput(data, 'stderr'));

    tempProcess.on('exit', () => {
      if (!hasDetectedSSE) {
        clearTimeout(timeout);
        resolve({ hasSSE: false });
      }
    });

    tempProcess.on('error', () => {
      clearTimeout(timeout);
      resolve({ hasSSE: false });
    });
  });
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

function parseCommand(commandStr: string): { command: string; args: string[] } {
  const parts = commandStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const command = parts[0]?.replace(/['"]/g, '') || '';
  const args = parts.slice(1).map(arg => arg.replace(/['"]/g, ''));
  
  return { command, args };
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
    `\n\n${chalk.yellow('Stripe MCP Server:')}` +
    `\n  brimble mcp start --command \"node stripe-mcp/dist/index.js --tools=all --api-key=sk_test_...\"` +
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
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const ownerId = req.headers['x-owner-id'] as string;

    await verifyApiKey(apiKey, ownerId);

    const sessionId = (req.headers['x-session-id'] as string) || (req.query.session as string) || 'default';
    const sessionKey = getSessionKey(sessionId, apiKey);
    
    if (!activeSessions.has(sessionKey)) {
      try {
        const session = new MCPSession({}, globalConfig);
        if (globalConfig.spawnCommand && globalConfig.spawnArgs) {
          session.startMCPProcess(globalConfig.spawnCommand, globalConfig.spawnArgs);
        }
        activeSessions.set(sessionKey, session);
      } catch (error: any) {
        logger.error(`Failed to create session: ${error.message}`);
        res.status(500).json(createErrorResponse(-32000, `Failed to create session: ${error.message}`));
        return;
      }
    }
    
    req.mcpSession = activeSessions.get(sessionKey);
    next();
  } catch (error: any) {
    res.status(401).json(createErrorResponse(-32000, `Authentication error: ${error.message}`));
  }
}

const activeSessions = new Map<string, MCPSession>();

const mcpProxy = async (options: MCPOptions): Promise<void> => {
  if (options.examples) {
    showExamples();
    return;
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

  const sseDetection = await detectSSECapabilities(command, args, options);
  globalConfig.hasSSE = sseDetection.hasSSE;
  globalConfig.ssePort = sseDetection.port;
  globalConfig.sseEndpoint = sseDetection.endpoint;

  if (globalConfig.hasSSE) {
    logger.info(`🔗 Detected SSE-enabled MCP server, will proxy to ${chalk.cyan(`http://localhost:${globalConfig.ssePort}${globalConfig.sseEndpoint}`)}`);
  } else {
    logger.info(`📡 Standard MCP server detected, using stdio proxy mode`);
  }
  
  displayBanner(globalConfig.quiet);

  const app: Express = express();
  const PORT = parseInt(options.port || '3001');

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
    try {
      if (globalConfig.hasSSE) {
        const apiKey = req.headers['x-api-key'] as string;
        const ownerId = req.headers['x-owner-id'] as string;
        verifyApiKey(apiKey, ownerId);
        next();
      } else {
        getSession(req, res, next, globalConfig);
      }
    } catch (error: any) {
      res.status(401).json(createErrorResponse(-32000, "Unauthorized: check your x-api-key header"));
    }
  };

  if (globalConfig.hasSSE && globalConfig.ssePort && globalConfig.sseEndpoint) {
    logger.info(`🚀 Starting SSE-enabled MCP server...`);
    
    const mcpProcess = spawn(globalConfig.spawnCommand!, globalConfig.spawnArgs!, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    mcpProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output && !globalConfig.quiet) {
        logger.info(`📢 MCP Server: ${chalk.italic(output)}`);
      }
    });

    mcpProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        if (output.includes('error') || output.includes('Error')) {
          logger.warn(`🔴 MCP Server: ${chalk.red(output)}`);
        } else if (!globalConfig.quiet) {
          logger.info(`📢 MCP Server: ${chalk.italic(output)}`);
        }
      }
    });

    mcpProcess.on('exit', (code) => {
      logger.error(`💥 MCP Server process exited with code ${code}`);
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const proxyMiddleware = createProxyMiddleware({
      target: `http://localhost:${globalConfig.ssePort}`,
      changeOrigin: true,
      pathRewrite: {
        '^/mcp': globalConfig.sseEndpoint
      },
      on: {
        proxyReq: (proxyReq: any, req: any) => {
          if (globalConfig.verbose) {
            logger.debug(`🔄 Proxying ${req.method} ${req.url} to MCP server`);
          }
        },
        error: (err: any, req: any, res: any) => {
          logger.error(`Proxy error: ${err.message}`);
          if (!res.headersSent) {
            res.status(502).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: `Proxy error: ${err.message}`
              },
              id: null
            });
          }
        },
      },
    });

    app.all('/mcp', sessionMiddleware, proxyMiddleware);
    
    const cleanup = (): void => {
      console.log(chalk.yellow('\n🧹 Stopping MCP server...'));
      mcpProcess.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } else {
    app.all('/mcp', sessionMiddleware, async (req: ExtendedRequest, res: Response) => {
      const startTime = Date.now();
      
      try {
        let response: MCPMessage;
        const { method, params = {}, id = null } = req.body || {};

        if (!method) {
          res.status(400).json(createErrorResponse(-32000, "Bad Request: Missing method", id));
          return;
        }

        logger.info(`📋 Processing ${chalk.cyan(method)} ${id ? `(id: ${id})` : ''}`);

        if (method === 'initialize') {
          response = await req.mcpSession!.initialize(params);
        } else if (commands.includes(method)) {
          response = await req.mcpSession!.callMethod(method, params);
        } else if (method.startsWith('custom/') || method.includes('/')) {
          response = await req.mcpSession!.callMethod(method, params);
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
        
        const errorResponse = createErrorResponse(
          -32000,
          error.message.includes('not initialized') 
            ? "Bad Request: Server not initialized"
            : `Internal error: ${error.message}`,
          req.body?.id || null
        );

        res.status(500).json(errorResponse);
      }
    });
  }

  app.get('/health', (req: Request, res: Response) => {
    const apiKey = req.headers['x-api-key'];
    
    if (globalConfig.hasSSE) {
      res.json({ 
        status: 'ok', 
        mode: 'sse',
        ssePort: globalConfig.ssePort,
        sseEndpoint: globalConfig.sseEndpoint,
        timestamp: new Date().toISOString(),
        authenticated: !!apiKey,
        version: '2.0.0'
      });
    } else {
      const sessions: any[] = [];
      
      activeSessions.forEach((session, key) => {
        sessions.push({
          key: key.split('-')[0],
          ...session.getStats()
        });
      });

      res.json({ 
        status: 'ok', 
        mode: 'stdio',
        activeSessions: activeSessions.size,
        sessions,
        timestamp: new Date().toISOString(),
        authenticated: !!apiKey,
        version: '2.0.0'
      });
    }
  });

  if (!globalConfig.hasSSE) {
    app.post('/debug/mcp', sessionMiddleware, async (req: ExtendedRequest, res: Response) => {
      try {
        const { method, params = {} } = req.body;
        const response = await req.mcpSession!.callMethod(method, params);
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
  }

  app.options('*', (req: Request, res: Response) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, x-session-id, x-api-key, x-owner-id');
    res.sendStatus(200);
  });

  const server = app.listen(PORT, () => {
    displayServerInfo(PORT, command, args);
    
    if (globalConfig.hasSSE) {
      console.log(chalk.blue(`🔗 Mode: SSE (forwarding to port ${globalConfig.ssePort})`));
    } else {
      console.log(chalk.blue('📡 Mode: Stdio'));
    }
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