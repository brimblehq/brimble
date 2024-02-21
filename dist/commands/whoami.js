"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@brimble/utils");
const chalk_1 = __importDefault(require("chalk"));
const configstore_1 = __importDefault(require("configstore"));
const ora_1 = __importDefault(require("ora"));
const helpers_1 = require("../helpers");
const whoami = () => {
    const config = new configstore_1.default("brimble");
    const user = (0, helpers_1.isLoggedIn)();
    if (!user) {
        utils_1.log.error(chalk_1.default.red("You are not logged in"));
        process.exit(1);
    }
    if (user.email) {
        utils_1.log.info(chalk_1.default.green(`Logged in as ${chalk_1.default.bold(user.email)}`));
        utils_1.log.info(chalk_1.default.greenBright(`${helpers_1.FEEDBACK_MESSAGE}`));
        process.exit(0);
    }
    else {
        const spinner = (0, ora_1.default)("Fetching user info...").start();
        (0, helpers_1.setupAxios)(user.token)
            .get(`/auth/whoami`)
            .then(({ data }) => {
            const { email } = data.data;
            config.set("user", Object.assign(Object.assign({}, user), { email }));
            spinner.succeed(chalk_1.default.green(`Logged in as ${chalk_1.default.bold(email)}`));
            process.exit(0);
        })
            .catch((err) => {
            if (err.response) {
                spinner.fail(chalk_1.default.red(`Error getting logged in user 😭\n${err.response.data.message}`));
            }
            else if (err.request) {
                spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
            }
            else {
                spinner.fail(chalk_1.default.red(`Error getting logged in user 😭\n${err.message}`));
            }
            process.exit(1);
        });
    }
};
exports.default = whoami;
