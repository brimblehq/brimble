export interface ProjectStartConfiguration {
  buildCommand?: string;
  buildArguments?: string[];
  startCommand?: string;
  startArguments?: string[];
}

export interface DevelopmentServerConfig {
  outputDirectory?: string;
  port: number;
  host: string;
  shouldOpenBrowser?: boolean;
  shouldWatch?: boolean;
}

export interface ProcessExecutionOptions {
  projectDirectory: string;
  projectConfig: ProjectStartConfiguration;
  serverConfig: DevelopmentServerConfig;
}

export interface RunningProcess {
  kill?: () => void;
  close?: () => void;
}

export interface ProcessInfo {
  pid: string;
  port: number;
}
