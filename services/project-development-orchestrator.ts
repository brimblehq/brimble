import chalk from "chalk";
import { buildScript } from "./build";
import { ProcessExecutionOptions, RunningProcess } from "../types/start-script.types";
import { DevelopmentProcessSpawner } from "./development-process-spawner";
import { FileChangeWatcher } from "./file-change-watcher";
import { StaticContentServer } from "./static-content-server";

export class ProjectDevelopmentOrchestrator {
  static async startDevelopmentServer(
    options: ProcessExecutionOptions,
    previousProcess?: RunningProcess
  ): Promise<void> {
    if (previousProcess) {
      this.cleanupPreviousProcess(previousProcess);
    }

    if (options.projectConfig.buildCommand) {
      await this.buildProject(options);
    }

    if (options.projectConfig.startCommand) {
      await this.startCustomDevelopmentServer(options);
    } else if (options.serverConfig.outputDirectory) {
      await this.startStaticServer(options);
    } else {
      this.handleMissingConfiguration(options.projectDirectory);
    }
  }

  private static cleanupPreviousProcess(previousProcess: RunningProcess): void {
    if (previousProcess.kill) {
      previousProcess.kill();
    }
    if (previousProcess.close) {
      previousProcess.close();
    }
  }

  private static async buildProject(options: ProcessExecutionOptions): Promise<void> {
    if (!options.projectConfig.buildCommand) return;

    await buildScript({
      _build: options.projectConfig.buildCommand,
      buildArgs: options.projectConfig.buildArguments || [],
      dir: options.projectDirectory,
    });
  }

  private static async startCustomDevelopmentServer(
    options: ProcessExecutionOptions
  ): Promise<void> {
    if (!options.projectConfig.startCommand) return;

    const developmentProcess = DevelopmentProcessSpawner.spawnDevelopmentProcess(
      options.projectConfig.startCommand,
      options.projectConfig.startArguments || [],
      options.projectDirectory,
      {
        PORT: options.serverConfig.port.toString(),
        HOST: options.serverConfig.host,
      }
    );

    DevelopmentProcessSpawner.setupProcessOutputHandlers(
      developmentProcess,
      async (url: string, port: number) => {
        console.log(`Development server started at: ${url}`);

        if (options.serverConfig.shouldOpenBrowser) {
          const open = require("better-opn");
          open(url);
        }
      },
      async (processId: string) => {
        if (options.serverConfig.shouldWatch) {
          FileChangeWatcher.startWatching(
            options,
            developmentProcess,
            this.startDevelopmentServer.bind(this)
          );
        }
      }
    );
  }

  private static async startStaticServer(options: ProcessExecutionOptions): Promise<void> {
    const staticServer = await StaticContentServer.serveStaticContent(
      options.projectDirectory,
      options.serverConfig
    );

    if (options.serverConfig.shouldWatch) {
      FileChangeWatcher.startWatching(
        options,
        staticServer,
        this.startDevelopmentServer.bind(this)
      );
    }
  }

  private static handleMissingConfiguration(projectDirectory: string): void {
    console.error(
      chalk.red(
        `Start failed with error: This folder ("${projectDirectory}") doesn't contain index.html`
      )
    );
    process.exit(1);
  }
}
