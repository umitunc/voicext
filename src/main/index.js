import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { detectHardware, transcribe, fixSrt } from './engine/transcription'
import { translateVideo } from './engine/translation_service'
import { getModelsStatus, downloadModel } from './engine/models'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    frame: false,
    transparent: true,
    backgroundColor: '#00000000'
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Handle Video Translation
  ipcMain.handle('start-video-translation', async (event, { filePath, options }) => {
    try {
      const result = await translateVideo(
        filePath,
        options,
        (status) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('translation-status', status)
          }
        }
      )
      return result
    } catch (error) {
      console.error('Video Translation Error:', error)
      throw error
    }
  })

  // Handle transcription request
  ipcMain.handle('start-transcription', async (event, { filePath, options }) => {
    try {
      const result = await transcribe(
        filePath,
        options,
        (progress) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('transcription-progress', progress)
          }
        },
        (data) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('transcription-data', data)
          }
        }
      )
      return result
    } catch (error) {
      console.error('Transcription Error:', error)
      throw error
    }
  })

  // Handle get models status
  ipcMain.handle('get-models-status', async () => {
    return getModelsStatus()
  })

  // Handle download model
  ipcMain.handle('download-model', async (event, model) => {
    return downloadModel(mainWindow, model)
  })

  // Handle hardware detection
  ipcMain.handle('detect-hardware', async () => {
    return await detectHardware()
  })

  // Handle window controls
  ipcMain.on('window-controls', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (action === 'minimize') win.minimize()
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    if (action === 'close') win.close()
  })

  ipcMain.on('open-explorer', (event, path) => {
    shell.showItemInFolder(path)
  })

  ipcMain.on('open-file', (event, path) => {
    shell.openPath(path)
  })

  // Handle SRT Reading
  ipcMain.handle('read-srt', async (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return content
    } catch (error) {
      console.error('Read SRT Error:', error)
      throw error
    }
  })

  // Handle SRT Saving
  ipcMain.handle('save-srt', async (event, { filePath, content }) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('Save SRT Error:', error)
      throw error
    }
  })

  // Handle File Dialog
  ipcMain.handle('select-file', async (event, filters) => {
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || []
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // Handle SRT Optimization
  ipcMain.handle('optimize-srt', async (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const optimized = fixSrt(content)
      fs.writeFileSync(filePath, optimized, 'utf-8')
      return { success: true, content: optimized }
    } catch (error) {
      console.error('Optimize SRT Error:', error)
      throw error
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.voicext.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
