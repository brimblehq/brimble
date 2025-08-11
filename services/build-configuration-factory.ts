import { CommandParser } from "../helpers/command-parser";
import { IOption } from "../types";
import { ResolvedProjectCommands, ProjectBuildConfiguration } from "../types/server-config";

export class BuildConfigurationFactory {
  static createBuildConfiguration(
    resolvedCommands: ResolvedProjectCommands,
    options: IOption
  ): ProjectBuildConfiguration {
    const installCommand = CommandParser.parseCommand(resolvedCommands.installCommand);
    const buildCommand = CommandParser.parseCommand(resolvedCommands.buildCommand);
    const startCommand = CommandParser.parseCommand(resolvedCommands.startCommand);

    // Add install-specific arguments
    const enhancedInstallArgs = this.enhanceInstallArguments(
      installCommand.arguments,
      installCommand.binaryName,
      options.modulesFolder
    );

    return {
      installBinary: installCommand.binaryName,
      installArguments: enhancedInstallArgs,
      buildBinary: buildCommand.binaryName,
      buildArguments: buildCommand.arguments,
      startBinary: startCommand.binaryName,
      startArguments: startCommand.arguments,
    };
  }

  private static enhanceInstallArguments(
    baseInstallArgs: string[],
    installBinary: string,
    modulesFolder?: string
  ): string[] {
    const enhancedArgs = [...baseInstallArgs];

    if (modulesFolder) {
      const isYarnInstall = installBinary.includes("yarn");
      enhancedArgs.push(
        isYarnInstall
          ? `--modules-folder ${modulesFolder}/node_modules`
          : `--prefix ${modulesFolder}`
      );
    }

    enhancedArgs.push("--ignore-scripts");
    return enhancedArgs;
  }
}
