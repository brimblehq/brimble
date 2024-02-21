"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@brimble/utils");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const helpers_1 = require("../helpers");
const list = () => {
    const user = (0, helpers_1.isLoggedIn)();
    if (!user) {
        utils_1.log.error(chalk_1.default.red("You are not logged in"));
        process.exit(1);
    }
    const spinner = (0, ora_1.default)(`Listing project belonging to you`).start();
    (0, helpers_1.setupAxios)(user.token)
        .get(`/projects`)
        .then(({ data }) => {
        const { projects } = data;
        spinner.succeed(chalk_1.default.green(`${projects === null || projects === void 0 ? void 0 : projects.length} projects found 🤓`));
        projects.forEach((project) => {
            utils_1.log.info(chalk_1.default.green(`${project.name}`));
        });
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
        process.exit(0);
    })
        .catch((err) => {
        if (err.response) {
            spinner.fail(chalk_1.default.red(`Error fetching projects from Brimble 😭\n${err.response.data.msg}`));
        }
        else if (err.request) {
            spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
        }
        else {
            spinner.fail(chalk_1.default.red(`Error fetching projects from Brimble 😭\n${err.message}`));
        }
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
        process.exit(1);
    });
};
exports.default = list;
