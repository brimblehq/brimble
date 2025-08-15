import path from "path";
import { dirValidator } from "../helpers";
import { serveProject } from "../commands/serve";
import { DevelopmentServerConfig } from "../types/start-script.types";
import chalk from "chalk";

export class StaticContentServer {
  static async serveStaticContent(
    projectDirectory: string,
    serverConfig: DevelopmentServerConfig
  ): Promise<any> {
    try {
      const outputPath = path.join(projectDirectory, serverConfig.outputDirectory || "");
      const { files: outputFiles, folder: outputFolder } = dirValidator(outputPath);

      if (!outputFiles.includes("index.html")) {
        throw new Error(
          `This folder ("${projectDirectory}/${serverConfig.outputDirectory}") doesn't contain index.html`
        );
      }

      return serveProject(outputFolder, { ...serverConfig, reusePort: true });
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.log(chalk.red(`Start failed with error: ${errorMessage}`));
      process.exit(1);
    }
  }
}
