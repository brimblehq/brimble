import spawn from "cross-spawn";
import chalk from "chalk";
import { ChildProcess } from "child_process";
import { ContainerEnvironmentDetector } from "./container-environment-detector";
import { ProcessMonitor } from "./process-monitor";

export class DevelopmentProcessSpawner {
  static spawnDevelopmentProcess(
    command: string,
    commandArguments: string[],
    workingDirectory: string,
    environmentVariables: Record<string, string>
  ): ChildProcess {
    return spawn(command, commandArguments, {
      cwd: workingDirectory,
      shell: true,
      env: { ...process.env, ...environmentVariables },
    });
  }

  static setupProcessOutputHandlers(
    childProcess: ChildProcess,
    onUrlDetected: (url: string, port: number) => Promise<void>,
    onProcessReady: (processId: string) => Promise<void>
  ): void {
    let hasFoundPort = false;

    childProcess.stdout?.on("data", async data => {
      const message = data.toString();

      if (hasFoundPort) {
        console.log(chalk.green(message));
        return;
      }

      const detectedUrls = ProcessMonitor.extractUrlFromMessage(message);

      if (detectedUrls.length > 0) {
        console.log(chalk.green(message));

        const port = ProcessMonitor.extractPortFromUrl(detectedUrls[0]);
        if (port) {
          await onUrlDetected(detectedUrls[0], port);
          const processId = await ProcessMonitor.findProcessByPort(port);

          if (processId) {
            console.log(`\nPID: ${processId}`);
            hasFoundPort = true;
            await onProcessReady(processId);
          }
        }
      } else if (ContainerEnvironmentDetector.isRunningInContainer()) {
        await this.handleContainerEnvironment(onProcessReady);
        hasFoundPort = true;
      } else {
        console.log(chalk.green(message));
      }
    });

    childProcess.stderr?.on("data", data => {
      console.log(chalk.red(data.toString()));
    });

    childProcess.on("close", exitCode => {
      if (exitCode !== 0) {
        console.error(chalk.red(`Process failed with code ${exitCode}`));
        process.exit(1);
      }
    });

    childProcess.on("error", error => {
      console.error(chalk.red(`Process error: ${error.message}`));
      process.exit(1);
    });
  }

  private static async handleContainerEnvironment(
    onProcessReady: (processId: string) => Promise<void>
  ): Promise<void> {
    const listeningPorts = await ProcessMonitor.findListeningPorts();

    if (listeningPorts.length > 0) {
      const port = listeningPorts[0];
      console.log(`http://0.0.0.0:${port}`);
      await onProcessReady(`container-${port}`);
    }
  }
}
