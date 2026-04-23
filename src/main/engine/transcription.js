import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const BIN_PATH = app.isPackaged 
  ? path.join(process.resourcesPath, 'bin')
  : path.join(app.getAppPath(), 'bin')

export async function detectHardware() {
  // Simple check for NVIDIA GPU via nvidia-smi
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

export function transcribe(filePath, options, onProgress, onData) {
  return new Promise((resolve, reject) => {
    const { model = 'base', language = 'tr', outputFormat = 'srt' } = options
    
    // 1. FFmpeg Pre-processing (Convert to 16kHz mono WAV)
    const tempWav = path.join(app.getPath('temp'), `voicext_${Date.now()}.wav`)
    const ffmpegPath = path.join(BIN_PATH, 'ffmpeg.exe')
    
    const ffmpeg = spawn(ffmpegPath, [
      '-i', filePath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      tempWav,
      '-y'
    ])

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error('FFmpeg conversion failed'))
      }

      // 2. Whisper.cpp Inference
      const whisperPath = path.join(BIN_PATH, 'whisper.exe')
      const modelPath = path.join(BIN_PATH, 'models', `ggml-${model}.bin`)
      
      const whisper = spawn(whisperPath, [
        '-m', modelPath,
        '-f', tempWav,
        `-o${outputFormat}`,
        '-l', language,
        '--max-len', '42'
      ])

      whisper.stdout.on('data', (data) => {
        onData(data.toString())
      })

      whisper.stderr.on('data', (data) => {
        // Whisper.cpp outputs progress to stderr
        const output = data.toString()
        const progressMatch = output.match(/progress\s*=\s*(\d+)%/)
        if (progressMatch) {
          onProgress(parseInt(progressMatch[1]))
        }
      })

      whisper.on('close', (code) => {
        // Cleanup temp file
        if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav)
        
        if (code === 0) {
          resolve({ success: true, outputPath: filePath.replace(/\.[^/.]+$/, `.${outputFormat}`) })
        } else {
          reject(new Error('Whisper transcription failed'))
        }
      })
    })
  })
}
