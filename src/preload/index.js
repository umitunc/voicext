import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'

const api = {
  windowControls: (action) => ipcRenderer.send('window-controls', action),
  startTranscription: (filePath, options) => ipcRenderer.invoke('start-transcription', { filePath, options }),
  onTranscriptionProgress: (callback) => ipcRenderer.on('transcription-progress', (_, progress) => callback(progress)),
  onTranscriptionData: (callback) => ipcRenderer.on('transcription-data', (_, data) => callback(data)),
  detectHardware: () => ipcRenderer.invoke('detect-hardware')
}

if (process.contextIsolated) {
  try {
    exposeElectronAPI()
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = exposeElectronAPI()
  window.api = api
}
