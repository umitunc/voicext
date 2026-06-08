import { app } from 'electron'
import https from 'https'
import fs from 'fs'
import path from 'path'

const DEV_MODELS_DIR = path.join(app.getAppPath(), 'bin', 'models')

export function getModelsDir() {
  if (!app.isPackaged) return DEV_MODELS_DIR
  return path.join(app.getPath('userData'), 'models')
}

function resolveModelPath(model) {
  const userModel = path.join(getModelsDir(), `ggml-${model}.bin`)
  if (fs.existsSync(userModel)) return userModel
  if (!app.isPackaged) {
    const devModel = path.join(DEV_MODELS_DIR, `ggml-${model}.bin`)
    if (fs.existsSync(devModel)) return devModel
  }
  return userModel
}

export function getModelsStatus() {
  const models = ['base', 'small', 'medium', 'large']
  const status = {}
  const modelsDir = getModelsDir()

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true })
  }

  for (const m of models) {
    status[m] = fs.existsSync(resolveModelPath(m))
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

    const modelsDir = getModelsDir()
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
