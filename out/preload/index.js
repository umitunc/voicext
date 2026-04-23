"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  windowControls: (action) => electron.ipcRenderer.send("window-controls", action)
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
