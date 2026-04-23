import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import iconv from 'iconv-lite'

const BIN_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(app.getAppPath(), 'bin')

export async function detectHardware() {
  return new Promise((resolve) => {
    const smi = spawn('nvidia-smi')
    smi.on('error', () => resolve({ gpu: false, name: 'CPU' }))
    smi.on('close', (code) => {
      if (code === 0) {
        resolve({ gpu: true, name: 'NVIDIA GPU (CUDA)' })
      } else {
        resolve({ gpu: false, name: 'CPU' })
      }
    })
  })
}

// ── SRT Helpers ──────────────────────────────────────────────────────────

function srtTimeToMs(timeStr) {
  const match = timeStr.match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!match) return 0
  const [, h, m, s, ms] = match
  return parseInt(h) * 3600000 + parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms)
}

function msToSrtTime(ms) {
  const h = Math.floor(ms / 3600000)
  ms %= 3600000
  const m = Math.floor(ms / 60000)
  ms %= 60000
  const s = Math.floor(ms / 1000)
  const rem = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(rem).padStart(3, '0')}`
}

// ── SRT Post-Processor ──────────────────────────────────────────────
// Const-me Whisper sometimes produces broken timestamps when splitting
// long segments. This function fixes them for Premiere Pro compatibility.
export function fixSrt(srtContent) {
  // CRITIK DÜZELTME: Tüm Windows (\r\n) ve eski Mac (\r) satır sonlarını Linux (\n) standardına çevir
  const normalizedContent = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const blocks = normalizedContent.trim().split(/\n\n+/)
  const entries = []

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue

    const timeLine = lines.find((l) => l.includes('-->'))
    if (!timeLine) continue

    const textLines = lines.filter((l) => !l.includes('-->') && !/^\d+$/.test(l.trim()))
    const text = textLines.join(' ').trim()
    if (!text) continue

    const [startStr, endStr] = timeLine.split('-->').map((s) => s.trim())
    const startMs = srtTimeToMs(startStr)
    let endMs = srtTimeToMs(endStr)

    entries.push({ startMs, endMs, text })
  }

  // Pass 1: Fix broken timestamps (end < start) by merging with next entry
  const merged = []
  let i = 0
  while (i < entries.length) {
    const entry = { ...entries[i] }

    if (entry.endMs <= entry.startMs && i + 1 < entries.length) {
      const next = entries[i + 1]
      entry.text = (entry.text + ' ' + next.text).trim()
      entry.endMs = next.endMs
      i += 2
    } else {
      i++
    }

    if (entry.endMs <= entry.startMs) {
      entry.endMs = entry.startMs + 3000
    }

    merged.push(entry)
  }

  // Pass 2: Ensure timestamps are sequential
  for (let j = 1; j < merged.length; j++) {
    if (merged[j].startMs < merged[j - 1].endMs) {
      merged[j].startMs = merged[j - 1].endMs
    }
    if (merged[j].endMs <= merged[j].startMs) {
      merged[j].endMs = merged[j].startMs + 3000
    }
  }

  // Build clean SRT
  let srt = ''
  merged.forEach((entry, idx) => {
    srt += `${idx + 1}\n`
    srt += `${msToSrtTime(entry.startMs)} --> ${msToSrtTime(entry.endMs)}\n`
    srt += `${entry.text}\n\n`
  })

  return srt.trim() + '\n'
}

// ── Transcription Engine ────────────────────────────────────────────────

export function transcribe(filePath, options, onProgress, onData) {
  return new Promise((resolve, reject) => {
    const { model = 'small', language = 'tr', format = 'srt' } = options
    const whisperPath = path.join(BIN_PATH, 'whisper.exe')
    const modelPath = path.join(BIN_PATH, 'models', `ggml-${model}.bin`)

    if (!fs.existsSync(whisperPath)) {
      return reject(new Error(`Whisper executable not found at: ${whisperPath}`))
    }
    if (!fs.existsSync(modelPath)) {
      return reject(new Error(`Model not found at: ${modelPath}. Run: node scripts/setup-binaries.js`))
    }

    const whisperArgs = ['-m', modelPath, '-f', filePath]
    if (format === 'srt') whisperArgs.push('-osrt')
    else if (format === 'vtt') whisperArgs.push('-ovtt')
    else if (format === 'txt') whisperArgs.push('-otxt')

    if (language && language !== 'auto') {
      whisperArgs.push('-l', language)
    }

    console.log('[Voicext] Whisper args:', whisperArgs.join(' '))

    const whisper = spawn(whisperPath, whisperArgs)
    let stderrOutput = ''

    // Windows console encoding usually requires special handling for Turkish characters
    // Using iconv-lite to decode the buffer from CP857 (Turkish DOS) or CP1254 (Turkish Windows)
    // Const-me Whisper CLI usually outputs in the system codepage.
    whisper.stdout.on('data', (data) => {
      // Decode buffer using Turkish Windows codepage (win1254) which covers Turkish characters
      const text = iconv.decode(data, 'cp857')
      console.log('[Whisper stdout]', text)
      onData(text)
    })

    whisper.stderr.on('data', (data) => {
      const text = iconv.decode(data, 'cp857')
      stderrOutput += text
      console.log('[Whisper stderr]', text)

      // Progress parsing
      if (text.includes('Loaded model')) {
        onProgress(20)
      } else if (text.includes('Loaded audio') || text.includes('source reader')) {
        onProgress(40)
      } else if (text.includes('RunComplete') || text.includes('CPU Tasks')) {
        onProgress(80)
      } else if (text.includes('Memory Usage')) {
        onProgress(95)
      }
    })

    whisper.on('error', (err) => {
      console.error('[Voicext] Failed to start Whisper process:', err)
      reject(new Error(`Failed to start Whisper: ${err.message}`))
    })

    whisper.on('close', (code) => {
      console.log(`[Voicext] Whisper exited with code: ${code}`)
      const expectedOutput = filePath.replace(/\.[^/.]+$/, `.${format}`)

      if (code === 0) {
        if (format === 'srt' && fs.existsSync(expectedOutput)) {
          try {
            const raw = fs.readFileSync(expectedOutput, 'utf-8')
            const fixed = fixSrt(raw)
            fs.writeFileSync(expectedOutput, fixed, 'utf-8')
            console.log('[Voicext] SRT post-processed and fixed')
          } catch (e) {
            console.warn('[Voicext] SRT post-processing warning:', e.message)
          }
        }
        
        // Handle cases where whisper outputs to a different path
        if (!fs.existsSync(expectedOutput)) {
            const baseName = path.basename(filePath).replace(/\.[^/.]+$/, `.${format}`)
            const altOutput = path.join(process.cwd(), baseName)
            if (fs.existsSync(altOutput)) {
                if (format === 'srt') {
                    const raw = fs.readFileSync(altOutput, 'utf-8')
                    const fixed = fixSrt(raw)
                    fs.writeFileSync(expectedOutput, fixed, 'utf-8')
                } else {
                    fs.copyFileSync(altOutput, expectedOutput)
                }
                fs.unlinkSync(altOutput)
            }
        }

        onProgress(100)
        resolve({ success: true, outputPath: expectedOutput })
      } else {
        reject(new Error(`Whisper failed (code ${code}). Details:\n${stderrOutput}`))
      }
    })
  })
}