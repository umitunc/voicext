import { app } from 'electron'
import https from 'https'
import fs from 'fs'
import path from 'path'

const BIN_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(app.getAppPath(), 'bin')

const modelsDir = path.join(BIN_PATH, 'models')

export function getModelsStatus() {
  const models = ['base', 'small', 'medium', 'large']
  const status = {}
  
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true })
  }
  
  for (const m of models) {
    const p = path.join(modelsDir, `ggml-${m}.bin`)
    status[m] = fs.existsSync(p)
  }
  return status
}

export function downloadModel(mainWindow, model) {
  return new Promise((resolve, reject) => {
    const m = model.toLowerCase()
    const urlMap = {
      base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
      small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
      medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
      large: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
    }

    const url = urlMap[m]
    if (!url) {
      return reject(new Error(`Unknown model: ${model}`))
    }

    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true })
    }

    const dest = path.join(modelsDir, `ggml-${m}.bin`)
    
    // Recursive function to handle redirects
    const download = (targetUrl) => {
      const req = https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          download(res.headers.location)
          return
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: ${res.statusCode} ${res.statusMessage}`))
          return
        }

        const totalBytes = parseInt(res.headers['content-length'], 10)
        let downloadedBytes = 0

        const file = fs.createWriteStream(dest)
        res.pipe(file)

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length
          if (totalBytes) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('model-download-progress', { model: m, progress: percent })
            }
          }
        })

        file.on('finish', () => {
          file.close(() => resolve({ success: true }))
        })
      })

      req.on('error', (err) => {
        fs.unlink(dest, () => reject(err))
      })
    }

    download(url)
  })
}
