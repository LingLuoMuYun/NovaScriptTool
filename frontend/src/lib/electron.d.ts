/** Electron 预加载脚本暴露的 API */
interface ElectronFileResult {
  filePath: string;
  fileName: string;
  content: string;
  error?: never;
}

interface ElectronFileError {
  error: string;
  filePath?: never;
  fileName?: never;
  content?: never;
}

interface SaveFileOptions {
  content: string;
  defaultName?: string;
  filters?: { name: string; extensions: string[] }[];
}

interface SaveFileResult {
  filePath: string;
  success: true;
  canceled?: false;
}

interface SaveFileCanceled {
  canceled: true;
  success?: false;
}

interface ElectronAPI {
  openFile: () => Promise<ElectronFileResult | ElectronFileError | null>;
  saveFile: (options: SaveFileOptions) => Promise<SaveFileResult | SaveFileCanceled | { error: string }>;
  getAppInfo: () => { isElectron: boolean; platform: string; version: string };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
