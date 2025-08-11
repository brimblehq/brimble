import { MCPMessage } from "../types";

function parseCommand(commandStr: string): { command: string; args: string[] } {
  const shellOperators = ["&&", "||", "|", ">", "<", ";", "&"];
  const hasShellOperators = shellOperators.some(op => commandStr.includes(op));

  const hasEnvVars = /^\s*\w+=[^\s]*\s+/.test(commandStr);

  if (hasShellOperators || hasEnvVars) {
    const shell = process.platform === "win32" ? "cmd" : "/bin/sh";
    const shellFlag = process.platform === "win32" ? "/c" : "-c";

    return {
      command: shell,
      args: [shellFlag, commandStr],
    };
  }

  const parts = commandStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const command = parts[0]?.replace(/['"]/g, "") || "";
  const args = parts.slice(1).map(arg => arg.replace(/['"]/g, ""));

  return { command, args };
}

function createErrorResponse(
  code: number,
  message: string,
  id: string | number | null = null
): MCPMessage {
  return {
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id,
  };
}

export { createErrorResponse, parseCommand };
