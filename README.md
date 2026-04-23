# Voicext - Local AI Transcription Tool

Voicext is a high-performance desktop application built with **Electron** and **React** that provides local, private, and fast speech-to-text transcription. It leverages the power of GPU-accelerated AI to convert audio files into professional subtitle formats.

![Voicext Logo](resources/icon.png)

## 🚀 Features

- **Local Processing:** Your data never leaves your machine. Privacy by design.
- **GPU Acceleration:** Utilizes DirectCompute and CUDA for lightning-fast transcription using the Const-me Whisper implementation.
- **Smart SRT Fixing:** Custom algorithm to ensure SRT files are 100% compatible with Adobe Premiere Pro and other NLEs.
- **Multi-format Output:** Supports SRT, VTT, and TXT exports.
- **Modern UI:** A sleek, responsive interface built with Tailwind CSS and Framer Motion.
- **Optimized for Turkish:** Specialized handling for Turkish character encoding and language models.

## 🛠️ Technology Stack

- **Core:** [Electron](https://www.electronjs.org/)
- **Frontend:** [React](https://reactjs.org/) with [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [Framer Motion](https://www.framer.com/motion/)
- **Engine:** [Const-me/Whisper](https://github.com/Const-me/Whisper) (Windows-optimized C++ implementation)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand)
- **Utilities:** `ffmpeg-static`, `iconv-lite`, `adm-zip`

## 🧠 How It Works (Algorithm)

The transcription process follows a robust pipeline to ensure accuracy and compatibility:

1. **Hardware Detection:** The app automatically detects if an NVIDIA GPU is available to enable hardware acceleration.
2. **Engine Initialization:** It spawns a background process using the `whisper.exe` CLI, passing the audio file and selected model (e.g., `base`, `small`).
3. **Stream Processing:** Real-time feedback is captured from the engine's stdout/stderr, providing the user with live progress updates.
4. **Post-Processing (SRT Fixer):**
   - **Timestamp Normalization:** Corrects overlapping or negative duration segments.
   - **Segment Merging:** Automatically merges micro-segments that often occur in long-form audio.
   - **Encoding Correction:** Ensures the output is UTF-8 encoded, specifically handling Turkish characters (CP857 conversion) to prevent "mojibake".
   - **NLE Compatibility:** Formats the SRT specifically for high-end video editors like Adobe Premiere Pro.

## ⚙️ Setup & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- NVIDIA GPU (Recommended for speed, but supports CPU)

### Installation Steps

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/truncgil/voicext.git
   cd voicext
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Download Binaries & Models:**
   The application requires the Whisper executable and AI models. Run the automated setup script:
   ```bash
   node scripts/setup-binaries.js
   ```
   *This will download the Const-me Whisper CLI and the `ggml-base.bin` model into the `bin/` directory.*

4. **Run in Development Mode:**
   ```bash
   npm run dev
   ```

5. **Build for Production:**
   ```bash
   npm run package
   ```

## 📂 Project Structure

- `src/main`: Electron main process logic and transcription engine integration.
- `src/renderer`: React-based UI components and state management.
- `bin/`: (Generated) Contains `whisper.exe` and `.bin` models.
- `scripts/`: Maintenance and setup scripts for binaries.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---
Developed with ❤️ by Voicext Team.
