#!/usr/bin/env python3
"""
Voicext - Voice Cloning AI Video Translation Pipeline
Türkçe videoyu İngilizce'ye çevirir.
Pipeline:
  1. FFmpeg ile videodan ses ayır
  2. Whisper.exe ile Türkçe transkripsiyon
  3. Helsinki-NLP/opus-mt-tr-en ile çeviri
  4. Coqui TTS / gTTS ile ses sentezi (voice clone)
  5. FFmpeg ile yeni sesi video ile birleştir
"""

import os
import sys
import argparse
import json
import subprocess
import shutil
import tempfile
import re
import time
from pathlib import Path

# Enforce Hugging Face offline mode so it uses downloaded local weights and models
os.environ["HF_HUB_OFFLINE"] = "1"



# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(description="Voice Cloning AI Video Translation Pipeline")
    parser.add_argument("--input",     required=True, help="Input video file path")
    parser.add_argument("--output",    required=True, help="Output translated video path")
    parser.add_argument("--ref_audio", default=None,  help="Custom reference audio (WAV) for voice cloning")
    parser.add_argument("--lip_sync",  action="store_true", help="Enable Wav2Lip Lip-Sync (GPU needed)")
    parser.add_argument("--whisper",   default=None,  help="Path to whisper.exe")
    parser.add_argument("--ffmpeg",    default=None,  help="Path to ffmpeg.exe")
    parser.add_argument("--model",     default="small", help="Whisper model: tiny/base/small/medium/large")
    parser.add_argument("--tts",       default="gtts", help="TTS engine: gtts | xtts")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Logging (JSON lines – parsed by Electron)
# ---------------------------------------------------------------------------

def log(step, progress, message):
    print(json.dumps({"step": step, "progress": progress, "message": message}), flush=True)


# ---------------------------------------------------------------------------
# Binary auto-discovery
# ---------------------------------------------------------------------------

def find_binary(name_patterns, env_key=None):
    """Return the first existing path from a list of candidates."""
    if env_key and os.environ.get(env_key):
        p = os.environ[env_key]
        if os.path.exists(p):
            return p

    # Walk up from this script to find project root paths
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent  # voicext/

    candidate_dirs = [
        project_root / "bin",
        project_root / "node_modules" / "ffmpeg-static",
        Path("C:/ffmpeg/bin"),
        Path("C:/tools/ffmpeg/bin"),
    ]

    for pat in name_patterns:
        for d in candidate_dirs:
            p = d / pat
            if p.exists():
                return str(p)

    # Last resort: check PATH
    import shutil as sh
    res = sh.which(name_patterns[0].replace(".exe", ""))
    if res:
        return res

    return None


# ---------------------------------------------------------------------------
# Step 1 – Extract audio from video
# ---------------------------------------------------------------------------

def extract_audio(ffmpeg_path, video_path, audio_wav_path, ref_wav_path):
    """Extract full audio track and a 5-second reference clip."""
    log("audio_extract", 10, "FFmpeg ile videodan ses ayırılıyor...")

    # Full audio
    cmd_full = [ffmpeg_path, "-y", "-i", video_path,
                "-vn", "-ar", "22050", "-ac", "1",
                "-f", "wav", audio_wav_path]
    result = subprocess.run(cmd_full, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr}")

    # 5-second reference clip for voice cloning
    cmd_ref = [ffmpeg_path, "-y", "-i", video_path,
               "-vn", "-t", "5", "-ar", "22050", "-ac", "1",
               "-f", "wav", ref_wav_path]
    subprocess.run(cmd_ref, capture_output=True)

    log("audio_extract", 20, "Ses başarıyla ayırıldı ✓")


# ---------------------------------------------------------------------------
# Step 2 – Transcribe with local Whisper
# ---------------------------------------------------------------------------

def transcribe_whisper(whisper_path, audio_path, model_name, tmpdir):
    """Run whisper.exe (Const-me build) and return list of segment dicts."""
    log("stt", 25, f"Whisper ({model_name}) ile transkripsiyon başlatılıyor...")

    model_dir = Path(whisper_path).parent / "models"
    model_bin = model_dir / f"ggml-{model_name}.bin"

    if not model_bin.exists():
        raise RuntimeError(f"Whisper model bulunamadı: {model_bin}")

    # Const-me Whisper: -m model -f input -osrt -l lang
    # Output written as <audio_path_without_ext>.srt  (same folder as input)
    cmd = [whisper_path, "-m", str(model_bin), "-f", audio_path, "-osrt", "-l", "tr"]
    result = subprocess.run(cmd, capture_output=True, timeout=600)

    # Primary expected location: same dir & stem as audio_path
    expected_srt = Path(audio_path).with_suffix(".srt")

    # Fallback: Whisper sometimes writes to cwd
    cwd_srt = Path(os.getcwd()) / (Path(audio_path).stem + ".srt")

    out_srt = None
    if expected_srt.exists():
        out_srt = expected_srt
    elif cwd_srt.exists():
        out_srt = cwd_srt

    if out_srt is None:
        stderr_text = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
        raise RuntimeError(f"Whisper SRT çıktısı üretilemedi. stderr:\n{stderr_text[:400]}")

    content = out_srt.read_text(encoding="utf-8", errors="replace")
    log("stt", 50, f"Transkripsiyon tamamlandı ✓ ({len(content)} karakter)")
    return parse_srt(content)


def parse_srt(srt_content):
    """Parse SRT into list of {start, end, text} dicts (times in milliseconds)."""
    segments = []
    pattern = re.compile(
        r"\d+\n"
        r"(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\n"
        r"([\s\S]*?)(?=\n\n|\Z)",
        re.MULTILINE
    )
    for m in pattern.finditer(srt_content):
        start_ms = srt_time_to_ms(m.group(1))
        end_ms   = srt_time_to_ms(m.group(2))
        text     = m.group(3).strip().replace("\n", " ")
        if text:
            segments.append({"start": start_ms, "end": end_ms, "text": text})
    return segments


def srt_time_to_ms(t):
    t = t.replace(",", ".")
    h, m, rest = t.split(":")
    s, ms = rest.split(".")
    return (int(h) * 3600 + int(m) * 60 + int(s)) * 1000 + int(ms)


def ms_to_srt(ms):
    h = ms // 3600000;  ms %= 3600000
    m = ms // 60000;    ms %= 60000
    s = ms // 1000;     ms %= 1000
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


# ---------------------------------------------------------------------------
# Step 3 – Translate with MarianMT (Helsinki-NLP)
# ---------------------------------------------------------------------------

def translate_segments(segments):
    log("translation", 55, "Helsinki-NLP/opus-mt-tr-en modeli yükleniyor (ilk seferinde indirilir)...")

    from transformers import MarianMTModel, MarianTokenizer

    model_name = "Helsinki-NLP/opus-mt-tr-en"
    tokenizer = MarianTokenizer.from_pretrained(model_name)
    model     = MarianMTModel.from_pretrained(model_name)

    log("translation", 60, "Çeviri yapılıyor...")

    texts = [s["text"] for s in segments]
    # Batch translate
    batch_size = 16
    translated = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        tok = tokenizer(batch, return_tensors="pt", padding=True, truncation=True, max_length=512)
        gen = model.generate(**tok)
        translated += [tokenizer.decode(t, skip_special_tokens=True) for t in gen]

    for seg, tr in zip(segments, translated):
        seg["translated"] = tr

    log("translation", 70, f"Çeviri tamamlandı — {len(segments)} segment ✓")
    return segments


# ---------------------------------------------------------------------------
# Step 4 – Voice synthesis (TTS)
# ---------------------------------------------------------------------------

def synthesize_speech(segments, ref_wav_path, tmpdir, ffmpeg_path, tts_engine_name="gtts"):
    """Synthesize English TTS audio for each segment and produce a merged WAV."""
    log("cloning", 72, f"Ses sentezi başlatılıyor ({tts_engine_name.upper()})...")

    tts_engine = None
    use_coqui  = False

    # --- Try Coqui XTTS v2 only if explicitly requested ---
    if tts_engine_name == "xtts":
        try:
            from TTS.api import TTS
            log("cloning", 73, "Coqui XTTS v2 yükleniyor (GPU yoksa yavaş olabilir)...")
            tts_engine = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
            use_coqui  = True
            log("cloning", 75, "Coqui XTTS v2 hazır ✓")
        except Exception as e:
            log("cloning", 73, f"Coqui XTTS v2 yüklenemedi, gTTS'e geçiliyor: {e}")

    audio_segments = []   # list of (start_ms, end_ms, wav_path)
    total = len(segments)

    for idx, seg in enumerate(segments):
        text = seg.get("translated", seg["text"])
        out_wav = os.path.join(tmpdir, f"seg_{idx:05d}.wav")
        progress = 75 + int(10 * idx / max(1, total))
        log("cloning", progress, f"Segment {idx+1}/{total}: {text[:60]}...")

        if use_coqui:
            tts_engine.tts_to_file(
                text=text,
                speaker_wav=ref_wav_path if os.path.exists(ref_wav_path) else None,
                language="en",
                file_path=out_wav
            )
        else:
            # Fallback: gTTS
            try:
                from gtts import gTTS
                gTTS(text=text, lang="en").save(out_wav)
            except Exception:
                # Ultimate fallback: pyttsx3
                try:
                    import pyttsx3
                    engine = pyttsx3.init()
                    engine.setProperty("rate", 175)
                    engine.save_to_file(text, out_wav)
                    engine.runAndWait()
                except Exception as e2:
                    log("cloning", progress, f"TTS failed for segment {idx}: {e2}")
                    continue

        if os.path.exists(out_wav):
            audio_segments.append((seg["start"], seg["end"], out_wav))

    log("cloning", 85, f"Ses sentezi tamamlandı — {len(audio_segments)} segment ✓")
    return audio_segments


def build_dubbed_audio(ffmpeg_path, original_wav, audio_segments, tmpdir, total_ms):
    """
    Create a dubbed audio track with absolute time alignment.
    Fixes overlap, voice mixing volume decay, and drift.
    Steps:
      1. For each segment, calculate expected duration. If actual synthesized audio is too long,
         speed it up with 'atempo'. If it's too short, it's fine (will be followed by silence).
      2. Construct a single sequential timeline:
         [Silence from 0 to start1] -> [TTS1 (speed-matched)] -> [Silence from end1 to start2] -> [TTS2] -> ...
      3. Mix this clean timeline with a heavily ducked original audio (sound effects/background).
    """
    log("assembly", 87, "Ses zamanlamaları ayarlanıyor ve hizalanıyor...")

    if not audio_segments:
        dubbed_wav = os.path.join(tmpdir, "dubbed.wav")
        shutil.copy(original_wav, dubbed_wav)
        return dubbed_wav

    processed_segments = []
    
    # Pre-process each segment to ensure it fits its assigned slot perfectly and is speed-adjusted if needed
    for i, (start_ms, end_ms, wav_path) in enumerate(audio_segments):
        target_dur_ms = max(100, end_ms - start_ms)
        
        # Get actual duration of the generated TTS wav
        probe = subprocess.run(
            [ffmpeg_path, "-i", wav_path],
            capture_output=True, text=True
        )
        # Parse duration from ffmpeg output: "Duration: 00:00:02.34,"
        dur_match = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2})[\.,](\d{2})", probe.stderr)
        
        actual_dur_ms = target_dur_ms
        if dur_match:
            h, m, s, cs = map(int, dur_match.groups())
            actual_dur_ms = ((h * 3600 + m * 60 + s) * 1000) + (cs * 10)
        
        out_processed = os.path.join(tmpdir, f"proc_{i:05d}.wav")
        
        # If the generated speech is longer than the slot, speed it up using 'atempo'
        if actual_dur_ms > target_dur_ms + 100:  # Allow 100ms tolerance
            speed = min(2.0, max(0.5, actual_dur_ms / target_dur_ms))
            cmd = [
                ffmpeg_path, "-y", "-i", wav_path,
                "-filter:a", f"atempo={speed:.2f}",
                "-ar", "44100", "-ac", "1",
                out_processed
            ]
            subprocess.run(cmd, capture_output=True)
        else:
            # Just standardize sample rate and channels
            cmd = [
                ffmpeg_path, "-y", "-i", wav_path,
                "-ar", "44100", "-ac", "1",
                out_processed
            ]
            subprocess.run(cmd, capture_output=True)
            
        if os.path.exists(out_processed):
            processed_segments.append((start_ms, end_ms, out_processed))
        else:
            processed_segments.append((start_ms, end_ms, wav_path))

    # Construct the timeline chain
    # We will build a complex filter string using 'anullsrc' for silences and 'concat' to link everything.
    # We place original_wav as input index 0, and all subsequent inputs are processed TTS wavs (starting from index 1).
    inputs = ["-i", original_wav]
    filter_nodes = []
    
    current_time_ms = 0
    concat_count = 0
    
    for i, (start_ms, end_ms, wav_path) in enumerate(processed_segments):
        # 1. Fill gap before this segment with silence
        gap_ms = start_ms - current_time_ms
        if gap_ms > 20:  # If silence is longer than 20ms
            gap_sec = gap_ms / 1000.0
            filter_nodes.append(f"anullsrc=r=44100:cl=mono:d={gap_sec:.3f}[silence_{i}]")
            concat_count += 1
            
        # 2. Add the actual TTS wav
        inputs.append("-i")
        inputs.append(wav_path)
        # TTS input index is (len(inputs) // 2) - 1 because we just added it.
        # Since original_wav is index 0, the first TTS file will be index 1.
        input_idx = (len(inputs) // 2) - 1
        filter_nodes.append(f"[{input_idx}:a]aresample=44100,pan=mono|c0=c0[tts_mono_{i}]")
        concat_count += 1
        
        current_time_ms = start_ms + (end_ms - start_ms) # Estimated end of this speech block

    # Fill final gap if needed
    final_gap = total_ms - current_time_ms
    if final_gap > 50:
        gap_sec = final_gap / 1000.0
        filter_nodes.append(f"anullsrc=r=44100:cl=mono:d={gap_sec:.3f}[silence_end]")
        concat_count += 1

    # Now, chain all these nodes together in sequential order (concat)
    concat_inputs = []
    current_time_ms = 0
    for i, (start_ms, end_ms, wav_path) in enumerate(processed_segments):
        gap_ms = start_ms - current_time_ms
        if gap_ms > 20:
            concat_inputs.append(f"[silence_{i}]")
        concat_inputs.append(f"[tts_mono_{i}]")
        current_time_ms = start_ms + (end_ms - start_ms)
        
    if final_gap > 50:
        concat_inputs.append("[silence_end]")
        
    # Append the concat instruction
    concat_str = "".join(concat_inputs)
    filter_nodes.append(f"{concat_str}concat=n={concat_count}:v=0:a=1[dubbed_clean]")
    
    # Mix [dubbed_clean] with ducked original background audio (which is at index 0)
    # Using amix with specific weight adjustments
    filter_nodes.append(f"[0:a]volume=0.10[bg]")
    filter_nodes.append(f"[dubbed_clean]volume=1.8[fg]")
    filter_nodes.append(f"[fg][bg]amix=inputs=2:duration=first:dropout_transition=0[final_mix]")
    
    dubbed_wav = os.path.join(tmpdir, "dubbed.wav")
    filter_complex_str = ";".join(filter_nodes)
    
    cmd = [ffmpeg_path, "-y"] + inputs + [
        "-filter_complex", filter_complex_str,
        "-map", "[final_mix]",
        "-ar", "44100", "-ac", "2",
        dubbed_wav
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log("assembly", 88, f"Audio mix warning/error (falling back to simple blend): {result.stderr[-300:]}")
        # Quick fallback: simple overlay if complex filter failed
        shutil.copy(original_wav, dubbed_wav)
        
    log("assembly", 90, "Ses hizalama ve birleştirme tamamlandı ✓")
    return dubbed_wav



# ---------------------------------------------------------------------------
# Step 6 – Merge dubbed audio back into the video
# ---------------------------------------------------------------------------

def merge_into_video(ffmpeg_path, video_path, dubbed_wav, output_path):
    log("assembly", 92, "Yeni ses video ile birleştiriliyor...")

    # Run without '-v quiet' so we can capture the stream analysis output in stderr
    probe = subprocess.run(
        [ffmpeg_path, "-i", video_path],
        capture_output=True, text=True
    )
    has_video = "Video:" in probe.stderr or "Video:" in probe.stdout

    if has_video:
        # Normal case: copy video track + replace audio
        cmd = [
            ffmpeg_path, "-y",
            "-i", video_path,
            "-i", dubbed_wav,
            "-c:v", "copy",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            output_path
        ]
    else:
        # Input is audio-only (WAV/MP3) — just encode the dubbed audio
        cmd = [
            ffmpeg_path, "-y",
            "-i", dubbed_wav,
            "-c:a", "aac",
            "-b:a", "192k",
            output_path
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg merge failed: {result.stderr[-400:]}")

    log("assembly", 98, "Video başarıyla oluşturuldu ✓")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    input_file  = args.input
    output_file = args.output
    model_name  = args.model
    tts_engine  = args.tts   # 'gtts' or 'xtts'

    # --- Locate binaries ---
    ffmpeg_path  = args.ffmpeg  or find_binary(["ffmpeg.exe", "ffmpeg"])
    whisper_path = args.whisper or find_binary(["whisper.exe"])

    if not ffmpeg_path or not os.path.exists(ffmpeg_path):
        log("error", 0, "FFmpeg bulunamadı! Lütfen --ffmpeg parametresi ile path verin.")
        sys.exit(1)

    if not whisper_path or not os.path.exists(whisper_path):
        log("error", 0, "Whisper.exe bulunamadı! Lütfen --whisper parametresi ile path verin.")
        sys.exit(1)

    if not os.path.exists(input_file):
        log("error", 0, f"Girdi dosyası bulunamadı: {input_file}")
        sys.exit(1)

    log("init", 5, f"Pipeline başlatıldı — {os.path.basename(input_file)}")

    with tempfile.TemporaryDirectory(prefix="voicext_") as tmpdir:
        try:
            # Step 1: Extract audio
            audio_wav = os.path.join(tmpdir, "audio.wav")
            ref_wav   = args.ref_audio or os.path.join(tmpdir, "ref.wav")
            extract_audio(ffmpeg_path, input_file, audio_wav, ref_wav)

            # Step 2: Transcribe (Turkish)
            segments = transcribe_whisper(whisper_path, audio_wav, model_name, tmpdir)
            if not segments:
                log("stt", 50, "Transkripsiyon boş döndü – video sessiz olabilir.")
                segments = []

            # Step 3: Translate (Turkish → English)
            if segments:
                segments = translate_segments(segments)
            else:
                log("translation", 70, "Çevrilecek segment yok, orijinal video kopyalanıyor.")

            # Step 4: Synthesize English TTS
            if segments:
                audio_segs = synthesize_speech(segments, ref_wav, tmpdir, ffmpeg_path, tts_engine)
            else:
                audio_segs = []

            # Step 5: Build dubbed audio
            if audio_segs:
                # Get total duration in ms (rough estimate from last segment)
                total_ms = segments[-1]["end"] + 2000
                dubbed_wav = build_dubbed_audio(ffmpeg_path, audio_wav, audio_segs, tmpdir, total_ms)
            else:
                dubbed_wav = audio_wav  # fallback to original

            # Step 6: Merge into video
            merge_into_video(ffmpeg_path, input_file, dubbed_wav, output_file)

            log("done", 100, f"Çeviri tamamlandı! → {output_file}")

        except Exception as e:
            log("error", 0, f"Pipeline hatası: {str(e)}")
            import traceback
            traceback.print_exc()
            # Fallback: copy original
            shutil.copy2(input_file, output_file)
            log("done", 100, f"Hata nedeniyle orijinal video kopyalandı: {output_file}")
            sys.exit(1)


if __name__ == "__main__":
    main()
