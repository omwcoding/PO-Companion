<script setup lang="ts">
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useSampleStore } from '@/stores/useSampleStore'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { decodeAudioFile, isAudioFileSupported } from '@/services/audioDecoder'
import { concatenateSlots } from '@/services/pcmConcatenator'
import { normalize } from '@/services/audioNormalizer'
import { downloadWAV } from '@/services/wavEncoder'
import { formatDuration, formatDBFS, formatMs, formatPercent } from '@/utils/formatters'
import { PO33_MEMORY_SECONDS, PAD_COLORS } from '@/types'

const store = useSampleStore()
const engine = useAudioEngine()

// ── Upload ─────────────────────────────────────────────────────────────────
const isDragging = ref(false)
const isDecoding = ref(false)
const decodeError = ref('')

async function handleFiles(files: FileList | null) {
  if (!files || files.length === 0) return
  const file = files[0]

  if (!isAudioFileSupported(file)) {
    decodeError.value = `Formato non supportato: ${file.name}`
    return
  }

  decodeError.value = ''
  isDecoding.value = true

  try {
    const ctx = engine.getContext()
    const result = await decodeAudioFile(file, ctx)

    const id = uuidv4()
    const pcmData = result.buffer.getChannelData(0)

    store.registerBuffer(id, pcmData, result.buffer, result.fileName)

    // Imposta tutti i pad non assegnati come assegnati con l'intero buffer
    // (utile per debug rapido — l'utente può poi modificare i marker)
    activeSourceId.value = id
    activeBufferDuration.value = result.durationSeconds
    decodeInfo.value = {
      fileName: result.fileName,
      durationSeconds: result.durationSeconds,
      originalSampleRate: result.originalSampleRate,
      originalChannels: result.originalChannels,
      resampled: result.resampled,
      samples: result.buffer.length,
    }
  } catch (err) {
    decodeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isDecoding.value = false
  }
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}

function onFileInput(e: Event) {
  handleFiles((e.target as HTMLInputElement).files)
}

// ── Decoded file info ──────────────────────────────────────────────────────
const activeSourceId = ref('')
const activeBufferDuration = ref(0)
const decodeInfo = ref<{
  fileName: string
  durationSeconds: number
  originalSampleRate: number
  originalChannels: number
  resampled: boolean
  samples: number
} | null>(null)

// ── Slot table ─────────────────────────────────────────────────────────────
// Simple per-slot config for the debug UI
const slotConfigs = ref(
  Array.from({ length: 16 }, (_, i) => ({
    enabled: false,
    start: 0,
    end: 0,
    name: `Pad ${i + 1}`,
  }))
)

function applySlotConfig(index: number) {
  const cfg = slotConfigs.value[index]
  const slotId = index + 1
  if (!activeSourceId.value) return

  if (cfg.enabled) {
    store.assignSlot(slotId, activeSourceId.value, cfg.start, cfg.end)
    store.renameSlot(slotId, cfg.name)
  } else {
    store.clearSlot(slotId)
  }
}

function autoFillSlots() {
  if (!activeBufferDuration.value) return
  const n = 4 // Dividi in 4 parti uguali per default
  const dur = activeBufferDuration.value
  for (let i = 0; i < n; i++) {
    slotConfigs.value[i].enabled = true
    slotConfigs.value[i].start = parseFloat(((dur / n) * i).toFixed(3))
    slotConfigs.value[i].end = parseFloat(((dur / n) * (i + 1)).toFixed(3))
    slotConfigs.value[i].name = `Pad ${i + 1}`
    applySlotConfig(i)
  }
}

// ── Concatenation ──────────────────────────────────────────────────────────
const isGenerating = ref(false)
const generateError = ref('')
const normResult = ref<{ peakBefore: number; peakAfter: number; gain: number } | null>(null)

async function generateStream() {
  generateError.value = ''
  isGenerating.value = true
  normResult.value = null

  // Sincronizza i config con lo store prima di generare
  slotConfigs.value.forEach((_, i) => applySlotConfig(i))

  try {
    const result = concatenateSlots({
      slots: store.slots,
      sourceData: store.sourceBuffers,
      settings: store.settings,
    })

    // Normalizzazione
    const norm = normalize(result.data, store.settings.normalizationMode, store.settings.normalizationTarget)
    normResult.value = { peakBefore: norm.peakBefore, peakAfter: norm.peakAfter, gain: norm.gain }

    store.setOutputBuffer(result.data, result.durationSeconds, result.log)
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isGenerating.value = false
  }
}

// ── Playback ───────────────────────────────────────────────────────────────
function playOutput() {
  if (!store.outputBuffer) return
  engine.playFloat32(store.outputBuffer)
}

function stopPlayback() {
  engine.stop()
}

function playSource() {
  if (!activeSourceId.value) return
  const buf = store.audioBuffers.get(activeSourceId.value)
  if (buf) engine.play(buf)
}

// ── Export ─────────────────────────────────────────────────────────────────
function exportWAV() {
  if (!store.outputBuffer) return
  const name = decodeInfo.value?.fileName.replace(/\.[^.]+$/, '') ?? 'po-companion-output'
  downloadWAV(store.outputBuffer, `${name}-po33`)
}

// ── Budget ─────────────────────────────────────────────────────────────────
const budgetColor = computed(() => {
  const p = store.budgetUsed
  if (p < 0.7) return '#00E676'
  if (p < 0.9) return '#FFD93D'
  return '#FF5252'
})
</script>

<template>
  <div class="app">
    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <header class="app-header">
      <div class="header-logo">
        <span class="logo-icon">🎛️</span>
        <span class="logo-text">PO-Companion</span>
        <span class="logo-badge">Phase 1 — Debug UI</span>
      </div>
      <div class="header-info" v-if="engine.contextSampleRate.value">
        <span class="tag" :style="{ background: engine.contextSampleRate.value === 44100 ? '#00E676' : '#FF5252', color: '#000' }">
          AudioContext: {{ engine.contextSampleRate.value }}Hz
          {{ engine.contextSampleRate.value !== 44100 ? '⚠️ iOS fix active' : '✓' }}
        </span>
      </div>
    </header>

    <main class="app-main">

      <!-- ── Section 1: File Upload ────────────────────────────────────── -->
      <section class="card section">
        <div class="label">1 — Carica File Audio</div>

        <div
          class="drop-zone"
          :class="{ 'drop-zone--active': isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="onDrop"
        >
          <div class="drop-icon">🎵</div>
          <div class="drop-text">
            Trascina un file audio qui<br />
            <span class="drop-sub">MP3, WAV, OGG, M4A, FLAC</span>
          </div>
          <label class="btn btn-ghost" style="cursor: pointer;">
            Sfoglia file
            <input
              type="file"
              accept="audio/*"
              style="display:none"
              @change="onFileInput"
            />
          </label>
        </div>

        <div v-if="isDecoding" class="status-row">
          <span class="spinner"></span> Decodifica in corso...
        </div>

        <div v-if="decodeError" class="alert alert-danger">⚠️ {{ decodeError }}</div>

        <!-- File info -->
        <div v-if="decodeInfo" class="file-info">
          <div class="file-info__row">
            <span class="file-info__label">File</span>
            <span class="file-info__value">{{ decodeInfo.fileName }}</span>
          </div>
          <div class="file-info__row">
            <span class="file-info__label">Durata</span>
            <span class="file-info__value">{{ formatDuration(decodeInfo.durationSeconds) }}</span>
          </div>
          <div class="file-info__row">
            <span class="file-info__label">Sample Rate originale</span>
            <span class="file-info__value">
              {{ decodeInfo.originalSampleRate }}Hz
              <span v-if="decodeInfo.resampled" class="tag" style="background:#FF6B2B;color:#fff;margin-left:6px">Resampled → 44100Hz</span>
            </span>
          </div>
          <div class="file-info__row">
            <span class="file-info__label">Canali originali</span>
            <span class="file-info__value">{{ decodeInfo.originalChannels }} → Mono</span>
          </div>
          <div class="file-info__row">
            <span class="file-info__label">Campioni totali</span>
            <span class="file-info__value">{{ decodeInfo.samples.toLocaleString() }}</span>
          </div>

          <div class="file-actions">
            <button class="btn btn-ghost" @click="playSource" :disabled="engine.isPlaying.value">▶ Ascolta sorgente</button>
            <button class="btn btn-ghost" @click="stopPlayback" :disabled="!engine.isPlaying.value">⏹ Stop</button>
            <button class="btn btn-accent" @click="autoFillSlots">⊞ Auto-fill 4 pad</button>
          </div>
        </div>
      </section>

      <!-- ── Section 2: Slot Configuration ────────────────────────────── -->
      <section class="card section">
        <div class="label">2 — Configurazione Pad (Start / End in secondi)</div>

        <div v-if="!decodeInfo" class="empty-hint">Carica un file audio per configurare i pad.</div>

        <div v-else class="slot-table">
          <div class="slot-table__header">
            <span>Pad</span>
            <span>Abilitato</span>
            <span>Nome</span>
            <span>Start (s)</span>
            <span>End (s)</span>
            <span>Durata</span>
          </div>
          <div
            v-for="(cfg, i) in slotConfigs"
            :key="i"
            class="slot-table__row"
            :class="{ 'slot-table__row--active': cfg.enabled }"
          >
            <span class="pad-badge" :style="{ background: PAD_COLORS[i] }">{{ i + 1 }}</span>
            <input type="checkbox" v-model="cfg.enabled" @change="applySlotConfig(i)" />
            <input
              type="text"
              v-model="cfg.name"
              class="input-text"
              :disabled="!cfg.enabled"
              @change="applySlotConfig(i)"
            />
            <input
              type="number"
              v-model.number="cfg.start"
              step="0.001"
              min="0"
              :max="activeBufferDuration"
              class="input-num"
              :disabled="!cfg.enabled"
              @change="applySlotConfig(i)"
            />
            <input
              type="number"
              v-model.number="cfg.end"
              step="0.001"
              min="0"
              :max="activeBufferDuration"
              class="input-num"
              :disabled="!cfg.enabled"
              @change="applySlotConfig(i)"
            />
            <span class="slot-dur" v-if="cfg.enabled && cfg.end > cfg.start">
              {{ formatDuration(cfg.end - cfg.start) }}
            </span>
            <span class="slot-dur muted" v-else>—</span>
          </div>
        </div>
      </section>

      <!-- ── Section 3: Settings ────────────────────────────────────────── -->
      <section class="card section">
        <div class="label">3 — Impostazioni</div>

        <div class="settings-grid">
          <div class="setting-item">
            <label class="setting-label">Gap silenzio tra pad</label>
            <div class="setting-control">
              <input
                type="range"
                min="10" max="200" step="5"
                :value="store.settings.gapDurationMs"
                @input="store.updateSettings({ gapDurationMs: +($event.target as HTMLInputElement).value })"
              />
              <span class="setting-value">{{ formatMs(store.settings.gapDurationMs) }}</span>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">Pre-roll (silenzio iniziale)</label>
            <div class="setting-control">
              <input
                type="range"
                min="20" max="500" step="10"
                :value="store.settings.prefixSilenceMs"
                @input="store.updateSettings({ prefixSilenceMs: +($event.target as HTMLInputElement).value })"
              />
              <span class="setting-value">{{ formatMs(store.settings.prefixSilenceMs) }}</span>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">Target normalizzazione</label>
            <div class="setting-control">
              <input
                type="range"
                min="0.7" max="1.0" step="0.01"
                :value="store.settings.normalizationTarget"
                @input="store.updateSettings({ normalizationTarget: +($event.target as HTMLInputElement).value })"
              />
              <span class="setting-value">{{ formatDBFS(store.settings.normalizationTarget) }}</span>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">Modalità normalizzazione</label>
            <select
              class="input-select"
              :value="store.settings.normalizationMode"
              @change="store.updateSettings({ normalizationMode: ($event.target as HTMLSelectElement).value as 'global' | 'per-pad' })"
            >
              <option value="global">Global (intero flusso)</option>
              <option value="per-pad">Per-pad (ogni segmento)</option>
            </select>
          </div>

          <div class="setting-item">
            <label class="setting-label">Anti-click</label>
            <select
              class="input-select"
              :value="store.settings.antiClickMode"
              @change="store.updateSettings({ antiClickMode: ($event.target as HTMLSelectElement).value as 'fade' | 'zero-crossing' | 'both' })"
            >
              <option value="both">Entrambi (consigliato)</option>
              <option value="fade">Solo Micro-Fade</option>
              <option value="zero-crossing">Solo Zero-Crossing</option>
            </select>
          </div>

          <div class="setting-item">
            <label class="setting-label">Fade duration</label>
            <div class="setting-control">
              <input
                type="range"
                min="1" max="10" step="1"
                :value="store.settings.fadeDurationMs"
                @input="store.updateSettings({ fadeDurationMs: +($event.target as HTMLInputElement).value })"
              />
              <span class="setting-value">{{ formatMs(store.settings.fadeDurationMs) }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Section 4: Actions ─────────────────────────────────────────── -->
      <section class="card section">
        <div class="label">4 — Genera & Invia</div>

        <!-- Budget meter -->
        <div class="budget-wrap">
          <div class="budget-bar-bg">
            <div
              class="budget-bar-fill"
              :style="{ width: formatPercent(store.budgetUsed), background: budgetColor }"
            ></div>
          </div>
          <div class="budget-text">
            <span>{{ formatDuration(store.estimatedDurationSeconds) }}</span>
            <span :style="{ color: budgetColor }">
              {{ formatPercent(store.budgetUsed) }} del budget
              {{ store.isOverBudget ? '⚠️ OVER BUDGET' : '' }}
            </span>
            <span>{{ formatDuration(PO33_MEMORY_SECONDS) }}</span>
          </div>
        </div>

        <div class="action-row">
          <button
            class="btn btn-primary"
            @click="generateStream"
            :disabled="isGenerating || store.assignedSlots.length === 0"
          >
            <span v-if="isGenerating"><span class="spinner-sm"></span> Generazione...</span>
            <span v-else>⚙️ Genera Flusso</span>
          </button>

          <button
            class="btn btn-success"
            @click="playOutput"
            :disabled="!store.outputBuffer || engine.isPlaying.value"
          >
            ▶ Anteprima Output
          </button>

          <button
            class="btn btn-ghost"
            @click="stopPlayback"
            :disabled="!engine.isPlaying.value"
          >
            ⏹ Stop
          </button>

          <button
            class="btn btn-accent"
            @click="exportWAV"
            :disabled="!store.outputBuffer"
          >
            ⬇ Scarica WAV
          </button>
        </div>

        <div v-if="generateError" class="alert alert-danger">⚠️ {{ generateError }}</div>

        <!-- Norm result -->
        <div v-if="normResult" class="norm-result">
          <div class="norm-result__item">
            <span>Picco prima</span>
            <strong>{{ formatDBFS(normResult.peakBefore) }}</strong>
          </div>
          <div class="norm-result__item">
            <span>Gain applicato</span>
            <strong>×{{ normResult.gain.toFixed(3) }}</strong>
          </div>
          <div class="norm-result__item">
            <span>Picco dopo</span>
            <strong :style="{ color: '#00E676' }">{{ formatDBFS(normResult.peakAfter) }}</strong>
          </div>
          <div class="norm-result__item">
            <span>Durata output</span>
            <strong>{{ formatDuration(store.outputDurationSeconds) }}</strong>
          </div>
        </div>

        <!-- Playback progress -->
        <div v-if="engine.isPlaying.value" class="playback-progress">
          <div class="playback-bar-bg">
            <div
              class="playback-bar-fill"
              :style="{ width: formatPercent(engine.progress.value) }"
            ></div>
          </div>
          <span>{{ formatDuration(engine.currentTime.value) }} / {{ formatDuration(engine.duration.value) }}</span>
        </div>
      </section>

      <!-- ── Section 5: Log ──────────────────────────────────────────────── -->
      <section class="card section" v-if="store.concatenationLog.length > 0">
        <div class="label">5 — Log Concatenazione</div>
        <div class="log-box">
          <div
            v-for="(line, i) in store.concatenationLog"
            :key="i"
            class="log-line"
            :class="{
              'log-line--warn': line.includes('⚠️'),
              'log-line--ok': line.includes('✓'),
            }"
          >{{ line }}</div>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
/* ─── Layout ───────────────────────────────────────────────────────────── */
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  background: var(--color-surface);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  backdrop-filter: blur(12px);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon { font-size: 22px; }

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: -0.02em;
}

.logo-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background: var(--color-surface-2);
  color: var(--color-muted);
  letter-spacing: 0.05em;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

.section { }

/* ─── Drop Zone ──────────────────────────────────────────────────────── */
.drop-zone {
  border: 2px dashed rgba(255,255,255,0.12);
  border-radius: var(--radius-md);
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
  cursor: default;
}

.drop-zone--active {
  border-color: var(--color-primary);
  background: rgba(255, 107, 43, 0.06);
}

.drop-icon { font-size: 36px; }
.drop-text { color: var(--color-muted); font-size: 14px; line-height: 1.6; }
.drop-sub { font-size: 12px; opacity: 0.7; }

/* ─── Status / Alerts ────────────────────────────────────────────────── */
.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  color: var(--color-muted);
  font-size: 13px;
}

.alert {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.alert-danger { background: rgba(255, 82, 82, 0.12); color: #FF5252; border: 1px solid rgba(255,82,82,0.3); }

/* ─── File Info ─────────────────────────────────────────────────────── */
.file-info {
  margin-top: 14px;
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.file-info__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 13px;
}
.file-info__row:last-child { border-bottom: none; }
.file-info__label { color: var(--color-muted); }
.file-info__value { font-weight: 600; }

.file-actions {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-wrap: wrap;
}

/* ─── Slot Table ────────────────────────────────────────────────────── */
.slot-table {
  margin-top: 10px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.06);
}

.slot-table__header {
  display: grid;
  grid-template-columns: 40px 60px 1fr 100px 100px 80px;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-surface-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted);
}

.slot-table__row {
  display: grid;
  grid-template-columns: 40px 60px 1fr 100px 100px 80px;
  gap: 8px;
  padding: 6px 12px;
  align-items: center;
  border-top: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s;
}

.slot-table__row--active { background: rgba(255,107,43,0.05); }

.pad-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  color: #000;
}

.slot-dur { font-size: 12px; color: var(--color-muted); }
.muted { opacity: 0.4; }

/* ─── Inputs ─────────────────────────────────────────────────────────── */
.input-text, .input-num, .input-select {
  background: var(--color-surface-2);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 5px;
  color: var(--color-text);
  padding: 4px 8px;
  font-size: 12px;
  width: 100%;
}
.input-text:focus, .input-num:focus, .input-select:focus {
  outline: none;
  border-color: var(--color-primary);
}
.input-text:disabled, .input-num:disabled { opacity: 0.3; }
.input-num { text-align: right; }

/* ─── Settings ──────────────────────────────────────────────────────── */
.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 10px;
}

@media (max-width: 600px) {
  .settings-grid { grid-template-columns: 1fr; }
}

.setting-item { display: flex; flex-direction: column; gap: 6px; }
.setting-label { font-size: 12px; color: var(--color-muted); font-weight: 600; }
.setting-control { display: flex; align-items: center; gap: 10px; }
.setting-control input[type="range"] { flex: 1; accent-color: var(--color-primary); }
.setting-value { font-size: 12px; font-weight: 700; min-width: 70px; text-align: right; }

/* ─── Budget ─────────────────────────────────────────────────────────── */
.budget-wrap { margin-bottom: 16px; }

.budget-bar-bg {
  height: 10px;
  background: var(--color-surface-2);
  border-radius: 99px;
  overflow: hidden;
}

.budget-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s, background 0.3s;
}

.budget-text {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-muted);
  margin-top: 5px;
}

/* ─── Actions ────────────────────────────────────────────────────────── */
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* ─── Norm Result ────────────────────────────────────────────────────── */
.norm-result {
  display: flex;
  gap: 24px;
  margin-top: 14px;
  padding: 12px 16px;
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
  flex-wrap: wrap;
}

.norm-result__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.norm-result__item span { font-size: 11px; color: var(--color-muted); }
.norm-result__item strong { font-size: 14px; }

/* ─── Playback ───────────────────────────────────────────────────────── */
.playback-progress {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.playback-bar-bg {
  height: 6px;
  background: var(--color-surface-2);
  border-radius: 99px;
  overflow: hidden;
}

.playback-bar-fill {
  height: 100%;
  background: var(--color-waveform);
  border-radius: 99px;
  transition: width 0.1s linear;
}

.playback-progress span {
  font-size: 11px;
  color: var(--color-muted);
  text-align: right;
}

/* ─── Log ────────────────────────────────────────────────────────────── */
.log-box {
  background: #0d0d14;
  border-radius: var(--radius-sm);
  padding: 14px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  max-height: 280px;
  overflow-y: auto;
  margin-top: 10px;
}

.log-line { padding: 1px 0; color: var(--color-muted); line-height: 1.7; }
.log-line--warn { color: #FFD93D; }
.log-line--ok { color: #00E676; }

/* ─── Spinner ────────────────────────────────────────────────────────── */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.spinner-sm {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
