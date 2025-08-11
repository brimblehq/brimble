import fs from "fs";
import path from "path";
import { ProjectBuildConfiguration } from "../types/server-config";

export class FrameworkConfigurationAdapter {
  static adaptConfigurationForFramework(
    frameworkSlug: string | undefined,
    buildConfig: ProjectBuildConfiguration,
    projectDirectory: string,
    outputDirectory: string
  ): ProjectBuildConfiguration {
    const adaptedConfig = { ...buildConfig };

    switch (frameworkSlug) {
      case "angular":
        adaptedConfig.buildArguments.push(`--output-path=${outputDirectory}`);
        break;

      case "astro":
        this.adaptAstroConfiguration(adaptedConfig, projectDirectory, outputDirectory);
        break;

      case "remix":
        if (outputDirectory) {
          adaptedConfig.startArguments.push(outputDirectory);
        }
        break;

      case "svelte":
        this.adaptSvelteConfiguration(adaptedConfig, projectDirectory);
        break;

      default:
        // No specific adaptations needed
        break;
    }

    return adaptedConfig;
  }

  private static adaptAstroConfiguration(
    buildConfig: ProjectBuildConfiguration,
    projectDirectory: string,
    outputDirectory: string
  ): void {
    try {
      const astroConfigPath = path.resolve(projectDirectory, "astro.config.mjs");
      const astroConfigContent = fs.readFileSync(astroConfigPath, "utf8");

      if (
        astroConfigContent.includes("output") &&
        astroConfigContent.includes('output: "server"')
      ) {
        buildConfig.startBinary = "node";
        buildConfig.startArguments = [`${outputDirectory}/server/entry.mjs`];
      }
    } catch (error) {
      // Astro config file doesn't exist or can't be read, use defaults
    }
  }

  private static adaptSvelteConfiguration(
    buildConfig: ProjectBuildConfiguration,
    projectDirectory: string
  ): void {
    try {
      const svelteConfigPath = path.resolve(projectDirectory, "svelte.config.js");
      const svelteConfigContent = fs.readFileSync(svelteConfigPath, "utf8");

      if (svelteConfigContent.includes("@sveltejs/adapter-static")) {
        const pagesMatch = svelteConfigContent.match(/(?<=pages: )(.*?)(?=,)/);
        // Static adapter - outputDirectory is already handled
      } else {
        const outMatch = svelteConfigContent.match(/(?<=out: )(.*?)(?=,)/);
        buildConfig.startBinary = "node";
        buildConfig.startArguments = [outMatch ? outMatch[0].replace(/'/g, "") : "build"];
      }
    } catch (error) {
      // Svelte config file doesn't exist or can't be read, use defaults
    }
  }
}
