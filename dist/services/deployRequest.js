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
exports.sendToServer = void 0;
const utils_1 = require("@brimble/utils");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const helpers_1 = require("../helpers");
const sendToServer = ({ folder, projectId, filesToUpload, domain, name, buildCommand, outputDirectory, options, token, }) => __awaiter(void 0, void 0, void 0, function* () {
    const uploadSpinner = (0, ora_1.default)(chalk_1.default.green(`Uploading ${filesToUpload.length} files...`)).start();
    const upload = (file) => __awaiter(void 0, void 0, void 0, function* () {
        const filePath = path_1.default.resolve(folder, file);
        // get directory
        const directory = file.split("/").slice(0, -1).join("/");
        yield (0, helpers_1.setupAxios)(token)
            .post(`/cli/upload`, {
            dir: `${projectId}/${directory}`,
            file: (0, fs_1.createReadStream)(filePath),
        }, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        })
            .catch((err) => {
            if (err.response) {
                utils_1.log.error(chalk_1.default.red(`Error uploading ${filePath}
              ${chalk_1.default.bold(`\n${err.response.data.msg}`)}
            `));
            }
            else if (err.request) {
                utils_1.log.error(chalk_1.default.red(`Error uploading ${filePath}
              \n Make sure you have a good internet connection
              `));
            }
            else {
                utils_1.log.error(chalk_1.default.red(`Error uploading ${filePath} \n${err.message}`));
            }
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(1);
        });
    });
    const uploadTime = new Date();
    yield Promise.all(filesToUpload.map(upload)).then(() => {
        uploadSpinner.succeed(chalk_1.default.green(`Uploaded ${filesToUpload.length} files in ${new Date().getTime() - uploadTime.getTime()}ms`));
    });
    const deploySpinner = (0, ora_1.default)(`Setting up project ${chalk_1.default.bold(name)}`).start();
    const deployTime = new Date();
    (0, helpers_1.setupAxios)(token)
        .post(`/cook`, {
        uuid: projectId,
        dir: folder,
        domain,
        name,
        buildCommand,
        outputDirectory,
    }, {
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then(() => {
        if (options.silent) {
            utils_1.log.warn(chalk_1.default.yellow(`Silent mode enabled`));
            utils_1.log.info(chalk_1.default.blue(`Use ${chalk_1.default.bold(`brimble logs ${name}`)} to view logs`));
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            process.exit(0);
        }
        else {
            deploySpinner.color = "yellow";
            deploySpinner.text = chalk_1.default.yellow(`This might take a minute, please wait until the project is ready or use ${chalk_1.default.bold(`brimble logs ${name}`)} to view logs`);
        }
        helpers_1.socket.on(`${projectId}-deployed`, ({ url, message }) => {
            deploySpinner.succeed(chalk_1.default.green(`Project deployed to Brimble 🎉`));
            if (message) {
                utils_1.log.warn(chalk_1.default.yellow.bold(`${message}`));
            }
            if (options.open) {
                utils_1.log.info(chalk_1.default.green(`Opening ${url}`));
                require("better-opn")(url);
            }
            else {
                utils_1.log.info(chalk_1.default.green(`Your site is available at ${url}`));
            }
            utils_1.log.info(chalk_1.default.yellow(`Use ${chalk_1.default.bold(`brimble cook -n ${name}`)} to deploy again`));
            // end execution time
            const end = new Date();
            // calculate execution time
            const time = (0, helpers_1.msToTime)(end.getTime() - deployTime.getTime());
            utils_1.log.info(chalk_1.default.green(`Time to deploy: ${chalk_1.default.bold(`${time}`)}`));
            utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
            helpers_1.socket.disconnect();
            process.exit(0);
        });
        helpers_1.socket.on(`${projectId}-error`, ({ message }) => {
            deploySpinner.fail(chalk_1.default.red(`Project failed to deploy 🚨`));
            utils_1.log.error(chalk_1.default.red(`${message} Using ${chalk_1.default.bold(`brimble logs ${name}`)}`));
            helpers_1.socket.disconnect();
            process.exit(1);
        });
    })
        .catch((err) => {
        if (err.response) {
            deploySpinner.fail(chalk_1.default.red(`Error deploying to Brimble 😭\n${err.response.data.msg}`));
        }
        else if (err.request) {
            deploySpinner.fail(chalk_1.default.red(`Make sure you are connected to the internet`));
        }
        else {
            deploySpinner.fail(chalk_1.default.red(`Error deploying to Brimble 😭 \n ${err.message}`));
        }
        utils_1.log.info(chalk_1.default.greenBright(helpers_1.FEEDBACK_MESSAGE));
        process.exit(1);
    });
});
exports.sendToServer = sendToServer;
