import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// Resolve the ffmpeg-static binary bundled with npm
function getFfmpegPath() {
  try {
    // ffmpeg-static returns the path to the binary directly
    const ffmpegStatic = require('ffmpeg-static')
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic
  } catch (_) {}

  // Fallbacks
  const candidates = [
    path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'ffmpeg'
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return 'ffmpeg'
}

function getWhisperPath() {
  const BIN_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(app.getAppPath(), 'bin')

  const p = path.join(BIN_PATH, 'whisper.exe')
  if (fs.existsSync(p)) return p
  return 'whisper'
}

export function translateVideo(videoPath, options, onStatus) {
  return new Promise((resolve, reject) => {
    // Destructure with explicit defaults — keep whisperModel and ttsModel separate
    const {
      lipSync      = false,
      whisperModel = 'small',  // Whisper: tiny | base | small | medium | large
      ttsModel     = 'gtts'    // TTS engine: gtts | xtts
    } = options

    // Determine the output path (e.g. videoName_translated.mp4)
    const ext      = path.extname(videoPath)
    const baseDir  = path.dirname(videoPath)
    const baseName = path.basename(videoPath, ext)
    const outputPath = path.join(baseDir, `${baseName}_translated${ext || '.mp4'}`)

    // Python pipeline script path
    const pythonScript = app.isPackaged
      ? path.join(process.resourcesPath, 'scratch', 'cloning_pipeline.py')
      : path.join(app.getAppPath(), 'scratch', 'cloning_pipeline.py')

    const ffmpegPath  = getFfmpegPath()
    const whisperPath = getWhisperPath()
    const pythonCmd   = process.platform === 'win32' ? 'python' : 'python3'

    const args = [
      '-u', pythonScript,
      '--input',        videoPath,
      '--output',       outputPath,
      '--ffmpeg',       ffmpegPath,
      '--whisper',      whisperPath,
      '--model',        whisperModel,   // Whisper STT model name
      '--tts',          ttsModel        // TTS engine selection
    ]

    if (lipSync) args.push('--lip_sync')

    console.log('[Voicext Service] Starting translation pipeline:', pythonCmd, args.join(' '))

    const pyProcess = spawn(pythonCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderrOutput = ''

    pyProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const status = JSON.parse(trimmed)
          onStatus(status)
        } catch (_) {
          console.log('[Python stdout]', trimmed)
        }
      }
    })

    pyProcess.stderr.on('data', (data) => {
      const text = data.toString()
      stderrOutput += text
      console.log('[Python stderr]', text.slice(0, 300))
    })

    pyProcess.on('error', (err) => {
      console.error('[Voicext Service] Failed to start Python process:', err)
      reject(new Error(`Python başlatılamadı. Python'ın PATH'te olduğundan emin olun.\n${err.message}`))
    })

    pyProcess.on('close', (code) => {
      console.log(`[Voicext Service] Translation pipeline exited with code: ${code}`)
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ success: true, outputPath })
      } else if (fs.existsSync(outputPath)) {
        // Exited non-zero but output exists (fallback copy happened)
        resolve({ success: true, outputPath })
      } else {
        reject(new Error(`Translation pipeline failed (code ${code}).\n${stderrOutput.slice(-600)}`))
      }
    })
  })
}
