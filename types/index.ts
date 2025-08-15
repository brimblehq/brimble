import { MCPSession } from "../commands/mcp/session";
import { Request } from "express";
export type IOption = {
  port?: number;
  host?: string;
  open?: boolean;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  start?: boolean;
  useBun?: boolean;
  watch?: boolean;
  install?: boolean;
  build?: boolean;
  modulesFolder?: string;
  reusePort?: boolean;
};

export type MCPMessage = {
  result?: Record<string, any>;
  id: number | string | null;
  jsonrpc: string;
  method?: string;
  params?: any;
  error?: {
    code: number;
    message: string;
  };
};

export type MCPConfig = {
  examples: any;
  verbose: boolean;
  quiet: boolean;
  color: boolean;
  command: any;
  mode: any;
  interactive: boolean;
  port: string;
  host?: string;
  open?: boolean;
};

export type GlobalConfig = {
  verbose: boolean;
  quiet: boolean;
  color: boolean;
  spawnCommand?: string;
  spawnArgs?: string[];
};

export type SessionStats = {
  id: string;
  pid?: number;
  uptime: string;
  messages: number;
  initialized: boolean;
  alive: boolean;
};

export interface ExtendedRequest extends Request {
  mcpSession?: MCPSession;
}
