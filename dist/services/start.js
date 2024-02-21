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
exports.startScript = void 0;
const cross_spawn_1 = __importDefault(require("cross-spawn"));
const chalk_1 = __importDefault(require("chalk"));
const helpers_1 = require("../helpers");
const serve_1 = require("../commands/serve");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const chokidar_1 = __importDefault(require("chokidar"));
const build_1 = require("./build");
const startScript = ({ ci, server, dir, previous, }) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (ci.build) {
        yield (0, build_1.buildScript)({
            _build: ci.build,
            buildArgs: ci.buildArgs,
            dir,
        });
        if (previous === null || previous === void 0 ? void 0 : previous.kill)
            previous.kill();
        if (previous === null || previous === void 0 ? void 0 : previous.close)
            previous.close();
    }
    if (ci.start) {
        const start = (0, cross_spawn_1.default)(ci.start, ci.startArgs, {
            cwd: dir,
            shell: true,
            env: Object.assign(Object.assign({}, process.env), { PORT: `${server.port}`, HOST: server.host }),
        });
        (_a = start.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (data) => {
            const message = data.toString();
            if (message.match(/:[0-9]+/g)) {
                // get running process
                (0, child_process_1.exec)(`lsof -i tcp:${server.port} | grep LISTEN | awk '{print $2}'`, (err, stdout, stderr) => {
                    if (stdout) {
                        const pid = stdout.toString().trim();
                        if (pid) {
                            console.log(`${chalk_1.default.green(message)}\nPID: ${pid}`);
                            if (server.watch)
                                watch({ ci, server, dir, start });
                        }
                    }
                });
            }
            else {
                console.log(`${chalk_1.default.green(message)}`);
            }
        });
        (_b = start.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (data) => {
            console.log(`${chalk_1.default.red(data.toString())}`);
        });
        start
            .on("close", (code) => {
            if (code !== 0) {
                console.error(`${chalk_1.default.red(`Start failed with code ${code}`)}`);
                process.exit(1);
            }
        })
            .on("error", (err) => {
            console.log(`${chalk_1.default.red(err)}`);
        });
    }
    else if (server.outputDirectory) {
        const start = normalStart({ dir, server });
        if (server.watch)
            watch({ ci, server, dir, start });
    }
    else {
        console.error(`${chalk_1.default.red(`Start failed with error: This folder ("${dir}") doesn't contain index.html`)}`);
        process.exit(1);
    }
});
exports.startScript = startScript;
const normalStart = ({ dir, server }) => {
    try {
        const { files, folder } = (0, helpers_1.dirValidator)(path_1.default.join(dir, server.outputDirectory));
        if (files.includes("index.html")) {
            return (0, serve_1.customServer)(server.port, server.host, folder, server.isOpen);
        }
        else {
            throw new Error(`This folder ("${dir}/${server.outputDirectory}") doesn't contain index.html`);
        }
    }
    catch (error) {
        const { message } = error;
        console.log(`${chalk_1.default.red(`Start failed with error: ${message}`)}`);
        process.exit(1);
    }
};
const watch = ({ ci, server, dir, start }) => {
    // Watch for file changes in the project directory
    const watcher = chokidar_1.default.watch(dir);
    // Add an event listener for change events
    // watcher.on("add", async (filePath) => await reload(filePath));
    watcher.on("change", (filePath) => __awaiter(void 0, void 0, void 0, function* () { return yield reload(filePath); }));
    const reload = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
        console.log(filePath);
        const ignoredFiles = yield (0, helpers_1.getIgnoredFiles)(dir);
        for (const ignoredFile of ignoredFiles) {
            if (filePath.includes(ignoredFile) &&
                ![".env", ".npmrc"].includes(ignoredFile))
                return;
        }
        // Restart the server
        (0, exports.startScript)({ ci, server, dir, previous: start });
        watcher.close();
    });
};
