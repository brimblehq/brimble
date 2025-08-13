import { IFramework } from "@brimble/models/dist/types";

export interface DetectFrameworkResponse {
  message: string;
  data: IFramework;
}
export interface ParsedCommand {
  binaryName: string;
  arguments: string[];
}

export interface ResolvedProjectCommands {
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDirectory: string;
}

export interface ProjectBuildConfiguration {
  installBinary: string;
  installArguments: string[];
  buildBinary: string;
  buildArguments: string[];
  startBinary: string;
  startArguments: string[];
  outputDirectory?: string;
}

export interface StaticServerConfig {
  port: number;
  host: string;
  directory: string;
  shouldOpenBrowser?: boolean;
}

export interface ProjectServerConfig extends StaticServerConfig {
  outputDirectory: string;
  shouldWatch: boolean;
}
