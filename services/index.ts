import { startProjectDevelopmentServer } from "./start";
import { installScript } from "./install";
import { ProjectStartConfiguration } from "../types/start-script.types";

export const serveStack = async (
  dir: string,
  ci: {
    install: string;
    build: string;
    start?: string;
    installArgs: string[];
    buildArgs: string[];
    startArgs?: any;
  },
  server: {
    outputDirectory?: string;
    port: number;
    host: string;
    isOpen?: boolean;
    watch?: boolean;
  }
) => {
  await installScript({
    _install: ci.install,
    installArgs: ci.installArgs,
    dir,
  });

  const projectConfig: ProjectStartConfiguration = {
    startCommand: ci.start,
    startArguments: ci.startArgs,
    buildCommand: ci.build,
    buildArguments: ci.buildArgs,
  };

  startProjectDevelopmentServer(dir, projectConfig, server);
};
