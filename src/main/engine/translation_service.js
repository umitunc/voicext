import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export function translateVideo(videoPath, options, onStatus) {
  return new Promise((resolve, reject) => {
    const { lipSync = false } = options
    
    // Determine the output path (e.g. videoName_translated.mp4)
    const ext = path.extname(videoPath)
    const baseDir = path.dirname(videoPath)
    const baseName = path.basename(videoPath, ext)
    const outputPath = path.join(baseDir, `${baseName}_translated${ext || '.mp4'}`)
    
    // We execute the local Python pipeline script
    const pythonScript = app.isPackaged
      ? path.join(process.resourcesPath, 'scratch', 'cloning_pipeline.py')
      : path.join(app.getAppPath(), 'scratch', 'cloning_pipeline.py')

    // Find the correct python command
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    const args = ['-u', pythonScript, '--input', videoPath, '--output', outputPath]
    
    if (lipSync) {
      args.push('--lip_sync')
    }

    console.log('[Voicext Service] Starting translation pipeline:', pythonCmd, args.join(' '))

    const pyProcess = spawn(pythonCmd, args)
    let stderrOutput = ''

    pyProcess.stdout.on('data', (data) => {
      const output = data.toString().trim()
      const lines = output.split('\n')
      
      for (const line of lines) {
        if (!line) continue
        try {
          // Check if it is a JSON status log
          const status = JSON.parse(line)
          onStatus(status)
        } catch (e) {
          // Not a JSON log, output as debug info
          console.log('[Python stdout]', line)
        }
      }
    })

    pyProcess.stderr.on('data', (data) => {
      const text = data.toString()
      stderrOutput += text
      console.log('[Python stderr]', text)
    })

    pyProcess.on('error', (err) => {
      console.error('[Voicext Service] Failed to start Python process:', err)
      reject(new Error(`Failed to start translation engine. Make sure Python is installed and added to PATH.`))
    })

    pyProcess.on('close', (code) => {
      console.log(`[Voicext Service] Translation pipeline exited with code: ${code}`)
      if (code === 0) {
        resolve({ success: true, outputPath })
      } else {
        reject(new Error(`Translation pipeline failed with exit code ${code}. Details:\n${stderrOutput}`))
      }
    })
  })
}
