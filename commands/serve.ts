import chalk from "chalk";
import path from "path";
import getPort from "get-port";
import { log, detectFramework } from "@brimble/utils";
import { dirValidator, FEEDBACK_MESSAGE } from "../helpers";
import { IOption } from "../types";
import { BuildConfigurationFactory } from "../services/build-configuration-factory";
import { FrameworkConfigurationAdapter } from "../services/framework-configuration-adapter";
import { ProjectCommandResolver } from "../services/project-command-resolver";
import { ProjectExecutionOrchestrator } from "../services/project-execution-orchestrator";
import { StaticFileServer } from "../services/static-file-server";
import { DetectFrameworkResponse, ProjectServerConfig } from "../types/server-config";
import axios from "axios";
import { IFramework } from "@brimble/models";

export const serveProject = async (targetDirectory: string = ".", options: IOption) => {
  try {
    const { folder: validatedProjectDirectory, files: projectFiles } =
      dirValidator(targetDirectory);
    const serverPort = await getPort({
      port: Number(options.port || process.env.PORT) || undefined,
    });
    const serverHost = options.host || "0.0.0.0";

    if (projectFiles.includes("package.json")) {
      await handleNodeJsProject(
        validatedProjectDirectory,
        projectFiles,
        options,
        serverPort,
        serverHost
      );
    } else if (projectFiles.includes("index.html")) {
      StaticFileServer.createServer({
        port: serverPort,
        host: serverHost,
        directory: validatedProjectDirectory,
        shouldOpenBrowser: options.open,
      });
    } else {
      throw new Error(
        `This folder ("${targetDirectory}") doesn't contain index.html or package.json`
      );
    }
  } catch (error) {
    const { message } = error as Error;
    log.error(chalk.red(`Start failed with error: ${message}`));
    log.info(chalk.greenBright(FEEDBACK_MESSAGE));
    process.exit(1);
  }
};

async function detectProjectFramework(body: Record<any, any>): Promise<IFramework> {
  try {
    const response = await axios.post<DetectFrameworkResponse>(
      "https://core.brimble.io/v1/frameworks?type=packageJson",
      body
    );

    return response.data.data;
  } catch (error) {
    return detectFramework(body) as IFramework;
  }
}

async function handleNodeJsProject(
  projectDirectory: string,
  projectFiles: string[],
  options: IOption,
  serverPort: number,
  serverHost: string
): Promise<void> {
  const packageJsonPath = path.resolve(projectDirectory, "package.json");
  const packageJson = require(packageJsonPath);
  const detectedFramework = await detectProjectFramework(packageJson);

  const commandResolver = new ProjectCommandResolver();
  const resolvedCommands = await commandResolver.resolveProjectCommands(
    detectedFramework?.settings,
    projectFiles,
    options
  );

  let buildConfiguration = BuildConfigurationFactory.createBuildConfiguration(
    resolvedCommands,
    options
  );

  buildConfiguration = FrameworkConfigurationAdapter.adaptConfigurationForFramework(
    detectedFramework?.slug,
    buildConfiguration,
    projectDirectory,
    resolvedCommands.outputDirectory
  );

  const serverConfiguration: ProjectServerConfig = {
    port: serverPort,
    host: serverHost,
    directory: projectDirectory,
    outputDirectory: resolvedCommands.outputDirectory,
    shouldOpenBrowser: options.open ?? false,
    shouldWatch: options.watch ?? false,
  };

  await ProjectExecutionOrchestrator.executeProjectAction(
    projectDirectory,
    buildConfiguration,
    serverConfiguration,
    options
  );
}

export default serveProject;
