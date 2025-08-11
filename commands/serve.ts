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
import { buildScript } from "../services/build";
import { CommandParser } from "../helpers/command-parser";
import { DetectFrameworkResponse, ProjectServerConfig } from "../types/server-config";
import axios from "axios";
import { FrameworkApplicationType, IFramework } from "@brimble/models";

export const serveProject = async (targetDirectory: string = ".", options: IOption) => {
  try {
    const { folder: validatedProjectDirectory, files: projectFiles } = dirValidator(targetDirectory);

    const serverPort = await getPort({
      port: Number(options.port || process.env.PORT) || undefined,
    });

    const frameworksShouldBuild = [FrameworkApplicationType.Spa, FrameworkApplicationType.Static];

    let fileDataForDetection;

    const type = projectFiles.includes("package.json") ? 'packageJson' : 'files';

    if (projectFiles.includes("package.json")) {
      const packageJsonPath = path.resolve(validatedProjectDirectory, "package.json");
      fileDataForDetection = require(packageJsonPath);
    } else {
      fileDataForDetection = projectFiles;
    }

    const detectedFramework = await detectProjectFramework(fileDataForDetection, type);

    if (!frameworksShouldBuild.includes(detectedFramework.type) && detectedFramework.slug !== "nodejs") {
      throw new Error("Unsupported stack by the brimble builder");
    }

    const serverHost = options.host || "0.0.0.0";

    if (projectFiles.includes("package.json")) {
      await handleProjectProcess(
        validatedProjectDirectory,
        projectFiles,
        options,
        serverPort,
        serverHost,
        detectedFramework
      );
      return;
    }

    const frameworkFiles = detectedFramework.file_detectors;

    if (frameworkFiles.some(file => projectFiles.includes(file)) && detectedFramework.type === FrameworkApplicationType.Static) {
      const serveDirectory = await buildStaticApplication(validatedProjectDirectory, detectedFramework, options);

      const hasStartCommand = options.startCommand || detectedFramework.settings.startCommand;

      if(!hasStartCommand) process.exit(0);

      StaticFileServer.createServer({
        port: serverPort,
        host: serverHost,
        directory: serveDirectory,
        shouldOpenBrowser: options.open,
      });

      return;
    }

    throw new Error(`Brimble is unable to serve this project, it's unsupported currently`);
  } catch (error) {
    const { message } = error as Error;
    log.error(chalk.red(`Start failed with error: ${message}`));
    log.info(chalk.greenBright(FEEDBACK_MESSAGE));
    process.exit(1);
  }
};

async function buildStaticApplication(validatedProjectDirectory: string, detectedFramework: IFramework, options: IOption): Promise<string> {
  let serveDirectory = validatedProjectDirectory;

  const hasBuildCommand = options.buildCommand || detectedFramework?.settings?.buildCommand;

  if (hasBuildCommand) {
    const { binaryName, arguments: buildArgs } = CommandParser.parseCommand(
      options.buildCommand || detectedFramework.settings.buildCommand
    );

    if (binaryName) {
      await buildScript({ _build: binaryName, buildArgs, dir: validatedProjectDirectory });
    }

    const outputDir = options.outputDirectory || detectedFramework.settings.outputDirectory || "dist";
      
    serveDirectory = path.join(validatedProjectDirectory, outputDir);
  }

  return serveDirectory;
}

async function detectProjectFramework(body: Record<any, any>, type: 'files' | 'packageJson'): Promise<IFramework> {
  let framework: IFramework;
  try {
    const response = await axios.post<DetectFrameworkResponse>(
      `https://core.brimble.io/v1/frameworks?type=${type}`,
      { data: body },
      { timeout: 10000 }
    );

    framework = response.data.data;
  } catch (error) {
    framework = detectFramework(body) as IFramework;
  }

  if (framework.type === FrameworkApplicationType.Backend && framework.slug !== "nodejs") {
    throw new Error("Unsupported stack by the brimble builder");
  }

  return framework;
}

async function handleProjectProcess(
  projectDirectory: string,
  projectFiles: string[],
  options: IOption,
  serverPort: number,
  serverHost: string,
  detectedFramework: IFramework
): Promise<void> {
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
