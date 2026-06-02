# Implementation Plan - Voice Cloning AI Video Translation

This plan outlines the implementation of the "Voice Cloning AI Video Translation" (Ses Klonlamalı Video Çevirisi) feature inside the Voicext Electron-React application. It upgrades the generic Dashboard tab into two specialized workflows: **Voice to SRT** and **Voice to Translation**, integrating local deep learning speech-to-text, translation, voice cloning, and audio-video processing models.

## User Review Required

> [!IMPORTANT]
> **GPU Power & External Python Dependencies**: Voice cloning (XTTS v2) and Lip-Sync (Wav2Lip) are computationally heavy Python-based neural network models that run locally. We will provide an elegant, user-configurable python integration service that links Voicext to a local Python environment, ensuring the app remains fully responsive during processing.

## Proposed Changes

### Backend (Electron Main Process)

---

#### [NEW] [translation_service.js](src/main/engine/translation_service.js)
Create an audio/video processing and translation orchestrator.
- **Audio Extraction**: Use `ffmpeg-static` to extract the primary track and a 3-second reference clip for voice cloning.
- **Whisper Integration**: Re-use the existing local `whisper.exe` binary.
- **Translation / Voice Cloning / Lip-Sync Execution**: Launch and communicate with a local Python script (`cloning_pipeline.py`) that utilizes Helsinki-NLP's Marian-MT (transformers) for translation, XTTS v2 / Coqui for voice cloning, and Wav2Lip for lip-sync.
- **FFmpeg Multiplexing**: Merge the cloned English speech track back with the original video (while maintaining the background/original music tracks, if desired).

#### [MODIFY] [index.js](src/main/index.js)
Register the new IPC handlers:
- `start-video-translation`: Triggers the entire pipeline.
- `on-translation-status`: Receives progress logs for each step of the pipeline.

---

### Frontend (React Renderer)

---

#### [MODIFY] [App.jsx](src/renderersrc/App.jsx)
- **Tab Layout Re-structure**:
  - Replace "Dashboard" tab with "Voice to SRT".
  - Add "Voice to Translation" (Ses Klonlamalı Video Çevirisi) tab next to it.
- **Voice to Translation Dashboard**:
  - Drag-and-drop zone accepting `.mp4`, `.mkv`, `.avi` files.
  - Configuration panel:
    - **Language Selection**: Turkish to English.
    - **Voice Reference**: Option to auto-extract 3s from the source or upload a custom WAV file.
    - **Lip-Sync**: Toggle Wav2Lip integration.
    - **Translation Model**: Local Marian-MT.
  - Interactive pipeline timeline showing visual real-time status of each step:
    1. Audio Extraction 🎙️
    2. Speech-to-Text Transcription (Whisper) 📝
    3. English Translation (Marian-MT) 🌐
    4. Voice Cloning (XTTS v2) 👥
    5. Lip-Sync Alignment (Wav2Lip) 💋
    6. Video Assembly & Output 🎬

#### [MODIFY] [index.css](src/renderersrc/index.css)
Add premium design tokens for the timeline stepper, custom toggle switches, and the video translation dashboard cards.

---

### Python Pipeline Template

---

#### [NEW] [cloning_pipeline.py](/scratch/cloning_pipeline.py)
Create a Python script using standard ML libraries that the Electron app invokes:
- Uses `transformers` + MarianMT (`Helsinki-NLP/opus-mt-tr-en`) for offline translation.
- Uses `TTS` (Coqui/XTTS v2) for zero-shot text-to-speech.
- Uses a Wav2Lip runner to apply lip-sync (optional, with fallback).

---

## Verification Plan

### Automated Tests
- Build and run the React app:
  `npm run dev`
- Run custom translation pipeline dry-run from Electron mock commands.

### Manual Verification
- Upload an MP4 video.
- Run the "Voice to SRT" flow and verify compatibility.
- Run the "Voice to Translation" pipeline and verify step-by-step UI indicators.
