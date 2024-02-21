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
const utils_1 = require("@brimble/utils");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const helpers_1 = require("../helpers");
const deployLogs = () => __awaiter(void 0, void 0, void 0, function* () {
    const user = (0, helpers_1.isLoggedIn)();
    if (!user) {
        utils_1.log.error(chalk_1.default.red("You are not logged in"));
        process.exit(1);
    }
    const projectConf = yield (0, helpers_1.projectConfig)();
    const project = projectConf.get("project");
    if (!project || !project.id) {
        utils_1.log.error(chalk_1.default.red("Create a project"));
        process.exit(1);
    }
    const id = project.id;
    const spinner = (0, ora_1.default)(`Fetching logs for ${id}`).start();
    (0, helpers_1.setupAxios)(user.token)
        .get(`/logs?id=${id}`)
        .then(() => {
        helpers_1.socket.on(`${id}-logs`, ({ message, error }) => {
            if (error) {
                spinner.fail(message);
                utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
                process.exit(1);
            }
            else {
                spinner.stop();
                utils_1.log.info(message);
            }
        });
    })
        .catch((err) => {
        if (err.response) {
            spinner.fail(chalk_1.default.red(`Error viewing log 😭\n${err.response.data.msg}`));
        }
        else if (err.request) {
            spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
        }
        else {
            spinner.fail(chalk_1.default.red(`Error viewing log 😭\n${err.message}`));
        }
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
        process.exit(1);
    });
});
exports.default = deployLogs;
