import { ParsedCommand } from "../types/server-config";

export class CommandParser {
  static parseCommand(commandString?: string): ParsedCommand {
    if (!commandString?.trim()) {
      return { binaryName: "", arguments: [] };
    }
    const commandParts = commandString.trim().split(/\s+/);
    const [binaryName, ...args] = commandParts;

    return {
      binaryName: binaryName || "",
      arguments: args,
    };
  }

  static selectPreferredCommand(
    preferredCommand?: string,
    fallbackCommand?: string
  ): string | undefined {
    return preferredCommand ?? fallbackCommand;
  }
}
