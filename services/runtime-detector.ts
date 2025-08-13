import fs from "fs";

export class RuntimeDetector {
  static detectPackageManager(
    projectFiles: string[],
    options: { useBun?: boolean }
  ): "bun" | "npm" | "pnpm" | "yarn" {
    if (projectFiles.includes("bun.lockb") || options.useBun) {
      return "bun";
    }

    if (projectFiles.includes("package-lock.json")) {
      return "npm";
    }

    if (projectFiles.includes("pnpm-lock.yaml")) {
      return "pnpm";
    }

    // Default fallback or if yarn.lock exists
    return "yarn";
  }

  static adaptCommandsForRuntime(
    commands: { install?: string; build?: string; start?: string },
    runtime: "bun" | "npm" | "pnpm" | "yarn"
  ): { install: string; build?: string; start?: string } {
    const adaptedCommands = { ...commands };

    switch (runtime) {
      case "bun":
        adaptedCommands.install = "bun install";
        if (adaptedCommands.build?.includes("npx")) {
          adaptedCommands.build = adaptedCommands.build.replace("npx", "bunx");
        } else if (adaptedCommands.build?.includes("yarn")) {
          adaptedCommands.build = adaptedCommands.build.replace("yarn", "bun run");
        } else if (adaptedCommands.build?.includes("npm")) {
          adaptedCommands.build = adaptedCommands.build.replace("npm", "bun");
        }
        if (adaptedCommands.start?.includes("npx")) {
          adaptedCommands.start = adaptedCommands.start.replace("npx", "bunx");
        } else if (adaptedCommands.start?.includes("yarn")) {
          adaptedCommands.start = adaptedCommands.start.replace("yarn", "bun run");
        } else if (adaptedCommands.start?.includes("npm")) {
          adaptedCommands.start = adaptedCommands.start.replace("npm", "bun");
        }
        break;
      case "pnpm":
        adaptedCommands.install = "pnpm install";
        if (adaptedCommands.build?.includes("npx")) {
          adaptedCommands.build = adaptedCommands.build.replace("npx", "pnpx");
        } else if (adaptedCommands.build?.includes("yarn")) {
          adaptedCommands.build = adaptedCommands.build.replace("yarn", "pnpm run");
        } else if (adaptedCommands.build?.includes("npm")) {
          adaptedCommands.build = adaptedCommands.build.replace("npm", "pnpm");
        }
        if (adaptedCommands.start?.includes("npx")) {
          adaptedCommands.start = adaptedCommands.start.replace("npx", "pnpx");
        } else if (adaptedCommands.start?.includes("yarn")) {
          adaptedCommands.start = adaptedCommands.start.replace("yarn", "pnpm run");
        } else if (adaptedCommands.start?.includes("npm")) {
          adaptedCommands.start = adaptedCommands.start.replace("npm", "pnpm");
        }
        break;
      case "npm":
        adaptedCommands.install = "npm install";
        break;
      default:
        // Keep yarn commands as-is
        break;
    }

    return adaptedCommands as {
      install: string;
      build?: string;
      start?: string;
    };
  }
}
