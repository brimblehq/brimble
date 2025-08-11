export class ContainerEnvironmentDetector {
  static isRunningInContainer(): boolean {
    return !!(process.env.CONTAINER || process.env.DOCKER_ENV || process.env.HOSTNAME);
  }
}
