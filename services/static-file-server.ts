import express, { Application, RequestHandler } from "express";
import fs from "fs";
import history from "connect-history-api-fallback";
import chalk from "chalk";
import { log } from "@brimble/utils";
import { FEEDBACK_MESSAGE } from "../helpers";
import { StaticServerConfig } from "../types/server-config";

const open = require("better-opn");

export class StaticFileServer {
  static createServer(config: StaticServerConfig) {
    const expressApp: Application = express();
    expressApp.disable("x-powered-by");

    expressApp.use(
      history({
        index: "index.html",
        rewrites: [
          {
            from: /^\/(?!$)([^.]*)$/,
            to: context => {
              let requestPath = context.parsedUrl.path;
              requestPath = requestPath?.startsWith("/") ? requestPath.substring(1) : requestPath;

              return fs.existsSync(`${requestPath}.html`)
                ? `${requestPath}.html`
                : fs.existsSync(`${requestPath}/index.html`)
                  ? `${requestPath}/index.html`
                  : "index.html";
            },
          },
        ],
      }) as unknown as RequestHandler
    );

    expressApp.use("/", express.static(config.directory));
    expressApp.get("*", (req, res) => {
      res.status(404).end(`<h1>404: ${req.url} not found</h1>`);
    });

    return this.startServer(expressApp, config);
  }

  private static startServer(app: Application, config: StaticServerConfig) {
    const server = app.listen(config.port, () => {
      const serverUrl = `http://${config.host}:${config.port}`;

      if (config.shouldOpenBrowser) {
        open(serverUrl);
      }

      console.log(chalk.green(`Serving to ${serverUrl}\n PID: ${process.pid}`));
      log.info(chalk.greenBright(FEEDBACK_MESSAGE));
    });

    return server;
  }
}
