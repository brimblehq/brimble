"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customServer = void 0;
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const get_port_1 = __importDefault(require("get-port"));
const express_1 = __importDefault(require("express"));
const inquirer_1 = __importDefault(require("inquirer"));
const utils_1 = require("@brimble/utils");
const services_1 = require("../services");
const helpers_1 = require("../helpers");
const connect_history_api_fallback_1 = __importDefault(require("connect-history-api-fallback"));
const start_1 = require("../services/start");
const install_1 = require("../services/install");
const build_1 = require("../services/build");
const open = require("better-opn");
const customServer = (port, host, dir, isOpen) => {
    const app = (0, express_1.default)();
    app.disable("x-powered-by");
    app.use((0, connect_history_api_fallback_1.default)({
        index: "index.html",
        rewrites: [
            {
                from: /^\/(?!$)([^.]*)$/,
                to: (context) => {
                    let path = context.parsedUrl.path;
                    path = (path === null || path === void 0 ? void 0 : path.startsWith("/")) ? path.substring(1) : path;
                    return fs_1.default.existsSync(`${path}.html`)
                        ? `${path}.html`
                        : fs_1.default.existsSync(`${path}/index.html`)
                            ? `${path}/index.html`
                            : "index.html";
                },
            },
        ],
    }));
    app.use("/", express_1.default.static(dir));
    app.get("*", (req, res) => {
        // TODO: create a 404 page
        res.status(404).end(`<h1>404: ${req.url} not found</h1>`);
    });
    const server = app.listen(port, () => {
        let deployUrl = `http://${host}:${port}`;
        if (isOpen) {
            open(`${deployUrl}`);
        }
        console.log(chalk_1.default.green(`Serving to ${deployUrl}\n PID: ${process.pid}`));
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
    });
    return server;
};
exports.customServer = customServer;
const serve = (directory = ".", options = {}) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { folder, files } = (0, helpers_1.dirValidator)(directory);
        const PORT = yield (0, get_port_1.default)({ port: options.port });
        const HOST = options.host || "0.0.0.0";
        if (files.includes("package.json")) {
            const packageJson = require(path_1.default.resolve(folder, "package.json"));
            const framework = (0, utils_1.detectFramework)(packageJson);
            let { installCommand, buildCommand, startCommand, outputDirectory } = framework.settings;
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
            let start = startCommand === null || startCommand === void 0 ? void 0 : startCommand.split(" ")[0];
            let startArgs = startCommand === null || startCommand === void 0 ? void 0 : startCommand.split(" ").slice(1);
            outputDirectory = options.outputDirectory || outputDirectory;
            if (files.includes("bun.lockb") || options.useBun) {
                installCommand = "bun install";
                buildCommand = (buildCommand === null || buildCommand === void 0 ? void 0 : buildCommand.includes("npx"))
                    ? buildCommand === null || buildCommand === void 0 ? void 0 : buildCommand.replace("npx", "bunx")
                    : buildCommand === null || buildCommand === void 0 ? void 0 : buildCommand.replace("yarn", "bun run");
            }
            else if (files.includes("package-lock.json")) {
                installCommand = "npm install";
            }
            inquirer_1.default
                .prompt([
                {
                    name: "buildCommand",
                    message: "Build command",
                    default: buildCommand,
                    when: (!options.buildCommand &&
                        !options.install &&
                        !options.build &&
                        !options.start) ||
                        !!options.build,
                },
                {
                    name: "outputDirectory",
                    message: "Output directory",
                    default: outputDirectory,
                    when: !!outputDirectory &&
                        !options.outputDirectory &&
                        ((!options.install && !options.build && !options.start) ||
                            !!options.start),
                },
            ])
                .then(({ buildCommand, outputDirectory: optDir }) => {
                const install = (installCommand === null || installCommand === void 0 ? void 0 : installCommand.split(" ")[0]) || "yarn";
                const installArgs = (installCommand === null || installCommand === void 0 ? void 0 : installCommand.split(" ").slice(1)) || [
                    "--production=false",
                ];
                build = buildCommand ? buildCommand.split(" ")[0] : build;
                buildArgs = buildCommand
                    ? buildCommand.split(" ").slice(1)
                    : buildArgs;
                outputDirectory = optDir || outputDirectory || "dist";
                switch (framework.slug) {
                    case "angular":
                        buildArgs.push(`--output-path=${outputDirectory}`);
                        break;
                    case "astro":
                        const astroConfig = fs_1.default.readFileSync(path_1.default.resolve(folder, "astro.config.mjs"), "utf8");
                        if ((astroConfig === null || astroConfig === void 0 ? void 0 : astroConfig.includes("output")) &&
                            (astroConfig === null || astroConfig === void 0 ? void 0 : astroConfig.includes('output: "server"'))) {
                            start = "node";
                            startArgs = [`${outputDirectory}/server/entry.mjs`];
                        }
                        break;
                    case "remix":
                        startArgs === null || startArgs === void 0 ? void 0 : startArgs.push(outputDirectory || "");
                        break;
                    case "svelte":
                        const svelteConfig = fs_1.default.readFileSync(path_1.default.resolve(folder, "svelte.config.js"), "utf8");
                        if (svelteConfig === null || svelteConfig === void 0 ? void 0 : svelteConfig.includes("@sveltejs/adapter-static")) {
                            const pages = svelteConfig.match(/(?<=pages: )(.*?)(?=,)/);
                            outputDirectory = pages ? pages[0].replace(/'/g, "") : "build";
                        }
                        else {
                            const out = svelteConfig.match(/(?<=out: )(.*?)(?=,)/);
                            start = "node";
                            startArgs = [out ? out[0].replace(/'/g, "") : "build"];
                        }
                    default:
                        break;
                }
                if ((!options.install && !options.build && !options.start) ||
                    (options.install && options.build && options.start)) {
                    (0, services_1.serveStack)(folder, { install, installArgs, build, buildArgs, start, startArgs }, {
                        outputDirectory,
                        isOpen: options.open,
                        port: PORT,
                        host: HOST,
                        watch: options.watch,
                    });
                }
                else if (options.install) {
                    (0, install_1.installScript)({ _install: install, installArgs, dir: folder }).then(() => process.exit(0));
                }
                else if (options.build) {
                    (0, build_1.buildScript)({ _build: build, buildArgs, dir: folder }).then(() => process.exit(0));
                }
                else {
                    (0, start_1.startScript)({
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
            });
        }
        else if (files.includes("index.html")) {
            (0, exports.customServer)(PORT, HOST, folder, options.open);
        }
        else {
            throw new Error(`This folder ("${directory}") doesn't contain index.html or package.json`);
        }
    }
    catch (err) {
        const { message } = err;
        utils_1.log.error(chalk_1.default.red(`Start failed with error: ${message}`));
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
        process.exit(1);
    }
});
exports.default = serve;
