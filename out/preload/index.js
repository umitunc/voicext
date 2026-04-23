"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  windowControls: (action) => electron.ipcRenderer.send("window-controls", action),
  startTranscription: (filePath, options) => electron.ipcRenderer.invoke("start-transcription", { filePath, options }),
  onTranscriptionProgress: (callback) => electron.ipcRenderer.on("transcription-progress", (_, progress) => callback(progress)),
  onTranscriptionData: (callback) => electron.ipcRenderer.on("transcription-data", (_, data) => callback(data)),
  detectHardware: () => electron.ipcRenderer.invoke("detect-hardware")
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
