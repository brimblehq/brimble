import chalk from "chalk";
import fs from "fs";
import path from "path";
import getPort from "get-port";
import express, { Application } from "express";
import inquirer from "inquirer";
import { detectFramework, log } from "@brimble/utils";
import { serveStack } from "../services";
import { dirValidator, FEEDBACK_MESSAGE } from "../helpers";
import history from "connect-history-api-fallback";
import { startScript } from "../services/start";
import { installScript } from "../services/install";
import { buildScript } from "../services/build";
import { IOption } from "../types";

const open = require("better-opn");

export const customServer = (
  port: number,
  host: string,
  dir: string,
  isOpen?: boolean
) => {
  const app: Application = express();
  app.disable("x-powered-by");

  app.use(
    history({
      index: "index.html",
      rewrites: [
        {
          from: /^\/(?!$)([^.]*)$/,
          to: (context) => {
            let path = context.parsedUrl.path;
            path = path?.startsWith("/") ? path.substring(1) : path;

            return fs.existsSync(`${path}.html`)
              ? `${path}.html`
              : fs.existsSync(`${path}/index.html`)
              ? `${path}/index.html`
              : "index.html";
          },
        },
      ],
    })
  );
  app.use("/", express.static(dir));
  app.get("*", (req, res) => {
    // TODO: create a 404 page
    res.status(404).end(`<h1>404: ${req.url} not found</h1>`);
  });

  const server = app.listen(port, () => {
    let deployUrl = `http://${host}:${port}`;

    if (isOpen) {
      open(`${deployUrl}`);
    }

    console.log(chalk.green(`Serving to ${deployUrl}\n PID: ${process.pid}`));

    log.info(chalk.greenBright(FEEDBACK_MESSAGE));
  });

  return server;
};

const serve = async (directory: string = ".", options: IOption) => {
  try {
    const { folder, files } = dirValidator(directory);
    const port = Number(options.port || process.env.PORT);
    const PORT = await getPort({ port: port || undefined });
    const HOST = options.host || "0.0.0.0";

    if (files.includes("package.json")) {
      const packageJson = require(path.resolve(folder, "package.json"));
      const framework = detectFramework(packageJson);

      let { installCommand, buildCommand, startCommand, outputDirectory } =
        framework?.settings || {};
      let install = options.installCommand
        ? options.installCommand.split(" ")[0]
        : installCommand
        ? installCommand.split(" ")[0]
        : "";
      let installArgs = options.installCommand
        ? options.installCommand.split(" ").slice(1)
        : installCommand
        ? installCommand.split(" ").slice(1)
        : [];
      let build = options.buildCommand
        ? options.buildCommand.split(" ")[0]
        : buildCommand
        ? buildCommand.split(" ")[0]
        : "";
      let buildArgs = options.buildCommand
        ? options.buildCommand.split(" ").slice(1)
        : buildCommand
        ? buildCommand.split(" ").slice(1)
        : [];
      let start = options.startCommand
        ? options.startCommand.split(" ")[0]
        : startCommand
        ? startCommand.split(" ")[0]
        : "";
      let startArgs = options.startCommand
        ? options.startCommand.split(" ").slice(1)
        : startCommand
        ? startCommand.split(" ").slice(1)
        : [];

      const isSettingsSet = options.install && options.build && options.start;
      const isSettingsNotSet =
        !options.install && !options.build && !options.start;

      outputDirectory = options.outputDirectory || outputDirectory;

      if (files.includes("bun.lockb") || options.useBun) {
        installCommand = "bun install";
        buildCommand = buildCommand?.includes("npx")
          ? buildCommand?.replace("npx", "bunx")
          : buildCommand?.replace("yarn", "bun run");
        startCommand = startCommand?.includes("npx")
          ? startCommand?.replace("npx", "bunx")
          : startCommand?.replace("yarn", "bun run");
      } else if (files.includes("package-lock.json")) {
        installCommand = "npm install";
      } else if (files.includes("pnpm-lock.yaml")) {
        installCommand = "pnpm i --frozen-lockfile";
      }

        inquirer
          .prompt([
            {
              name: "installCommand",
              message: "Install command",
              default: installCommand,
              when:
                !options.installCommand &&
                (isSettingsNotSet || !!options.install),
            },
            {
              name: "buildCommand",
              message: "Build command",
              default: buildCommand,
              when:
                !options.buildCommand && (isSettingsNotSet || !!options.build),
            },
            {
              name: "startCommand",
              message: "Start command",
              default: startCommand,
              when:
                !!startCommand &&
                !options.startCommand &&
                (isSettingsNotSet || !!options.start),
            },
            {
              name: "outputDirectory",
              message: "Output directory",
              default: outputDirectory,
              when:
                !!outputDirectory &&
                !options.outputDirectory &&
                (isSettingsNotSet || !!options.start),
            },
          ])
          .then(
            ({
              installCommand,
              startCommand,
              buildCommand,
              outputDirectory: optDir,
            }) => {
              install = installCommand ? installCommand.split(" ")[0] : install;
              installArgs = installCommand
                ? installCommand.split(" ").slice(1)
                : installArgs;

              build = buildCommand ? buildCommand.split(" ")[0] : build;
              buildArgs = buildCommand
                ? buildCommand.split(" ").slice(1)
                : buildArgs;

              start = startCommand ? startCommand.split(" ")[0] : start;
              startArgs = startCommand
                ? startCommand.split(" ").slice(1)
                : startArgs;

              outputDirectory = optDir || outputDirectory || "dist";

              const isYarn = install.includes("yarn");
              const modulesFolder = options.modulesFolder;
              if (modulesFolder) {
                installArgs.push(
                  isYarn
                    ? `--modules-folder ${modulesFolder}/node_modules --frozen-lockfile`
                    : `--prefix ${modulesFolder}`
                );
              }
              installArgs.push("--ignore-scripts");

              switch (framework?.slug) {
                case "angular":
                  buildArgs.push(`--output-path=${outputDirectory}`);
                  break;
                case "astro":
                  const astroConfig = fs.readFileSync(
                    path.resolve(folder, "astro.config.mjs"),
                    "utf8"
                  );
                  if (
                    astroConfig?.includes("output") &&
                    astroConfig?.includes('output: "server"')
                  ) {
                    start = "node";
                    startArgs = [`${outputDirectory}/server/entry.mjs`];
                  }
                  break;
                case "remix":
                  startArgs?.push(outputDirectory || "");
                  break;
                case "svelte":
                  const svelteConfig = fs.readFileSync(
                    path.resolve(folder, "svelte.config.js"),
                    "utf8"
                  );

                  if (svelteConfig?.includes("@sveltejs/adapter-static")) {
                    const pages = svelteConfig.match(/(?<=pages: )(.*?)(?=,)/);
                    outputDirectory = pages
                      ? pages[0].replace(/'/g, "")
                      : "build";
                  } else {
                    const out = svelteConfig.match(/(?<=out: )(.*?)(?=,)/);
                    start = "node";
                    startArgs = [out ? out[0].replace(/'/g, "") : "build"];
                  }
                default:
                  break;
              }

              if (isSettingsSet || isSettingsNotSet) {
                serveStack(
                  folder,
                  { install, installArgs, build, buildArgs, start, startArgs },
                  {
                    outputDirectory,
                    isOpen: options.open,
                    port: PORT,
                    host: HOST,
                    watch: options.watch,
                  }
                );
              } else if (options.install) {
                installScript({
                  _install: install,
                  installArgs,
                  dir: folder,
                }).then(() => process.exit(0));
              } else if (options.build) {
                buildScript({ _build: build, buildArgs, dir: folder }).then(
                  () => process.exit(0)
                );
              } else {
                startScript({
                  ci: { start, startArgs },
                  dir: folder,
                  server: {
                    outputDirectory,
                    isOpen: options.open,
                    port: PORT,
                    host: HOST,
                    watch: options.watch,
                  },
                });
              }
            }
          );
    } else if (files.includes("index.html")) {
      customServer(PORT, HOST, folder, options.open);
    } else {
      throw new Error(
        `This folder ("${directory}") doesn't contain index.html or package.json`
      );
    }
  } catch (err) {
    const { message } = err as Error;
    log.error(chalk.red(`Start failed with error: ${message}`));

    log.info(chalk.greenBright(FEEDBACK_MESSAGE));
    process.exit(1);
  }
};

export default serve;
