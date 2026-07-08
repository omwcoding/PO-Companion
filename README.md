# 🎛️ PO-Companion

> **Mobile-first utility for visual chopping of audio samples destined for the Teenage Engineering PO-33 KO!**

---

## 📖 Overview

**PO-Companion** is a companion web application designed to streamline the sample preparation workflow for the **Teenage Engineering PO-33 KO!** pocket sampler. 

It solves the unpredictability of the PO-33 KO!'s built-in transient-based auto-chop algorithm by allowing users to prepare, chop, normalize, and concatenate samples directly on their mobile device or computer before transmitting them as a single, perfectly timed audio stream.

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Audio File  │────▶│   PO-Companion   │────▶│   PO-33 KO! │
│  (mp3/wav)   │     │  (Smartphone)    │     │  (Line-In)   │
└─────────────┘     └──────────────────┘     └─────────────┘
                          │
                    ┌─────┴──────┐
                    │ 1. Import  │
                    │ 2. Chop    │
                    │ 3. Concat  │
                    │ 4. Normal. │
                    │ 5. Send    │
                    └────────────┘
```

---

## 🛠️ The Problem & The Solution

### The Problem
* The PO-33 KO! has a limited memory of **~40 seconds** total, shared across all slots.
* The automatic chopping (auto-chop) algorithm in **Drum Mode** is unpredictable, unconfigurable, and prone to error.
* Incorrect chops require deleting the sample and repeating the entire analog recording process.
* Trimming samples inside the PO-33 does not reclaim memory—the device keeps the full recording.

### The Solution: The "Silence Gap" Trick
PO-Companion lets you load an audio file, visually define start/end markers for up to 16 pads, and automatically concatenates them into a single audio file with precise **digital silence gaps** (defaulting to 20ms) between them. 

When the PO-33 KO! records this stream in Drum Mode, it detects the transition from silence to sound and places the slice markers exactly where they belong.

#### ⚡ Key Features
* **Silence Gap Insertion**: Inserts configurable digital silence gaps (`0.0` PCM) to force precise PO-33 auto-chops.
* **Anti-Click Protection**: 
  * *Micro-Fade Out*: Applies a 2ms linear fade-out at the end of each slice to avoid clicking.
  * *Zero-Crossing Snap*: Automatically snaps markers to the nearest zero-crossing point of the waveform.
* **Smart Peak Normalization**: Automatically normalizes audio to 0dBFS or -0.3dBFS to ensure the best recording level for the PO-33 ADC.
* **Memory Budget Tracker**: Visualizes how much of the PO-33's ~40-second memory budget is being consumed by your current setup (including pre-roll and silence gaps).

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/omwcoding/PO-Companion.git
   cd PO-Companion
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the local development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

4. Build for production:
   ```bash
   npm run build
   ```

---

## 📂 Project Structure

* `src/App.vue`: Main application entry point and user interface.
* `src/composables/useAudioEngine.ts`: Manages the Web Audio API context, loading files, and playing/stopping preview buffers.
* `src/services/`:
  * [audioDecoder.ts](file:///c:/Users/Omar/Desktop/PO-Companion/src/services/audioDecoder.ts) — Decodes and resamples audio files (resampling to 44.1kHz mono).
  * [audioNormalizer.ts](file:///c:/Users/Omar/Desktop/PO-Companion/src/services/audioNormalizer.ts) — Applies peak normalization.
  * [pcmConcatenator.ts](file:///c:/Users/Omar/Desktop/PO-Companion/src/services/pcmConcatenator.ts) — Handles slot chopping, micro-fades, zero-crossing detection, and silence gap concatenation.
  * [wavEncoder.ts](file:///c:/Users/Omar/Desktop/PO-Companion/src/services/wavEncoder.ts) — Encodes Float32 PCM arrays into exportable WAV files.
* `src/stores/useSampleStore.ts`: Pinia store containing active samples, slot configurations, and application settings.
* `docs/TECHNICAL.md`: Full technical specifications and architecture details.

---

## 🗺️ Roadmap & Phases

The development of PO-Companion is structured in several phases:

*   **Phase 1: Audio Engine Core** ✅
    *   [x] File uploading, decoding, and resampling.
    *   [x] Digital silence gap insertion.
    *   [x] Anti-click (Zero-crossing & micro-fades).
    *   [x] Peak normalization.
    *   [x] WAV Export and basic debug UI.
*   **Phase 2: Mobile-First Visual Chopper** ✅
    *   [x] Interactive waveform rendering (WaveformOverview + WaveformDetail with OffscreenCanvas).
    *   [x] Touch-friendly drag-and-drop slice markers (pinch, pan, long-press).
    *   [x] Pad-by-pad preview playback (Web Audio API).
    *   [x] 4×4 PadGrid with visual states (empty, assigned, selected, playing).
    *   [x] BudgetMeter — real-time 40s memory tracker with per-pad breakdown.
    *   [x] Pinia state management integration.
*   **Phase 3: UI Polish & Power Tools** *(Next)*
    *   [ ] Mini-waveform thumbnail inside each PadCell.
    *   [ ] Normalize action exposed per-pad in the options modal.
    *   [ ] Phosphor/CRT theme (green-on-black retro terminal aesthetic).
    *   [ ] Attack/Release envelope overlay on waveform.
    *   [ ] PO-33 Sync Protocol (L=clock / R=audio split).
    *   [ ] PO-33 Sound Preview (simulating 23.4kHz 8-bit µ-law compression).
    *   [ ] Multi-source sample loading.
    > 💡 *UI patterns inspired by [Best Friend](https://apps.apple.com/us/app/best-friend/id6782250723) — the iOS companion app for TE EP-Series samplers. See [competitive analysis](docs/TECHNICAL.md#10-analisi-competitiva-e-riferimenti-ui) for details.*
*   **Phase 4: Offline & PWA**
    *   [ ] Bank Snapshot — save/recall full 16-pad configurations as JSON.
    *   [ ] Repitch per-pad (speed-up sample to save memory budget).
    *   [ ] Local database persistence (IndexedDB/Dexie).
    *   [ ] PWA installation support for full offline usage.
*   **Phase 5: Native App**
    *   [ ] Compilation for iOS & Android using Capacitor.

---

## 🤝 Contributing

Contributions are welcome! Please check out [docs/TECHNICAL.md](file:///c:/Users/Omar/Desktop/PO-Companion/docs/TECHNICAL.md) for detailed guidelines, constraints, and architecture explanations.

For UI/UX design decisions and competitive landscape analysis, see [§10 — Analisi Competitiva](docs/TECHNICAL.md#10-analisi-competitiva-e-riferimenti-ui).

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
