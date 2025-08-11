import {
  ProjectStartConfiguration,
  DevelopmentServerConfig,
  RunningProcess,
  ProcessExecutionOptions,
} from "../types/start-script.types";
import { ProjectDevelopmentOrchestrator } from "./project-development-orchestrator";

export const startProjectDevelopmentServer = async (
  projectDirectory: string,
  projectConfig: ProjectStartConfiguration,
  serverConfig: DevelopmentServerConfig,
  previousProcess?: RunningProcess
): Promise<void> => {
  const executionOptions: ProcessExecutionOptions = {
    projectDirectory,
    projectConfig,
    serverConfig,
  };

  await ProjectDevelopmentOrchestrator.startDevelopmentServer(executionOptions, previousProcess);
};
