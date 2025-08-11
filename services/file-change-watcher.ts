import chokidar from "chokidar";
import { getIgnoredFiles } from "../helpers";
import { ProcessExecutionOptions, RunningProcess } from "../types/start-script.types";

export class FileChangeWatcher {
  private static readonly ALWAYS_WATCH_FILES = [".env", ".npmrc"];

  static startWatching(
    options: ProcessExecutionOptions,
    runningProcess: RunningProcess,
    onFileChange: (options: ProcessExecutionOptions, previous: RunningProcess) => Promise<void>
  ): chokidar.FSWatcher {
    const fileWatcher = chokidar.watch(options.projectDirectory);

    fileWatcher.on("change", async changedFilePath => {
      await this.handleFileChange(
        changedFilePath,
        options,
        runningProcess,
        onFileChange,
        fileWatcher
      );
    });

    return fileWatcher;
  }

  private static async handleFileChange(
    changedFilePath: string,
    options: ProcessExecutionOptions,
    runningProcess: RunningProcess,
    onFileChange: (options: ProcessExecutionOptions, previous: RunningProcess) => Promise<void>,
    watcher: chokidar.FSWatcher
  ): Promise<void> {
    console.log(`File changed: ${changedFilePath}`);

    const shouldIgnoreFile = await this.shouldIgnoreFileChange(
      changedFilePath,
      options.projectDirectory
    );

    if (shouldIgnoreFile) {
      return;
    }

    await onFileChange(options, runningProcess);
    watcher.close();
  }

  private static async shouldIgnoreFileChange(
    filePath: string,
    projectDirectory: string
  ): Promise<boolean> {
    try {
      const ignoredFiles = await getIgnoredFiles(projectDirectory);

      return ignoredFiles.some((ignoredFile: any) => {
        const shouldWatch = this.ALWAYS_WATCH_FILES.includes(ignoredFile);
        return filePath.includes(ignoredFile) && !shouldWatch;
      });
    } catch {
      return false;
    }
  }
}
