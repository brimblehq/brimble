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
exports.isLoggedIn = exports.projectConfig = exports.getIgnoredFiles = exports.getGitIgnore = exports.git = exports.socket = exports.msToTime = exports.setupAxios = exports.dirValidator = exports.getFiles = exports.FEEDBACK_MESSAGE = exports.API_URL = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const https_1 = __importDefault(require("https"));
const socket_io_client_1 = require("socket.io-client");
const chalk_1 = __importDefault(require("chalk"));
const glob_1 = __importDefault(require("glob"));
const simple_git_1 = __importDefault(require("simple-git"));
const parse_gitignore_1 = __importDefault(require("parse-gitignore"));
const configstore_1 = __importDefault(require("configstore"));
dotenv_1.default.config();
exports.API_URL = "https://core.brimble.io";
exports.FEEDBACK_MESSAGE = `Got a bug or a suggestion? Please report it on ${chalk_1.default.bold("https://bit.ly/3cE7iZu")} or create an issue on GitHub: ${chalk_1.default.bold("https://github.com/brimblehq/brimble/issues")}`;
// check if file is a directory and return all files in it with previous directory
const getFiles = (file, previous = "") => {
    const filePath = path_1.default.resolve(previous, file);
    if (fs_1.default.lstatSync(filePath).isDirectory()) {
        return fs_1.default.readdirSync(filePath).reduce((acc, file) => {
            return [...acc, ...(0, exports.getFiles)(file, filePath)];
        }, []);
    }
    return [filePath];
};
exports.getFiles = getFiles;
const dirValidator = (directory) => {
    process.chdir(directory);
    const folder = process.cwd();
    const files = fs_1.default.readdirSync(folder);
    // TODO: check if the folder is empty
    if (!files.length) {
        throw new Error("The folder is empty");
    }
    // TODO: check if the folder contains index.html or package.json
    if (!files.includes("index.html") && !files.includes("package.json")) {
        throw new Error(`This folder ("${directory}") doesn't contain index.html or package.json`);
    }
    return { folder, files };
};
exports.dirValidator = dirValidator;
// setup axios
const setupAxios = (token = "") => {
    const httpsAgent = new https_1.default.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
    });
    const instance = axios_1.default.create({
        baseURL: exports.API_URL,
        headers: {
            Authorization: token ? `Bearer ${token}` : "",
        },
        httpsAgent,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });
    return instance;
};
exports.setupAxios = setupAxios;
const msToTime = (duration) => {
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    return `${hours}h:${minutes}m:${seconds}s`;
};
exports.msToTime = msToTime;
exports.socket = (0, socket_io_client_1.io)(exports.API_URL);
exports.git = (0, simple_git_1.default)();
const getGitIgnore = (folder) => __awaiter(void 0, void 0, void 0, function* () {
    let gitignore = path_1.default.resolve(folder, ".gitignore");
    if (!fs_1.default.existsSync(gitignore)) {
        const gitDir = yield exports.git.revparse(["--git-dir"]);
        if (gitDir.trim() === "") {
            return false;
        }
        gitignore = path_1.default.resolve(gitDir.split(".git").join(""), ".gitignore");
        if (!fs_1.default.existsSync(gitignore)) {
            return false;
        }
    }
    return gitignore;
});
exports.getGitIgnore = getGitIgnore;
const getIgnoredFiles = (folder) => __awaiter(void 0, void 0, void 0, function* () {
    const gitignore = yield (0, exports.getGitIgnore)(folder);
    if (!gitignore) {
        return [];
    }
    const files = (0, parse_gitignore_1.default)(fs_1.default.readFileSync(gitignore, "utf8"));
    let ignoredFiles = files === null || files === void 0 ? void 0 : files.patterns.reduce((acc, file) => {
        return [...acc, ...glob_1.default.sync(file.replace(/\//g, ""))];
    }, []);
    if (ignoredFiles.length) {
        ignoredFiles = ignoredFiles.reduce((acc, file) => {
            if (fs_1.default.lstatSync(file).isDirectory()) {
                return [...acc, `${file}/`, `${file}\\`, ".git/", ".git\\"];
            }
            return [...acc, file, ".git/", ".git\\"];
        }, []);
    }
    return ignoredFiles;
});
exports.getIgnoredFiles = getIgnoredFiles;
const projectConfig = () => __awaiter(void 0, void 0, void 0, function* () {
    const config = new configstore_1.default("brimble", { project: {} }, {
        configPath: path_1.default.join(process.cwd(), "brimble.json"),
    });
    const gitignore = yield (0, exports.getGitIgnore)(process.cwd());
    if (gitignore) {
        const files = fs_1.default.readFileSync(gitignore, "utf8");
        if (!files.includes("brimble.json")) {
            fs_1.default.appendFileSync(gitignore, "\nbrimble.json");
        }
    }
    else {
        fs_1.default.writeFileSync(path_1.default.join(process.cwd(), ".gitignore"), "brimble.json\n", "utf8");
    }
    return config;
});
exports.projectConfig = projectConfig;
const isLoggedIn = () => {
    const config = new configstore_1.default("brimble");
    const user = config.get("user");
    if (!user || !user.token) {
        config.clear();
        return false;
    }
    return user;
};
exports.isLoggedIn = isLoggedIn;
