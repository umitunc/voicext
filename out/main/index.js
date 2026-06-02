"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const utils = require("@electron-toolkit/utils");
const child_process = require("child_process");
const iconv = require("iconv-lite");
const icon = path.join(__dirname, "../../resources/icon.png");
const BIN_PATH = electron.app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(electron.app.getAppPath(), "bin");
async function detectHardware() {
  return new Promise((resolve) => {
    const smi = child_process.spawn("nvidia-smi");
    smi.on("error", () => resolve({ gpu: false, name: "CPU" }));
    smi.on("close", (code) => {
      if (code === 0) {
        resolve({ gpu: true, name: "NVIDIA GPU (CUDA)" });
      } else {
        resolve({ gpu: false, name: "CPU" });
      }
    });
  });
}
function srtTimeToMs(timeStr) {
  const match = timeStr.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!match) return 0;
  const [, h, m, s, ms] = match;
  return parseInt(h) * 36e5 + parseInt(m) * 6e4 + parseInt(s) * 1e3 + parseInt(ms);
}
function msToSrtTime(ms) {
  const h = Math.floor(ms / 36e5);
  ms %= 36e5;
  const m = Math.floor(ms / 6e4);
  ms %= 6e4;
  const s = Math.floor(ms / 1e3);
  const rem = ms % 1e3;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rem).padStart(3, "0")}`;
}
function fixSrt(srtContent) {
  const normalizedContent = srtContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalizedContent.trim().split(/\n\n+/);
  const entries = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const textLines = lines.filter((l) => !l.includes("-->") && !/^\d+$/.test(l.trim()));
    const text = textLines.join(" ").trim();
    if (!text) continue;
    const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
    const startMs = srtTimeToMs(startStr);
    let endMs = srtTimeToMs(endStr);
    entries.push({ startMs, endMs, text });
  }
  const merged = [];
  let i = 0;
  while (i < entries.length) {
    const entry = { ...entries[i] };
    if (entry.endMs <= entry.startMs && i + 1 < entries.length) {
      const next = entries[i + 1];
      entry.text = (entry.text + " " + next.text).trim();
      entry.endMs = next.endMs;
      i += 2;
    } else {
      i++;
    }
    if (entry.endMs <= entry.startMs) {
      entry.endMs = entry.startMs + 3e3;
    }
    merged.push(entry);
  }
  for (let j = 1; j < merged.length; j++) {
    if (merged[j].startMs < merged[j - 1].endMs) {
      merged[j].startMs = merged[j - 1].endMs;
    }
    if (merged[j].endMs <= merged[j].startMs) {
      merged[j].endMs = merged[j].startMs + 3e3;
    }
  }
  let srt = "";
  merged.forEach((entry, idx) => {
    srt += `${idx + 1}
`;
    srt += `${msToSrtTime(entry.startMs)} --> ${msToSrtTime(entry.endMs)}
`;
    srt += `${entry.text}

`;
  });
  return srt.trim() + "\n";
}
function transcribe(filePath, options, onProgress, onData) {
  return new Promise((resolve, reject) => {
    const { model = "small", language = "tr", format = "srt" } = options;
    const whisperPath = path.join(BIN_PATH, "whisper.exe");
    const modelPath = path.join(BIN_PATH, "models", `ggml-${model}.bin`);
    if (!fs.existsSync(whisperPath)) {
      return reject(new Error(`Whisper executable not found at: ${whisperPath}`));
    }
    if (!fs.existsSync(modelPath)) {
      return reject(new Error(`Model not found at: ${modelPath}. Run: node scripts/setup-binaries.js`));
    }
    const whisperArgs = ["-m", modelPath, "-f", filePath];
    if (format === "srt") whisperArgs.push("-osrt");
    else if (format === "vtt") whisperArgs.push("-ovtt");
    else if (format === "txt") whisperArgs.push("-otxt");
    if (language && language !== "auto") {
      whisperArgs.push("-l", language);
    }
    console.log("[Voicext] Whisper args:", whisperArgs.join(" "));
    const whisper = child_process.spawn(whisperPath, whisperArgs);
    let stderrOutput = "";
    whisper.stdout.on("data", (data) => {
      const text = iconv.decode(data, "cp857");
      console.log("[Whisper stdout]", text);
      onData(text);
    });
    whisper.stderr.on("data", (data) => {
      const text = iconv.decode(data, "cp857");
      stderrOutput += text;
      console.log("[Whisper stderr]", text);
      if (text.includes("Loaded model")) {
        onProgress(20);
      } else if (text.includes("Loaded audio") || text.includes("source reader")) {
        onProgress(40);
      } else if (text.includes("RunComplete") || text.includes("CPU Tasks")) {
        onProgress(80);
      } else if (text.includes("Memory Usage")) {
        onProgress(95);
      }
    });
    whisper.on("error", (err) => {
      console.error("[Voicext] Failed to start Whisper process:", err);
      reject(new Error(`Failed to start Whisper: ${err.message}`));
    });
    whisper.on("close", (code) => {
      console.log(`[Voicext] Whisper exited with code: ${code}`);
      const expectedOutput = filePath.replace(/\.[^/.]+$/, `.${format}`);
      if (code === 0) {
        if (format === "srt" && fs.existsSync(expectedOutput)) {
          try {
            const raw = fs.readFileSync(expectedOutput, "utf-8");
            const fixed = fixSrt(raw);
            fs.writeFileSync(expectedOutput, fixed, "utf-8");
            console.log("[Voicext] SRT post-processed and fixed");
          } catch (e) {
            console.warn("[Voicext] SRT post-processing warning:", e.message);
          }
        }
        if (!fs.existsSync(expectedOutput)) {
          const baseName = path.basename(filePath).replace(/\.[^/.]+$/, `.${format}`);
          const altOutput = path.join(process.cwd(), baseName);
          if (fs.existsSync(altOutput)) {
            if (format === "srt") {
              const raw = fs.readFileSync(altOutput, "utf-8");
              const fixed = fixSrt(raw);
              fs.writeFileSync(expectedOutput, fixed, "utf-8");
            } else {
              fs.copyFileSync(altOutput, expectedOutput);
            }
            fs.unlinkSync(altOutput);
          }
        }
        onProgress(100);
        resolve({ success: true, outputPath: expectedOutput });
      } else {
        reject(new Error(`Whisper failed (code ${code}). Details:
${stderrOutput}`));
      }
    });
  });
}
function getFfmpegPath() {
  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch (_) {
  }
  const candidates = [
    path.join(electron.app.getAppPath(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "ffmpeg"
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "ffmpeg";
}
function getWhisperPath() {
  const BIN_PATH2 = electron.app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(electron.app.getAppPath(), "bin");
  const p = path.join(BIN_PATH2, "whisper.exe");
  if (fs.existsSync(p)) return p;
  return "whisper";
}
function translateVideo(videoPath, options, onStatus) {
  return new Promise((resolve, reject) => {
    const {
      lipSync = false,
      whisperModel = "small",
      // Whisper: tiny | base | small | medium | large
      ttsModel = "xtts"
      // TTS engine: gtts | xtts
    } = options;
    const ext = path.extname(videoPath);
    const baseDir = path.dirname(videoPath);
    const baseName = path.basename(videoPath, ext);
    const outputPath = path.join(baseDir, `${baseName}_translated${ext || ".mp4"}`);
    const pythonScript = electron.app.isPackaged ? path.join(process.resourcesPath, "scratch", "cloning_pipeline.py") : path.join(electron.app.getAppPath(), "scratch", "cloning_pipeline.py");
    const ffmpegPath = getFfmpegPath();
    const whisperPath = getWhisperPath();
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const args = [
      "-u",
      pythonScript,
      "--input",
      videoPath,
      "--output",
      outputPath,
      "--ffmpeg",
      ffmpegPath,
      "--whisper",
      whisperPath,
      "--model",
      whisperModel,
      // Whisper STT model name
      "--tts",
      ttsModel
      // TTS engine selection
    ];
    if (lipSync) args.push("--lip_sync");
    console.log("[Voicext Service] Starting translation pipeline:", pythonCmd, args.join(" "));
    const pyProcess = child_process.spawn(pythonCmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderrOutput = "";
    pyProcess.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const status = JSON.parse(trimmed);
          onStatus(status);
        } catch (_) {
          console.log("[Python stdout]", trimmed);
        }
      }
    });
    pyProcess.stderr.on("data", (data) => {
      const text = data.toString();
      stderrOutput += text;
      console.log("[Python stderr]", text.slice(0, 300));
    });
    pyProcess.on("error", (err) => {
      console.error("[Voicext Service] Failed to start Python process:", err);
      reject(new Error(`Python başlatılamadı. Python'ın PATH'te olduğundan emin olun.
${err.message}`));
    });
    pyProcess.on("close", (code) => {
      console.log(`[Voicext Service] Translation pipeline exited with code: ${code}`);
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ success: true, outputPath });
      } else if (fs.existsSync(outputPath)) {
        resolve({ success: true, outputPath });
      } else {
        reject(new Error(`Translation pipeline failed (code ${code}).
${stderrOutput.slice(-600)}`));
      }
    });
  });
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1100,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000"
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  electron.ipcMain.handle("start-video-translation", async (event, { filePath, options }) => {
    try {
      const result = await translateVideo(
        filePath,
        options,
        (status) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send("translation-status", status);
          }
        }
      );
      return result;
    } catch (error) {
      console.error("Video Translation Error:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("start-transcription", async (event, { filePath, options }) => {
    try {
      const result = await transcribe(
        filePath,
        options,
        (progress) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send("transcription-progress", progress);
          }
        },
        (data) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send("transcription-data", data);
          }
        }
      );
      return result;
    } catch (error) {
      console.error("Transcription Error:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("detect-hardware", async () => {
    return await detectHardware();
  });
  electron.ipcMain.on("window-controls", (event, action) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (action === "minimize") win.minimize();
    if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === "close") win.close();
  });
  electron.ipcMain.on("open-explorer", (event, path2) => {
    electron.shell.showItemInFolder(path2);
  });
  electron.ipcMain.on("open-file", (event, path2) => {
    electron.shell.openPath(path2);
  });
  electron.ipcMain.handle("read-srt", async (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return content;
    } catch (error) {
      console.error("Read SRT Error:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("save-srt", async (event, { filePath, content }) => {
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      return { success: true };
    } catch (error) {
      console.error("Save SRT Error:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("select-file", async (event, filters) => {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: filters || []
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle("optimize-srt", async (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const optimized = fixSrt(content);
      fs.writeFileSync(filePath, optimized, "utf-8");
      return { success: true, content: optimized };
    } catch (error) {
      console.error("Optimize SRT Error:", error);
      throw error;
    }
  });
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.voicext.app");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
