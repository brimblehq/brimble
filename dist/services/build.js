"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildScript = void 0;
const cross_spawn_1 = __importDefault(require("cross-spawn"));
const chalk_1 = __importDefault(require("chalk"));
const buildScript = ({ _build, buildArgs, dir }) => {
    return new Promise((resolve, reject) => {
        var _a, _b;
        const build = (0, cross_spawn_1.default)(_build, buildArgs, { cwd: dir, shell: true });
        (_a = build.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (data) => {
            console.log(`${chalk_1.default.green(data.toString())}`);
        });
        (_b = build.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (data) => {
            console.log(`${chalk_1.default.red(data.toString())}`);
        });
        build.on("close", (code) => {
            if (code !== 0) {
                console.error(`${chalk_1.default.red(`Build failed with code ${code}`)}`);
                reject(new Error(`Build failed with code ${code}`));
            }
            resolve(0);
        });
        build.on("error", (err) => {
            console.log(`${chalk_1.default.red(err)}`);
            reject(err); // Reject the Promise on an error
        });
    });
};
exports.buildScript = buildScript;
