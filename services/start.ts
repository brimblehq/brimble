import spawn from "cross-spawn";
import chalk from "chalk";
import { dirValidator, getIgnoredFiles } from "../helpers";
import { customServer } from "../commands/serve";
import path from "path";
import { exec } from "child_process";
import chokidar from "chokidar";
import { buildScript } from "./build";

type IOpt = {
  ci: { start?: string; startArgs?: any; build?: string; buildArgs?: any };
  server: {
    outputDirectory?: string;
    port: number;
    host: string;
    isOpen?: boolean;
    watch?: boolean;
  };
  dir: string;
};

export const startScript = async ({
  ci,
  server,
  dir,
  previous,
}: IOpt & { previous?: { kill?: () => void; close?: () => void } }) => {
  if (ci.build) {
    await buildScript({
      _build: ci.build,
      buildArgs: ci.buildArgs,
      dir,
    });

    if (previous?.kill) previous.kill();
    if (previous?.close) previous.close();
  }

  if (ci.start) {
    const start = spawn(ci.start, ci.startArgs, {
      cwd: dir,
      shell: true,
      env: { ...process.env, PORT: `${server.port}`, HOST: server.host },
    });

    let portFound = false; // Add a flag to track if we've found the port

    start.stdout?.on("data", (data) => {
      // If we've already found the port, just log the message and return
      if (portFound) {
        console.log(`${chalk.green(data.toString())}`);
        return;
      }

      const message = data.toString();
      const url = message.match(
        /http:\/\/(?:[a-zA-Z0-9-.]+|\[[^\]]+\]):[0-9]+/g
      );

      if (url) {
        console.log(`${chalk.green(message)}`);

        // get port from url
        const port = url[0].split(":")[2];

        // get running process
        exec(
          `lsof -i tcp:${port} | grep LISTEN | awk '{print $2}'`,
          (_, stdout) => {
            if (stdout) {
              const pid = stdout.toString().trim();
              if (pid) {
                console.log(`\nPID: ${pid}`);
                portFound = true;
                if (server.watch) watch({ ci, server, dir, start });
              }
            }
          }
        );
      } else if (
        process.env.CONTAINER ||
        process.env.DOCKER_ENV ||
        process.env.HOSTNAME
      ) {
        exec(`lsof -i -P -n | grep LISTEN | awk '{print $9}'`, (_, stdout) => {
          if (stdout) {
            const port = stdout.toString().split(":")[1];
            if (port) {
              console.log(`http://${server.host}:${port}`);
              portFound = true;
            }
          }
        });
      } else {
        console.log(`${chalk.green(message)}`);
      }
    });

    start.stderr?.on("data", (data) => {
      console.log(`${chalk.red(data.toString())}`);
    });

    start
      .on("close", (code) => {
        if (code !== 0) {
          console.error(`${chalk.red(`Start failed with code ${code}`)}`);
          process.exit(1);
        }
      })
      .on("error", (err) => {
        console.log(`${chalk.red(err)}`);
      });
  } else if (server.outputDirectory) {
    const start = normalStart({ dir, server });
    if (server.watch) watch({ ci, server, dir, start });
  } else {
    console.error(
      `${chalk.red(
        `Start failed with error: This folder ("${dir}") doesn't contain index.html`
      )}`
    );
    process.exit(1);
  }
};

const normalStart = ({ dir, server }: { dir: string; server: any }) => {
  try {
    const { files, folder } = dirValidator(
      path.join(dir, server.outputDirectory)
    );
    if (files.includes("index.html")) {
      return customServer(server.port, server.host, folder, server.isOpen);
    } else {
      throw new Error(
        `This folder ("${dir}/${server.outputDirectory}") doesn't contain index.html`
      );
    }
  } catch (error) {
    const { message } = error as Error;
    console.log(`${chalk.red(`Start failed with error: ${message}`)}`);
    process.exit(1);
  }
};

const watch = ({ ci, server, dir, start }: IOpt & { start: any }) => {
  // Watch for file changes in the project directory
  const watcher = chokidar.watch(dir);

  // Add an event listener for change events
  // watcher.on("add", async (filePath) => await reload(filePath));
  watcher.on("change", async (filePath) => await reload(filePath));

  const reload = async (filePath: string) => {
    console.log(filePath);
    const ignoredFiles = await getIgnoredFiles(dir);

    for (const ignoredFile of ignoredFiles) {
      if (
        filePath.includes(ignoredFile) &&
        ![".env", ".npmrc"].includes(ignoredFile)
      )
        return;
    }

    // Restart the server
    startScript({ ci, server, dir, previous: start });

    watcher.close();
  };
};
