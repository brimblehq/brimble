"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installScript = void 0;
const cross_spawn_1 = __importDefault(require("cross-spawn"));
const chalk_1 = __importDefault(require("chalk"));
const installScript = ({ _install, installArgs, dir }) => {
    return new Promise((resolve, reject) => {
        var _a, _b;
        console.log(`${chalk_1.default.green(`${_install.toUpperCase()}: Installing dependencies...`)}`);
        const install = (0, cross_spawn_1.default)(_install, installArgs, {
            cwd: dir,
            shell: true,
        });
        (_a = install.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (data) => {
            console.log(`${chalk_1.default.green(data.toString())}`);
        });
        (_b = install.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (data) => {
            console.log(`${chalk_1.default.red(data.toString())}`);
        });
        install.on("close", (code) => {
            if (code !== 0) {
                console.error(`${chalk_1.default.red(`Install failed with code ${code}`)}`);
                reject(new Error(`Install failed with code ${code}`));
            }
            resolve(0);
        });
        install.on("error", (err) => {
            console.log(`${chalk_1.default.red(err)}`);
            reject(err); // Reject the Promise on an error
        });
    });
};
exports.installScript = installScript;
