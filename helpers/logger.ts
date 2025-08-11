import { createLogger } from "@brimble/utils";
import chalk from "chalk";
import { format, transports } from "winston";

export const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp({ format: "HH:mm:ss" }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const colorMap: Record<string, any> = {
        error: chalk.red,
        warn: chalk.yellow,
        info: chalk.blue,
        debug: chalk.gray,
      };
      const colorFn = colorMap[level] || chalk.white;
      return `${chalk.gray(timestamp)} ${colorFn(level.toUpperCase().padEnd(5))} ${message}${stack ? "\n" + stack : ""}`;
    })
  ),
  transports: [new transports.Console()],
});
