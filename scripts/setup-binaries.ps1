$ProgressPreference = 'SilentlyContinue'

$binDir = "bin"
$modelsDir = "bin/models"

# Cleanup existing lock files if any
if (Test-Path "$binDir/ffmpeg.zip") { Remove-Item "$binDir/ffmpeg.zip" -Force }
if (Test-Path "$binDir/whisper.zip") { Remove-Item "$binDir/whisper.zip" -Force }

if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir }
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Path $modelsDir }

Write-Host "Downloading FFmpeg..." -ForegroundColor Cyan
$ffmpegZip = "$binDir/ffmpeg_dl.zip"
Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $ffmpegZip

Write-Host "Downloading Const-me Whisper (v1.12)..." -ForegroundColor Cyan
$whisperZip = "$binDir/whisper_dl.zip"
# User provided link: https://github.com/Const-me/Whisper/releases/tag/1.12.0
# Direct download link for Whisper.zip
Invoke-WebRequest -Uri "https://github.com/Const-me/Whisper/releases/download/1.12.0/Library.zip" -OutFile $whisperZip

Write-Host "Downloading Base Model (140MB)..." -ForegroundColor Cyan
$modelFile = "$modelsDir/ggml-base.bin"
if (-not (Test-Path $modelFile)) {
    Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" -OutFile $modelFile
}

Write-Host "Extracting FFmpeg..." -ForegroundColor Green
Expand-Archive -Path $ffmpegZip -DestinationPath "$binDir/ffmpeg_temp" -Force
$ffmpegExe = Get-ChildItem -Path "$binDir/ffmpeg_temp" -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
Copy-Item $ffmpegExe.FullName -Destination "$binDir/ffmpeg.exe"
Remove-Item -Path "$binDir/ffmpeg_temp" -Recurse -Force
Remove-Item $ffmpegZip

Write-Host "Extracting Whisper..." -ForegroundColor Green
Expand-Archive -Path $whisperZip -DestinationPath "$binDir/whisper_temp" -Force
# Const-me zip might have WhisperDesktop.exe and Whisper.dll
# We look for any exe that looks like a CLI or the main app
$whisperExe = Get-ChildItem -Path "$binDir/whisper_temp" -Filter "*.exe" -Recurse | Select-Object -First 1
Copy-Item $whisperExe.FullName -Destination "$binDir/whisper.exe"
# Also copy DLLs if any
Get-ChildItem -Path "$binDir/whisper_temp" -Filter "*.dll" -Recurse | ForEach-Object {
    Copy-Item $_.FullName -Destination "$binDir/$($_.Name)"
}
Remove-Item -Path "$binDir/whisper_temp" -Recurse -Force
Remove-Item $whisperZip

Write-Host "Setup Complete!" -ForegroundColor Yellow
