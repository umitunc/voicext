const fs = require('fs')
const path = require('path')
const https = require('https')
const AdmZip = require('adm-zip')

const binDir = path.join(__dirname, '../bin')
const modelsDir = path.join(binDir, 'models')

if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true })
if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true })

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    // Check if we need to follow redirects
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: ${res.statusCode} ${res.statusMessage}`))
      }

      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => {
        file.close(resolve)
      })
    })

    req.on('error', (err) => {
      fs.unlink(dest, () => reject(err))
    })
  })
}

async function setup() {
  try {
    console.log('Downloading Const-me Whisper (v1.12)...')
    const whisperZipPath = path.join(binDir, 'cli.zip')
    await downloadFile('https://github.com/Const-me/Whisper/releases/download/1.12.0/cli.zip', whisperZipPath)

    console.log('Extracting Whisper...')
    const zip = new AdmZip(whisperZipPath)
    zip.extractAllTo(path.join(binDir, 'whisper_temp'), true)
    
    // Find executable and dlls
    const extractPath = path.join(binDir, 'whisper_temp')
    const files = fs.readdirSync(extractPath)
    
    // In Const-me Whisper release, there's usually a cli.exe or main.exe
    let exeFound = false
    files.forEach(file => {
      if (file.endsWith('.exe')) {
        // We'll rename the primary exe to whisper.exe
        if (!exeFound) {
            fs.copyFileSync(path.join(extractPath, file), path.join(binDir, 'whisper.exe'))
            exeFound = true
        }
      } else if (file.endsWith('.dll')) {
        fs.copyFileSync(path.join(extractPath, file), path.join(binDir, file))
      }
    })
    
    // Cleanup
    fs.rmSync(extractPath, { recursive: true, force: true })
    fs.unlinkSync(whisperZipPath)

    console.log('Downloading Base Model (140MB)...')
    const modelPath = path.join(modelsDir, 'ggml-base.bin')
    if (!fs.existsSync(modelPath)) {
      await downloadFile('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin', modelPath)
    }

    console.log('Setup Complete!')
  } catch (error) {
    console.error('Setup failed:', error)
  }
}

setup()
