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
const dotenv_1 = __importDefault(require("dotenv"));
const inquirer_1 = __importDefault(require("inquirer"));
const is_valid_domain_1 = __importDefault(require("is-valid-domain"));
const path_1 = __importDefault(require("path"));
const configstore_1 = __importDefault(require("configstore"));
const ora_1 = __importDefault(require("ora"));
const slugify_1 = __importDefault(require("slugify"));
const open = require("better-opn");
const helpers_1 = require("../helpers");
const models_1 = require("@brimble/models");
const deployRequest_1 = require("../services/deployRequest");
dotenv_1.default.config();
const config = new configstore_1.default("brimble");
const spinner = (0, ora_1.default)();
const deploy = (directory = process.cwd(), options = {
    open: false,
    domain: "",
    silent: false,
    name: "",
    projectID: "",
}) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = (0, helpers_1.isLoggedIn)();
        if (!user) {
            utils_1.log.error(chalk_1.default.red("You are not logged in"));
            process.exit(1);
        }
        const { folder, files } = (0, helpers_1.dirValidator)(directory);
        const projectConf = yield (0, helpers_1.projectConfig)();
        const proj = projectConf.get("project");
        let filesToUpload = (0, helpers_1.getFiles)(folder);
        let buildCommand = "";
        let outputDirectory = "";
        const hasPackageJson = files.includes("package.json");
        if (hasPackageJson) {
            const ignoredFiles = yield (0, helpers_1.getIgnoredFiles)(folder);
            ignoredFiles.forEach((file) => {
                filesToUpload = filesToUpload.filter((f) => !f.includes(file));
            });
            const packageJson = require(path_1.default.resolve(folder, "package.json"));
            const framework = (0, utils_1.detectFramework)(packageJson);
            buildCommand = framework.settings.buildCommand || "yarn build";
            outputDirectory = framework.settings.outputDirectory || "dist";
        }
        const oauth = user.oauth;
        const hasGit = yield helpers_1.git.revparse(["--is-inside-work-tree"]).catch(() => {
            return false;
        });
        if ((!proj || !proj.id) &&
            (!options.projectID || !config.get(options.projectID))) {
            const { createProject } = yield inquirer_1.default.prompt([
                {
                    type: "confirm",
                    name: "createProject",
                    message: "Initialize project?",
                    default: true,
                },
            ]);
            if (!createProject) {
                throw new Error("Project not initialized");
            }
            // Function to initialize project
            const initProject = (repo) => __awaiter(void 0, void 0, void 0, function* () {
                const answer = yield askQuestions({
                    token: user.token,
                    folder,
                    filesToUpload,
                    buildCommand,
                    outputDirectory,
                    hasPackageJson,
                });
                const gitDir = yield helpers_1.git.revparse(["--show-toplevel"]);
                const rootDir = path_1.default.relative(gitDir, folder);
                spinner.start("Initializing project");
                const { data } = yield (0, helpers_1.setupAxios)(user.token).post(`/init`, {
                    name: (0, slugify_1.default)(answer.name, { lower: true }),
                    repo: repo ? repo : {},
                    buildCommand: answer.buildCommand,
                    outputDirectory: answer.outputDirectory,
                    domain: answer.domain,
                    rootDir,
                    dir: !repo ? folder : "",
                });
                return { data, answer };
            });
            // End of initProject function
            if (oauth && hasGit) {
                if (oauth.toUpperCase() !== models_1.GIT_TYPE.GITHUB) {
                    throw new Error("Only Github is supported for now");
                }
                else {
                    spinner.start("Searching for repositories");
                    (0, helpers_1.setupAxios)(user.token)
                        .get(`/repos/${oauth.toLowerCase()}`)
                        .then(({ data }) => __awaiter(void 0, void 0, void 0, function* () {
                        spinner.stop();
                        const repo = yield listRepos(data.data, user.id);
                        if (repo) {
                            initProject(repo)
                                .then(({ data, answer }) => __awaiter(void 0, void 0, void 0, function* () {
                                projectConf.set("project", {
                                    id: data.projectId,
                                });
                                const gitignore = yield (0, helpers_1.getGitIgnore)(folder);
                                if (gitignore) {
                                    const branch = yield helpers_1.git.revparse([
                                        "--abbrev-ref",
                                        "HEAD",
                                    ]);
                                    yield helpers_1.git
                                        .add(gitignore)
                                        .commit("ci: added brimble.json to .gitignore");
                                    spinner.start("Pushing to remote");
                                    yield helpers_1.git
                                        .push(["-u", "origin", branch])
                                        .then(() => {
                                        spinner.stop();
                                        utils_1.log.warn(chalk_1.default.yellow(`Your site will be available at https://${answer.domain} shortly`));
                                        utils_1.log.info(chalk_1.default.blue(`Run ${chalk_1.default.bold(`brimble logs`)} to view progress`));
                                    })
                                        .catch((err) => {
                                        spinner.fail(err.message);
                                        utils_1.log.warn(chalk_1.default.yellow("Run git push manually"));
                                    });
                                    process.exit(0);
                                }
                                else {
                                    utils_1.log.info(chalk_1.default.yellow("No .gitignore found. You can add it manually by running `git add .gitignore` and `git commit -m 'ci: added brimble.json to .gitignore'`"));
                                    process.exit(0);
                                }
                            }))
                                .catch((err) => {
                                if (err.response) {
                                    throw new Error(err.response.data.msg);
                                }
                                else {
                                    throw new Error(err.message);
                                }
                            });
                        }
                    }))
                        .catch((err) => __awaiter(void 0, void 0, void 0, function* () {
                        if (err.response) {
                            spinner.fail(err.response.data.msg);
                            const { install } = yield inquirer_1.default.prompt([
                                {
                                    type: "confirm",
                                    name: "install",
                                    message: `Would you like to connect with ${oauth.toUpperCase()}?`,
                                    default: true,
                                },
                            ]);
                            if (install) {
                                open(`https://github.com/apps/brimble-build/installations/new`);
                                spinner.start("Awaiting installation");
                                helpers_1.socket.on(`${user.id}:repos`, ({ data: repos }) => __awaiter(void 0, void 0, void 0, function* () {
                                    spinner.stop();
                                    helpers_1.socket.disconnect();
                                    const repo = yield listRepos(repos, user.id);
                                    if (repo) {
                                        initProject(repo)
                                            .then(({ data }) => __awaiter(void 0, void 0, void 0, function* () {
                                            projectConf.set("project", {
                                                id: data.projectId,
                                            });
                                        }))
                                            .catch((err) => {
                                            if (err.response) {
                                                throw new Error(err.response.data.msg);
                                            }
                                            else {
                                                throw new Error(err.message);
                                            }
                                        });
                                    }
                                }));
                            }
                            else {
                                process.exit(1);
                            }
                        }
                        else if (err.request) {
                            spinner.fail("Please check your internet connection");
                            process.exit(1);
                        }
                        else {
                            spinner.fail(`Failed with unknown error: ${err.message}`);
                            process.exit(1);
                        }
                    }));
                }
            }
            else {
                if (process.platform === "win32") {
                    utils_1.log.warn(chalk_1.default.yellow("Windows is not supported yet; please connect with Github"));
                    process.exit(1);
                }
                initProject()
                    .then(({ data, answer }) => __awaiter(void 0, void 0, void 0, function* () {
                    projectConf.set("project", {
                        id: data.projectId,
                    });
                    yield (0, deployRequest_1.sendToServer)({
                        folder,
                        filesToUpload,
                        buildCommand: answer.buildCommand || buildCommand,
                        outputDirectory: answer.outputDirectory || outputDirectory,
                        projectId: data.projectId,
                        name: answer.name || options.name,
                        domain: answer.domain || options.domain,
                        options,
                        token: user.token,
                    });
                }))
                    .catch((err) => {
                    if (err.response) {
                        throw new Error(err.response.data.msg);
                    }
                    else {
                        throw new Error(err.message);
                    }
                });
            }
        }
        else if (oauth && hasGit) {
            if (oauth.toUpperCase() !== models_1.GIT_TYPE.GITHUB) {
                throw new Error("Only Github is supported for now");
            }
            else {
                utils_1.log.warn(chalk_1.default.yellow("Project already connected: all you have to do now is to push to git, and we'll handle the rest"));
                process.exit(1);
            }
        }
        else {
            yield redeploy({
                token: user.token,
                id: proj.id || options.projectID,
                folder,
                filesToUpload,
                buildCommand,
                outputDirectory,
            });
        }
    }
    catch (err) {
        const { message } = err;
        utils_1.log.error(chalk_1.default.red(message));
        process.exit(1);
    }
});
const redeploy = (options) => __awaiter(void 0, void 0, void 0, function* () {
    return (0, helpers_1.setupAxios)(options.token)
        .get(`/projects/${options.id}`)
        .then(({ data }) => __awaiter(void 0, void 0, void 0, function* () {
        const { project } = data;
        if (project.repo) {
            throw new Error("Redeployment is not supported for projects with a repository use your version control system instead");
        }
        yield (0, deployRequest_1.sendToServer)({
            folder: options.folder,
            filesToUpload: options.filesToUpload,
            buildCommand: project.buildCommand || options.buildCommand,
            outputDirectory: project.outputDirectory || options.outputDirectory,
            projectId: project.id,
            name: options.name || project.name,
            domain: options.domain,
            options,
            token: options.token,
        });
    }))
        .catch((err) => {
        if (err.response) {
            throw new Error(err.response.data.msg);
        }
        else {
            throw new Error(err.message);
        }
    });
});
const listRepos = (repos, user_id) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const remoteRepo = yield helpers_1.git.getConfig("remote.origin.url");
    const { repo } = yield inquirer_1.default.prompt([
        {
            type: "list",
            name: "repo",
            message: "Select a repository",
            choices: [
                ...repos === null || repos === void 0 ? void 0 : repos.map((repo) => ({
                    name: repo.full_name,
                    value: repo,
                })),
                {
                    name: "Not listed? Add it",
                    value: null,
                },
            ],
        },
    ]);
    if (!repo) {
        open(`https://github.com/apps/brimble-build/installations/new`);
        spinner.start("Awaiting installation");
        helpers_1.socket.on(`${user_id}:repos`, ({ data: repos }) => __awaiter(void 0, void 0, void 0, function* () {
            spinner.stop();
            helpers_1.socket.disconnect();
            yield listRepos(repos, user_id);
        }));
    }
    else if (remoteRepo &&
        ((_a = remoteRepo.value) === null || _a === void 0 ? void 0 : _a.split(".com/")[1].split(".git")[0]) !== repo.full_name) {
        const { changeRemote } = yield inquirer_1.default.prompt([
            {
                type: "confirm",
                name: "changeRemote",
                message: "Change remote repository?",
                default: true,
            },
        ]);
        if (changeRemote) {
            open(`https://github.com/apps/brimble-build/installations/new`);
            spinner.start("Awaiting installation");
            helpers_1.socket.on(`${user_id}:repos`, ({ data: repos }) => __awaiter(void 0, void 0, void 0, function* () {
                spinner.stop();
                helpers_1.socket.disconnect();
                yield listRepos(repos, user_id);
            }));
        }
        else {
            throw new Error("Remote repository not found");
        }
    }
    return repo;
});
const askQuestions = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, buildCommand, outputDirectory, domain } = yield inquirer_1.default.prompt([
        {
            name: "name",
            message: "Name of the project",
            default: (0, slugify_1.default)(data.name || path_1.default.basename(data.folder), {
                lower: true,
            }),
            when: !data.name,
            validate: (input) => {
                if (!input) {
                    return "Please enter a project name";
                }
                else {
                    return (0, helpers_1.setupAxios)(data.token)
                        .get(`/exists?name=${(0, slugify_1.default)(input, {
                        lower: true,
                    })}`)
                        .then(() => {
                        return true;
                    })
                        .catch((err) => {
                        if (err.response) {
                            return `${err.response.data.msg}`;
                        }
                        else {
                            return `${err.message}`;
                        }
                    });
                }
            },
        },
        {
            name: "buildCommand",
            message: "Build command",
            default: data.buildCommand,
            when: data.hasPackageJson,
        },
        {
            name: "outputDirectory",
            message: "Output directory",
            default: data.outputDirectory,
            when: data.hasPackageJson,
        },
        {
            name: "domain",
            message: "Domain name",
            default: data.name
                ? `${data.name}.brimble.app`
                : ({ name }) => {
                    return name ? `${name}.brimble.app` : "";
                },
            when: !data.domain,
            validate: (input) => {
                if ((0, is_valid_domain_1.default)(input)) {
                    return (0, helpers_1.setupAxios)(data.token)
                        .get(`/exists?domain=${input}`)
                        .then(() => {
                        return true;
                    })
                        .catch((err) => {
                        if (err.response) {
                            return `${err.response.data.msg}`;
                        }
                        return `${err.message}`;
                    });
                }
                else {
                    return `${input} is not a valid domain`;
                }
            },
        },
    ]);
    return { name, buildCommand, outputDirectory, domain };
});
exports.default = deploy;
