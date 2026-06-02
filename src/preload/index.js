import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'

const api = {
  windowControls: (action) => ipcRenderer.send('window-controls', action),
  startTranscription: (filePath, options) => ipcRenderer.invoke('start-transcription', { filePath, options }),
  onTranscriptionProgress: (callback) => ipcRenderer.on('transcription-progress', (_, progress) => callback(progress)),
  onTranscriptionData: (callback) => ipcRenderer.on('transcription-data', (_, data) => callback(data)),
  startVideoTranslation: (filePath, options) => ipcRenderer.invoke('start-video-translation', { filePath, options }),
  onTranslationStatus: (callback) => ipcRenderer.on('translation-status', (_, status) => callback(status)),
  detectHardware: () => ipcRenderer.invoke('detect-hardware'),
  openExplorer: (path) => ipcRenderer.send('open-explorer', path),
  openFile: (path) => ipcRenderer.send('open-file', path),
  readSrt: (filePath) => ipcRenderer.invoke('read-srt', filePath),
  saveSrt: (filePath, content) => ipcRenderer.invoke('save-srt', { filePath, content }),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  optimizeSrt: (filePath) => ipcRenderer.invoke('optimize-srt', filePath)
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
