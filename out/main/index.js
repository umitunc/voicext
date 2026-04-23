"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const child_process = require("child_process");
const fs = require("fs");
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
