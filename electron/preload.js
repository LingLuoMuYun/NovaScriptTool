const { contextBridge, ipcRenderer } = require("electron");

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  // 打开文件对话框，读取小说内容
  openFile: () => ipcRenderer.invoke("open-file-dialog"),

  // 保存文件对话框，导出剧本
  saveFile: (options) => ipcRenderer.invoke("save-file-dialog", options),

  // 获取应用信息
  getAppInfo: () => ({
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron,
  }),
});
