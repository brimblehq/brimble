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
const configstore_1 = __importDefault(require("configstore"));
const inquirer_1 = __importDefault(require("inquirer"));
const ora_1 = __importDefault(require("ora"));
const models_1 = require("@brimble/models");
const open = require("better-opn");
const helpers_1 = require("../helpers");
const config = new configstore_1.default("brimble");
const gitLogin = (auth) => {
    const device = Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
    open(`${helpers_1.API_URL}/auth/signin/${auth.toLowerCase()}?device=${device}`);
    const spinner = (0, ora_1.default)("Waiting for authentication").start();
    helpers_1.socket
        .on(`${device}`, (data) => {
        config.set("user", {
            email: data.email,
            id: data.id,
            token: data.access_token,
            refresh_token: data.refresh_token,
            oauth: data.oauth,
        });
        spinner.succeed(chalk_1.default.green("Successfully logged in"));
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
        helpers_1.socket.disconnect();
        process.exit(0);
    })
        .on("error", (err) => {
        spinner.fail(chalk_1.default.red(err));
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
        process.exit(1);
    });
};
const login = ({ email, auth }) => __awaiter(void 0, void 0, void 0, function* () {
    if (auth) {
        if (auth.toUpperCase() !== models_1.GIT_TYPE.GITHUB) {
            utils_1.log.error("Only Github is supported for now");
            process.exit(1);
        }
        else {
            gitLogin(auth);
        }
    }
    else {
        const { loginType } = yield inquirer_1.default.prompt([
            {
                type: "confirm",
                name: "loginType",
                message: "Authenticate with Github",
            },
        ]);
        if (loginType) {
            gitLogin("github");
        }
        else {
            const { email: emailAnswer } = yield inquirer_1.default.prompt([
                {
                    type: "input",
                    name: "email",
                    message: "Enter your email",
                    when: !email,
                    validate: (input) => {
                        if (!input) {
                            return "Email is required";
                        }
                        if (!input.includes("@")) {
                            return "Invalid email";
                        }
                        return true;
                    },
                },
            ]);
            const spinner = (0, ora_1.default)("Logging in to Brimble cloud").start();
            (0, helpers_1.setupAxios)()
                .post("/auth/beta/login", { email: emailAnswer || email })
                .then(({ data }) => __awaiter(void 0, void 0, void 0, function* () {
                const { message } = data;
                if (message) {
                    spinner.succeed(chalk_1.default.green(message));
                }
                const { access_code } = yield inquirer_1.default.prompt([
                    {
                        type: "input",
                        name: "access_code",
                        message: "Enter your access code",
                        validate: (input) => {
                            if (!input) {
                                return "Access code is required";
                            }
                            return true;
                        },
                    },
                ]);
                spinner.start("Authenticating");
                spinner.color = "yellow";
                (0, helpers_1.setupAxios)()
                    .post("/auth/beta/verify-email", {
                    access_code,
                    email: emailAnswer || email,
                })
                    .then(({ data }) => {
                    const { access_token, refresh_token, email, id } = data.data;
                    config.set("user", {
                        email,
                        id,
                        token: access_token,
                        refresh_token,
                        oauth: false,
                    });
                    spinner.succeed(chalk_1.default.green("Successfully logged in"));
                    utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
                    process.exit(0);
                })
                    .catch((err) => {
                    if (err.response) {
                        spinner.fail(chalk_1.default.red(err.response.data.message));
                    }
                    else if (err.request) {
                        spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
                    }
                    else {
                        spinner.fail(chalk_1.default.red(err.message));
                    }
                    utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
                    process.exit(1);
                });
            }))
                .catch((err) => {
                if (err.response) {
                    spinner.fail(chalk_1.default.red(err.response.data.message));
                    inquirer_1.default
                        .prompt([
                        {
                            type: "confirm",
                            name: "retry",
                            message: "Try again?",
                        },
                    ])
                        .then((answers) => {
                        if (answers.retry) {
                            login({ email: emailAnswer || email, auth });
                        }
                        else {
                            process.exit(1);
                        }
                    });
                }
                else if (err.request) {
                    spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
                    utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
                    process.exit(1);
                }
                else {
                    spinner.fail(chalk_1.default.red(err.message));
                    utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
                    process.exit(1);
                }
            });
        }
    }
});
exports.default = login;
