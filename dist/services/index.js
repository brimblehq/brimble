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
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveStack = void 0;
const start_1 = require("./start");
const install_1 = require("./install");
const serveStack = (dir, ci, server) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, install_1.installScript)({
        _install: ci.install,
        installArgs: ci.installArgs,
        dir,
    });
    (0, start_1.startScript)({
        ci: {
            start: ci.start,
            startArgs: ci.startArgs,
            build: ci.build,
            buildArgs: ci.buildArgs,
        },
        server,
        dir,
    });
});
exports.serveStack = serveStack;
