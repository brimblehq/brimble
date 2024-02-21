#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const dotenv_1 = __importDefault(require("dotenv"));
const update_notifier_1 = __importDefault(require("update-notifier"));
const chalk_1 = __importDefault(require("chalk"));
const package_json_1 = __importDefault(require("./package.json"));
const commands_1 = require("./commands");
dotenv_1.default.config();
const notifier = (0, update_notifier_1.default)({
    pkg: package_json_1.default,
    updateCheckInterval: 1000 * 60 * 60 * 24, // 1 day
});
notifier.notify();
if (notifier.update) {
    const { latest } = notifier.update;
    console.log(chalk_1.default.yellow(`A newer version of Brimble CLI is available: ${latest}
  You are currently on ${package_json_1.default.version}
  Run ${chalk_1.default.green(`yarn global add @brimble/cli`)} to update.`));
}
const program = new commander_1.Command();
program
    .name("brimble")
    .description(package_json_1.default.description)
    .version(package_json_1.default.version, "-v, --version", "output the version number");
program
    .command("dev [directory]")
    .description("Preview your awesome project locally")
    .option("-p, --port <port>", "port to serve on", parseInt)
    .option("--host <host>", "host to serve on")
    .option("-o, --open", "open the browser")
    .option("-i, --install", "install the packages only")
    .option("-b, --build", "build the project only")
    .option("-s, --start", "start the server only")
    .option("--watch", "watch and restart on file changes")
    .option("--build-command <buildCommand>", "build command")
    .option("--output-directory <outputDirectory>", "output directory")
    .option("--use-bun", "use bun instead of yarn")
    .action(commands_1.serve);
program
    .command("login")
    .description("Login to Brimble cloud")
    .option("-e, --email <email>", "email")
    .option("-a --auth <auth>", "auth type")
    .action(commands_1.login);
program
    .command("cook [directory]")
    .description("Deploy your project to Brimble cloud")
    .option("-o, --open", "open the browser")
    .option("-n, --name <name>", "name of the project")
    .option("-pID, --projectID <projectID>", "project ID")
    .option("-d, --domain <domain>", "add your custom domain")
    .option("-s --silent", "silent mode")
    .action(commands_1.deploy);
program.command("logs").description("View your deploy logs").action(commands_1.logs);
program.command("delete").description("Delete your project").action(commands_1.remove);
const domain = program.command("domains").description("Domain commands");
domain
    .command("list [name]")
    .description("List your domains connected to your project")
    .action(commands_1.domains);
domain
    .command("add <domain>")
    .description("Add a custom domain to your project")
    .action(commands_1.domains);
domain
    .command("delete <domain>")
    .description("Remove a custom domain")
    .action(commands_1.domains);
program
    .command("whoami")
    .description("View your Brimble account details")
    .action(commands_1.whoami);
program
    .command("logout")
    .description("Logout from Brimble cloud")
    .action(commands_1.logout);
program
    .command("list")
    .alias("ls")
    .description("List your projects")
    .action(commands_1.list);
const environment = program.command("env").description("Environment commands");
environment
    .command("list [name]")
    .description("List your environment variables connected to your project")
    .action(commands_1.env);
environment
    .command("add [name]")
    .description("Add an env to your project")
    .action(commands_1.env);
environment
    .command("delete <environment>")
    .description("Remove an env from your project")
    .action(commands_1.env);
program.parse();
