import inquirer from "inquirer";
import { IOption } from "../types";
import { RuntimeDetector } from "./runtime-detector";
import { ResolvedProjectCommands } from "../types/server-config";
import { CommandParser } from "../helpers/command-parser";

export class ProjectCommandResolver {
  async resolveProjectCommands(
    frameworkSettings: any,
    projectFiles: string[],
    options: IOption
  ): Promise<ResolvedProjectCommands> {
    const runtime = RuntimeDetector.detectPackageManager(projectFiles, {
      useBun: options.useBun,
    });

    let defaultCommands = RuntimeDetector.adaptCommandsForRuntime(
      {
        install: frameworkSettings?.installCommand,
        build: frameworkSettings?.buildCommand,
        start: frameworkSettings?.startCommand,
      },
      runtime
    );

    const shouldPromptForCommands = this.shouldPromptUser(options);
    const interactiveAnswers = await this.promptForMissingCommands(
      defaultCommands,
      options,
      shouldPromptForCommands,
      frameworkSettings?.outputDirectory
    );

    return {
      installCommand:
        CommandParser.selectPreferredCommand(
          options.installCommand,
          interactiveAnswers.installCommand ?? defaultCommands.install
        ) || "",
      buildCommand:
        CommandParser.selectPreferredCommand(
          options.buildCommand,
          interactiveAnswers.buildCommand ?? defaultCommands.build
        ) || "",
      startCommand:
        CommandParser.selectPreferredCommand(
          options.startCommand,
          interactiveAnswers.startCommand ?? defaultCommands.start
        ) || "",
      outputDirectory:
        options.outputDirectory ||
        interactiveAnswers.outputDirectory ||
        frameworkSettings?.outputDirectory ||
        "dist",
    };
  }

  private shouldPromptUser(options: IOption): boolean {
    const allCommandsSpecified = options.install && options.build && options.start;
    const noCommandsSpecified = !options.install && !options.build && !options.start;
    return allCommandsSpecified || noCommandsSpecified;
  }

  private async promptForMissingCommands(
    defaultCommands: { install: string; build?: string; start?: string },
    options: IOption,
    shouldPrompt: boolean,
    defaultOutputDirectory?: string
  ) {
    return inquirer.prompt([
      {
        name: "installCommand",
        message: "Install command",
        default: defaultCommands.install,
        when: !options.installCommand && (shouldPrompt || !!options.install),
      },
      {
        name: "buildCommand",
        message: "Build command",
        default: defaultCommands.build,
        when: !options.buildCommand && (shouldPrompt || !!options.build),
      },
      {
        name: "startCommand",
        message: "Start command",
        default: defaultCommands.start,
        when: !!defaultCommands.start && !options.startCommand && (shouldPrompt || !!options.start),
      },
      {
        name: "outputDirectory",
        message: "Output directory",
        default: defaultOutputDirectory,
        when:
          !!defaultOutputDirectory && !options.outputDirectory && (shouldPrompt || !!options.start),
      },
    ]);
  }
}
