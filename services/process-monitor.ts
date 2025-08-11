import { executeCommand } from "../helpers/async-exec";

export class ProcessMonitor {
  static async findProcessByPort(port: number): Promise<string | null> {
    try {
      const { stdout } = await executeCommand(
        `lsof -i tcp:${port} | grep LISTEN | awk '{print $2}'`
      );

      const processId = stdout.toString().trim();
      return processId || null;
    } catch (error) {
      return null;
    }
  }

  static async findListeningPorts(): Promise<string[]> {
    try {
      const { stdout } = await executeCommand(`lsof -i -P -n | grep LISTEN | awk '{print $9}'`);

      return stdout
        .toString()
        .split("\n")
        .filter((line: any) => line.includes(":"))
        .map((line: any) => line.split(":")[1])
        .filter((port: any) => port);
    } catch (error) {
      return [];
    }
  }

  static extractUrlFromMessage(message: string): string[] {
    const urlPattern = /http:\/\/(?:[a-zA-Z0-9-.]+|\[[^\]]+\]):[0-9]+/g;
    return message.match(urlPattern) || [];
  }

  static extractPortFromUrl(url: string): number | null {
    try {
      const portString = url.split(":")[2];
      return portString ? parseInt(portString, 10) : null;
    } catch {
      return null;
    }
  }
}
