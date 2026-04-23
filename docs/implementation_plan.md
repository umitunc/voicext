# Voicext - Local AI Transcription (Voice-to-SRT) Implementation Plan

Voicext, Premiere Pro ve diğer kurgu programları için hızlı, yerel (offline) ve yüksek kaliteli SRT dosyaları üreten bir masaüstü uygulamasıdır. `whisper.cpp` motorunu kullanarak RTX GPU gücünden yararlanır ve "al gülüm ver gülüm" sadeliğinde bir iş akışı sunar.

## 🎯 Proje Hedefleri
- **Gizlilik:** Tamamen yerel çalışma (İnternet gerekmez).
- **Kullanılabilirlik:** Tek tıkla MP3 -> SRT dönüşümü.
- **Estetik:** Modern, karanlık tema, premium tasarım.

## 🏗️ Mimari ve Teknoloji Yığını

### Çekirdek (Core)
- **Framework:** Electron.js (Vite ile optimize edilmiş).
- **Processing:** `whisper.cpp` (C++ tabanlı yerel inferans).
- **Audio Engine:** `FFmpeg` (16kHz Mono WAV dönüşümü için).
- **Hardware Acceleration:** 
  - **GPU:** CUDA/cuBLAS (NVIDIA kullanıcıları için).
  - **CPU:** AVX/AVX2/AVX-512 optimizasyonu (GPU olmayan sistemler için otomatik fallback).

### Arayüz (Frontend)
- **UI:** React + Vanilla CSS (Custom premium components).
- **Animations:** Framer Motion (Akıcı geçişler).
- **State:** Zustand (Hafif ve hızlı durum yönetimi).

---

## 🛠️ Uygulama Fazları

### Faz 1: Altyapı ve Binary Yönetimi
Uygulamanın kalbi olan binary dosyalarının hazırlanması.
- [ ] `whisper.cpp`'nin Windows CUDA desteğiyle derlenmesi.
- [ ] `ffmpeg` static binary'lerinin projeye dahil edilmesi.
- [ ] Model yönetimi: Uygulama içinden `tiny`, `base`, `small`, `medium`, `large` modellerinin indirilmesi ve yönetilmesi.

### Faz 2: İş Akışı (The "Al Gülüm Ver Gülüm" Engine)
1. **Input:** Kullanıcı MP3/WAV/M4A dosyasını sürükler.
2. **Pre-processing:** FFmpeg ile `16kHz, mono, 16-bit PCM WAV` formatına anlık dönüşüm.
3. **Inference:** `whisper.exe -m model.bin -f input.wav -osrt -l tr` komutunun child_process ile çalıştırılması.
4. **Output:** `.srt` dosyasının otomatik olarak orijinal dosyanın yanına veya seçilen klasöre kaydedilmesi.

### Faz 3: Kullanıcı Deneyimi ve Arayüz (Premium UX)
- **Glassmorphic Dashboard:** Sürükle-bırak alanı için neon efektli modern bir "Drop Zone".
- **Real-time Progress:** Whisper'ın stdout çıktısını parse ederek canlı ilerleme çubuğu ve "transcription streaming" (ekrana dökülen kelimeler).
- **SRT Preview:** Oluşturulan SRT dosyasını uygulama içinde önizleme ve basit zamanlama düzeltmeleri yapma imkanı.
- **One-Click Export:** "Export for Premiere" butonu ile standartlara en uygun SRT formatını dışa aktarma.

---

## 🖥️ Teknik Detaylar (Hack Önerileri)

### Hibrit Donanım Desteği (Auto-Detection)
Uygulama her sistemde çalışabilmesi için donanımı otomatik algılayacak:
- **NVIDIA Sistemler:** `whisper-cuda.exe` ile maksimum hız.
- **Diğer Sistemler:** `whisper-cpu.exe` ile optimize edilmiş işlemci kullanımı.
- **Dinamik Seçim:** Ayarlar kısmında kullanıcıya "CPU vs GPU" seçme imkanı sunulacak.

### SRT Optimizasyonu
Premiere Pro'da altyazıların çok uzun olmaması için whisper.cpp'nin segmentasyon ayarları optimize edilecek:
- `--max-len`: Satır başına maksimum karakter (Örn: 42).
- `--max-context`: Daha iyi bağlam için önceki metni hatırlama.

---

## 📅 Yol Haritası (Milestones)
1. **MVP:** Dosya seç -> Dönüştür -> SRT al (Görsel odak yok).
2. **Design Update:** Premium UI elementlerinin ve animasyonların eklenmesi.
3. **Advanced Features:** Çoklu dil seçimi, GPU/CPU anahtarı, SRT editörü.

## ❓ Açık Sorular
- Uygulama ilk açıldığında `base` modelini (yaklaşık 140MB) paket içine gömmeli miyiz yoksa ilk açılışta mı indirtmeliyiz?
- Birden fazla dosyayı aynı anda işleme (Batch Processing) özelliği ilk aşamada gerekli mi?

## 🧪 Doğrulama Planı
- Farklı MP3 kalitelerinde (128kbps, 320kbps) FFmpeg dönüşüm testi.
- Uzun videolarda (1 saat+) bellek kullanımı ve GPU sıcaklık takibi.
- Üretilen SRT'nin Premiere Pro ve VLC'de karakter kodlaması (UTF-8) kontrolü.
