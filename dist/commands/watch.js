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
const chokidar_1 = __importDefault(require("chokidar"));
const configstore_1 = __importDefault(require("configstore"));
const helpers_1 = require("../helpers");
const watch = (directory, options) => {
    const config = new configstore_1.default("brimble");
    const projectID = options.projectID;
    const project = config.get(projectID);
    if (!project) {
        utils_1.log.error(chalk_1.default.red(`Project ${projectID} not found`));
        process.exit(1);
    }
    const watcher = chokidar_1.default.watch(directory, {
        persistent: true,
        ignoreInitial: true,
    });
    watcher
        .on("add", (file) => __awaiter(void 0, void 0, void 0, function* () {
        const ignoredFiles = yield (0, helpers_1.getIgnoredFiles)(directory);
        let changedFiles = project.changedFiles || [];
        changedFiles.push(file);
        ignoredFiles.forEach((file) => {
            changedFiles = changedFiles.filter((f) => !f.includes(file));
        });
        project.changedFiles = [...new Set(changedFiles)];
    }))
        .on("change", (file) => __awaiter(void 0, void 0, void 0, function* () {
        const ignoredFiles = yield (0, helpers_1.getIgnoredFiles)(directory);
        let changedFiles = project.changedFiles || [];
        changedFiles.push(file);
        ignoredFiles.forEach((file) => {
            changedFiles = changedFiles.filter((f) => !f.includes(file));
        });
        project.changedFiles = [...new Set(changedFiles)];
    }));
};
exports.default = watch;
