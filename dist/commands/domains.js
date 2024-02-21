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
const is_valid_domain_1 = __importDefault(require("is-valid-domain"));
const ora_1 = __importDefault(require("ora"));
const helpers_1 = require("../helpers");
const domains = (value, options, command) => __awaiter(void 0, void 0, void 0, function* () {
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
    if (command.name() === "list") {
        const spinner = (0, ora_1.default)(`Listing domains connected`).start();
        (0, helpers_1.setupAxios)(user.token)
            .get(`/domains?id=${id}`)
            .then(({ data }) => {
            const { domains } = data;
            spinner.succeed(chalk_1.default.green(`${domains.length} domains found 🤓`));
            domains.forEach(({ name }) => {
                utils_1.log.info(chalk_1.default.green(`${name}`));
            });
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(0);
        })
            .catch((err) => {
            if (err.response) {
                spinner.fail(chalk_1.default.red(`Error fetching domains from Brimble 😭\n${err.response.data.msg}`));
            }
            else if (err.request) {
                spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
            }
            else {
                spinner.fail(chalk_1.default.red(`Error fetching domains from Brimble 😭\n${err.message}`));
            }
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(1);
        });
    }
    else if (command.name() === "add") {
        if (!(0, is_valid_domain_1.default)(value)) {
            utils_1.log.error(chalk_1.default.red("Invalid domain"));
            process.exit(1);
        }
        const spinner = (0, ora_1.default)(`Adding domain ${value}`).start();
        (0, helpers_1.setupAxios)(user.token)
            .post(`/domains`, {
            domain: value,
            projectId: id,
        })
            .then(({ data }) => {
            const { domain, info } = data;
            if (info) {
                utils_1.log.warn(chalk_1.default.yellow(`${info}`));
            }
            spinner.succeed(chalk_1.default.green(`${domain.name} added 🤓`));
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(0);
        })
            .catch((err) => {
            if (err.response) {
                spinner.fail(chalk_1.default.red(`Error adding domain to Brimble 😭\n${err.response.data.msg}`));
            }
            else if (err.request) {
                spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
            }
            else {
                spinner.fail(chalk_1.default.red(`Error adding domain to Brimble 😭\n${err.message}`));
            }
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(1);
        });
    }
    else if (command.name() === "delete") {
        if (!(0, is_valid_domain_1.default)(value)) {
            utils_1.log.error(chalk_1.default.red("Invalid domain"));
            process.exit(1);
        }
        const spinner = (0, ora_1.default)(`Removing domain ${value}`).start();
        (0, helpers_1.setupAxios)(user.token)
            .delete(`/domains?domain=${value}&projectId=${id}`)
            .then(() => {
            spinner.succeed(chalk_1.default.green(`${value} removed 🤓`));
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(0);
        })
            .catch((err) => {
            if (err.response) {
                spinner.fail(chalk_1.default.red(`Error removing domain from Brimble 😭\n${err.response.data.msg}`));
            }
            else if (err.request) {
                spinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
            }
            else {
                spinner.fail(chalk_1.default.red(`Error removing domain from Brimble 😭\n${err.message}`));
            }
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(1);
        });
    }
});
exports.default = domains;
