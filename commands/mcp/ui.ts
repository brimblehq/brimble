import chalk from "chalk";
import boxen from "boxen";
import inquirer from "inquirer";

export function displayBanner(quiet: boolean): void {
  if (quiet) return;

  console.log(
    chalk.cyan.bold(
      "╔══════════════════════════════════════════════════════════╗\n" +
        "║                                                          ║\n" +
        "║                     BRIMBLE MCP PROXY                    ║\n" +
        "║                                                          ║\n" +
        "╚══════════════════════════════════════════════════════════╝"
    )
  );

  console.log(chalk.gray("  MCP Proxy Server\n"));
}

export function displayServerInfo(port: number, command: string, args: string[]): void {
  const info = boxen(
    `${chalk.green("🚀 Server Started")}\n\n` +
      `${chalk.blue("Port:")} ${chalk.yellow(port)}\n` +
      `${chalk.blue("Command:")} ${chalk.cyan(command)} ${chalk.gray(args.join(" "))}\n\n` +
      `${chalk.blue("Endpoints:")}\n` +
      `  📡 Host: ${chalk.underline(`http://localhost:${port}`)}\n` +
      `  🏥 Health: ${chalk.underline(`http://localhost:${port}/health`)}\n` +
      `${chalk.gray("Press Ctrl+C to stop")}`,
    {
      padding: 1,
      margin: 1,
      borderColor: "green",
    }
  );

  console.log(info);
}

export function showExamples(): void {
  displayBanner(false);

  console.log(
    boxen(
      `${chalk.blue.bold("Usage Examples")}` +
        `\n\n${chalk.yellow("Start MCP proxy:")}` +
        `\n  brimble mcp start --command \"node ./dist/index.js\"` +
        `\n\n${chalk.yellow("Interactive setup:")}` +
        `\n  brimble mcp interactive` +
        `\n\n${chalk.blue.bold("Notes:")}` +
        `\n  • Proxy always runs on port 5000+ (auto-detected)`,
      {
        padding: 1,
        margin: 1,
        borderColor: "blue",
      }
    )
  );
}

export async function promptForConfig(
  commandStr: string | undefined,
  port: number,
  verbose: boolean
): Promise<{
  command: string;
  port: number;
  verbose: boolean;
  start: boolean;
}> {
  const questions = [
    {
      type: "input",
      name: "command",
      message: "Enter the command to run your MCP server:",
      default: commandStr,
      validate: (input: string) => (input.trim() ? true : "Command cannot be empty"),
    },
    {
      type: "input",
      name: "port",
      message: "Enter the port to start the server:",
      default: port,
      validate: (input: string) => {
        const portNum = parseInt(input);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          return "Port must be a number between 1 and 65535";
        }
        return true;
      },
    },
    {
      type: "confirm",
      name: "verbose",
      message: "Enable verbose logging?",
      default: verbose,
    },
    {
      type: "confirm",
      name: "start",
      message: (answers: any) =>
        `Start server with: ${chalk.cyan(answers.command)} on port ${chalk.yellow(answers.port)}?`,
      default: true,
    },
  ];

  return await inquirer.prompt(questions);
}
