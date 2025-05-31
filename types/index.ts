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
  port:  string;
  host?: string;
  open?: boolean;
};

