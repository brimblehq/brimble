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
const cli_table3_1 = __importDefault(require("cli-table3"));
const inquirer_1 = __importDefault(require("inquirer"));
const ora_1 = __importDefault(require("ora"));
const helpers_1 = require("../helpers");
const env = (value, options, command) => __awaiter(void 0, void 0, void 0, function* () {
    const user = (0, helpers_1.isLoggedIn)();
    if (!user) {
        utils_1.log.error(chalk_1.default.red("You are not logged in"));
        process.exit(1);
    }
    const projectConf = yield (0, helpers_1.projectConfig)();
    const project = projectConf.get("project");
    const id = project.id;
    if (!project || !id) {
        utils_1.log.error(chalk_1.default.red("You must create a project first"));
        process.exit(1);
    }
    if (command.name() === "add") {
        const results = [];
        const askQuestions = () => __awaiter(void 0, void 0, void 0, function* () {
            if (results.length) {
                utils_1.log.info(`To exit, type ${chalk_1.default.green("exit")}`);
            }
            const { name } = yield inquirer_1.default.prompt([
                {
                    type: "input",
                    name: "name",
                    message: `Enter the name of the ${results.length ? "another env" : "env"}`,
                    validate: (input) => (!input ? "Please enter a name" : true),
                },
            ]);
            if (name.toLowerCase() !== "exit") {
                if (name.includes("=")) {
                    results.push({ name: name.split("=")[0], value: name.split("=")[1] });
                }
                else {
                    const { value } = yield inquirer_1.default.prompt([
                        {
                            type: "input",
                            name: "value",
                            message: `Enter the value for ${name.toUpperCase()}`,
                            validate: (input) => !input ? "Please enter a value" : true,
                        },
                    ]);
                    results.push({ name, value });
                }
                askQuestions();
            }
            else {
                const spinner = (0, ora_1.default)(`Adding ${results.length} env variables`).start();
                (0, helpers_1.setupAxios)(user.token)
                    .post(`/env`, { projectId: id, environments: results })
                    .then(() => {
                    spinner.succeed(chalk_1.default.green(`${results.length} env variables added 🤓`));
                    const table = new cli_table3_1.default({
                        head: ["Name", "Value"],
                    });
                    results.forEach((result) => {
                        table.push([result.name, result.value]);
                    });
                    console.log(table.toString());
                    utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
                    process.exit(0);
                })
                    .catch((err) => {
                    if (err.response) {
                        spinner.fail(chalk_1.default.red(`Error adding env variables to Brimble 😭\n${err.response.data.msg}`));
                    }
                    else if (err.request) {
                        spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
                    }
                    else {
                        spinner.fail(chalk_1.default.red(`Error adding env variables to Brimble 😭\n${err.message}`));
                    }
                    utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
                    process.exit(1);
                });
            }
        });
        askQuestions();
    }
    else if (command.name() === "list") {
        const spinner = (0, ora_1.default)(`Getting env variables`).start();
        (0, helpers_1.setupAxios)(user.token)
            .get(`/env?projectId=${id}`)
            .then(({ data }) => {
            var _a;
            spinner.succeed(chalk_1.default.green("Env variables retrieved 🤓"));
            const table = new cli_table3_1.default({
                head: ["Name", "Value"],
            });
            (_a = data.env) === null || _a === void 0 ? void 0 : _a.forEach((result) => {
                table.push([result.name, result.value]);
            });
            console.log(table.toString());
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(0);
        })
            .catch((err) => {
            if (err.response) {
                spinner.fail(chalk_1.default.red(`Error getting env variables 😭\n${err.response.data.msg}`));
            }
            else if (err.request) {
                spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
            }
            else {
                spinner.fail(chalk_1.default.red(`Error getting env variables 😭\n${err.message}`));
            }
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(1);
        });
    }
    else if (command.name() === "delete") {
        if (!options.name) {
            utils_1.log.error(chalk_1.default.red("You must specify a project name"));
            process.exit(1);
        }
        if (!value) {
            utils_1.log.error(chalk_1.default.red("Specify env to remove"));
            process.exit(1);
        }
        const spinner = (0, ora_1.default)("Deleting env variables").start();
        (0, helpers_1.setupAxios)(user.token)
            .delete(`/env?projectId=${id}&env=${value.toUpperCase()}`)
            .then(() => {
            spinner.succeed(chalk_1.default.green(`${value.toUpperCase()} removed 🤓`));
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(0);
        })
            .catch((err) => {
            if (err.response) {
                spinner.fail(chalk_1.default.red(`Error deleting env variables 😭\n${err.response.data.msg}`));
            }
            else if (err.request) {
                spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
            }
            else {
                spinner.fail(chalk_1.default.red(`Error deleting env variables 😭\n${err.message}`));
            }
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(1);
        });
    }
});
exports.default = env;
