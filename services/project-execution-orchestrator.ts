import { IOption } from "../types";
import { serveStack } from "../services";
import { startProjectDevelopmentServer } from "../services/start";
import { installScript } from "../services/install";
import { buildScript } from "../services/build";
import { ProjectBuildConfiguration, ProjectServerConfig } from "../types/server-config";

export class ProjectExecutionOrchestrator {
  static async executeProjectAction(
    projectDirectory: string,
    buildConfig: ProjectBuildConfiguration,
    serverConfig: ProjectServerConfig,
    options: IOption
  ): Promise<void> {
    const shouldRunCompleteStack = this.shouldRunCompleteStack(options);
    const shouldRunInstallOnly = options.install && !options.build && !options.start;
    const shouldRunBuildOnly = options.build && !options.install && !options.start;

    if (shouldRunCompleteStack) {
      serveStack(
        projectDirectory,
        {
          install: buildConfig.installBinary,
          installArgs: buildConfig.installArguments,
          build: buildConfig.buildBinary,
          buildArgs: buildConfig.buildArguments,
          start: buildConfig.startBinary,
          startArgs: buildConfig.startArguments,
        },
        {
          outputDirectory: serverConfig.outputDirectory,
          isOpen: serverConfig.shouldOpenBrowser,
          port: serverConfig.port,
          host: serverConfig.host,
          watch: serverConfig.shouldWatch,
        }
      );
    } else if (shouldRunInstallOnly) {
      await installScript({
        _install: buildConfig.installBinary,
        installArgs: buildConfig.installArguments,
        dir: projectDirectory,
      });
      process.exit(0);
    } else if (shouldRunBuildOnly) {
      await buildScript({
        _build: buildConfig.buildBinary,
        buildArgs: buildConfig.buildArguments,
        dir: projectDirectory,
      });
      process.exit(0);
    } else {
      startProjectDevelopmentServer(
        projectDirectory,
        {
          startCommand: buildConfig.startBinary,
          startArguments: buildConfig.startArguments,
        },
        {
          outputDirectory: serverConfig.outputDirectory,
          shouldOpenBrowser: serverConfig.shouldOpenBrowser,
          port: serverConfig.port,
          host: serverConfig.host,
          shouldWatch: serverConfig.shouldWatch,
        }
      );
    }
  }

  private static shouldRunCompleteStack(options: IOption): boolean {
    const allOptionsSpecified = options.install && options.build && options.start;
    const noOptionsSpecified = !options.install && !options.build && !options.start;
    return allOptionsSpecified || noOptionsSpecified;
  }
}
