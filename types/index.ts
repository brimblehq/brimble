export type IOption = {
  port?: number;
  host?: string;
  open?: boolean;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  start?: boolean;
  useBun?: boolean;
  watch?: boolean;
  install?: boolean;
  build?: boolean;
};
