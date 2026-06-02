"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  windowControls: (action) => electron.ipcRenderer.send("window-controls", action),
  startTranscription: (filePath, options) => electron.ipcRenderer.invoke("start-transcription", { filePath, options }),
  onTranscriptionProgress: (callback) => electron.ipcRenderer.on("transcription-progress", (_, progress) => callback(progress)),
  onTranscriptionData: (callback) => electron.ipcRenderer.on("transcription-data", (_, data) => callback(data)),
  startVideoTranslation: (filePath, options) => electron.ipcRenderer.invoke("start-video-translation", { filePath, options }),
  onTranslationStatus: (callback) => electron.ipcRenderer.on("translation-status", (_, status) => callback(status)),
  detectHardware: () => electron.ipcRenderer.invoke("detect-hardware"),
  openExplorer: (path) => electron.ipcRenderer.send("open-explorer", path),
  openFile: (path) => electron.ipcRenderer.send("open-file", path),
  readSrt: (filePath) => electron.ipcRenderer.invoke("read-srt", filePath),
  saveSrt: (filePath, content) => electron.ipcRenderer.invoke("save-srt", { filePath, content }),
  selectFile: (filters) => electron.ipcRenderer.invoke("select-file", filters),
  optimizeSrt: (filePath) => electron.ipcRenderer.invoke("optimize-srt", filePath)
};
if (process.contextIsolated) {
  try {
    preload.exposeElectronAPI();
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.exposeElectronAPI();
  window.api = api;
}
