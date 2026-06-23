<template>
  <div class="file-upload-container">
    <!-- Drop zone overlay when dragging over the whole app (optional, but good UX) -->
    <div
      v-if="isDragging"
      class="drag-overlay"
      @dragover.prevent
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <div class="drag-message">
        <span class="drag-icon">📥</span>
        <span class="drag-text">Rilascia il file per caricarlo</span>
      </div>
    </div>

    <!-- Active Source (Collapsed State) -->
    <div v-if="waveform.hasSource.value && store.bufferMeta.size > 0" class="active-file-bar">
      <div class="file-meta-info">
        <span class="file-icon">🎵</span>
        <div class="file-details">
          <div class="file-name" :title="activeMeta?.fileName">{{ activeMeta?.fileName }}</div>
          <div class="file-specs">
            <span>{{ formatDuration(activeMeta?.duration ?? 0) }}</span>
            <span class="dot-separator">•</span>
            <span>{{ activeMeta?.sampleRate }}Hz</span>
            <span v-if="activeMetaStatus?.resampled" class="resampled-badge" title="Ricampionato a 44.1kHz per il PO-33">
              Resampled
            </span>
          </div>
        </div>
      </div>

      <div class="action-buttons">
        <button class="action-btn replace-btn" @click="triggerFileInput">
          Cambia File
        </button>
        <button class="action-btn reset-btn" @click="resetCurrentFile" title="Rimuovi file e svuota tutto">
          Svuota
        </button>
      </div>
    </div>

    <!-- Drag & Drop Zone (Expanded State) -->
    <div
      v-else
      class="drop-zone"
      :class="{ 'is-dragover': isDragOver, 'is-decoding': isDecoding }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="onDrop"
      @click="triggerFileInput"
    >
      <input
        type="file"
        ref="fileInputRef"
        class="hidden-file-input"
        accept="audio/*"
        @change="onFileInput"
      />

      <div v-if="isDecoding" class="decoding-state">
        <div class="spinner" />
        <span class="decoding-text">Analisi e ricampionamento audio in corso...</span>
      </div>

      <div v-else class="upload-prompt">
        <div class="upload-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
          </svg>
        </div>
        <h3 class="upload-title">Trascina qui il tuo audio</h3>
        <p class="upload-subtitle">Supporta WAV, MP3, M4A, AIF, FLAC. Clicca per sfogliare.</p>
      </div>
    </div>

    <!-- Error Banner -->
    <transition name="slide">
      <div v-if="decodeError" class="error-banner">
        <span class="error-message">⚠ {{ decodeError }}</span>
        <button class="error-close" @click="decodeError = ''">×</button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useSampleStore } from '@/stores/useSampleStore'
import { useWaveformState } from '@/composables/useWaveformState'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { decodeAudioFile, isAudioFileSupported } from '@/services/audioDecoder'
import { mixToMono, computeOverviewPeaks } from '@/utils/peakAnalyzer'

const store = useSampleStore()
const waveform = useWaveformState()
const engine = useAudioEngine()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isDragOver = ref(false)
const isDecoding = ref(false)
const decodeError = ref('')


// metadata dell'audio caricato
const activeMeta = computed(() => {
  if (store.bufferMeta.size === 0) return null
  const keys = [...store.bufferMeta.keys()]
  return store.bufferMeta.get(keys[0]) ?? null
})

const activeMetaStatus = ref<{ resampled: boolean } | null>(null)

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileInput(e: Event) {
  const target = e.target as HTMLInputElement
  handleFiles(target.files)
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  isDragging.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}

async function handleFiles(files: FileList | null) {
  if (!files || files.length === 0) return
  const file = files[0]

  if (!isAudioFileSupported(file)) {
    decodeError.value = `Formato file non supportato o non riconosciuto: ${file.name}`
    return
  }

  decodeError.value = ''
  isDecoding.value = true

  try {
    const ctx = engine.getContext()
    const result = await decodeAudioFile(file, ctx)

    // Reset precedente stato waveform
    waveform.resetWaveform()
    store.resetAll()

    const id = uuidv4()
    // Mix to mono
    const pcmData = mixToMono(result.buffer)

    // Registra buffer in store
    store.registerBuffer(id, pcmData, result.buffer, result.fileName)
    activeMetaStatus.value = { resampled: result.resampled }

    // Calcola overview peaks (1000 bin per l'intero file)
    const overviewPeaks = computeOverviewPeaks(pcmData, 1000)
    waveform.setPeaks(overviewPeaks)

    // Inizializza la finestra visuale del detail (mostra i primi 10 secondi, o meno se file più corto)
    waveform.initView(result.durationSeconds, 10)

    // Seleziona il pad 1 per iniziare subito
    store.selectSlot(1)

    // Assegna opzionalmente il primo segmento come placeholder al Pad 1
    // (o lascia vuoto in modo che l'utente scelga)
  } catch (err) {
    decodeError.value = err instanceof Error ? err.message : String(err)
    console.error('Decoding failed:', err)
  } finally {
    isDecoding.value = false
    if (fileInputRef.value) fileInputRef.value.value = '' // Reset input
  }
}

function resetCurrentFile() {
  if (confirm('Vuoi davvero rimuovere il file e svuotare tutti i pad assegnati?')) {
    waveform.resetWaveform()
    store.resetAll()
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`
}
</script>

<style scoped>
.file-upload-container {
  width: 100%;
  position: relative;
}

/* Overlay globale per drag&drop */
.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 15, 0.9);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drag-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #00E5FF;
}

.drag-icon {
  font-size: 64px;
  animation: bounce 1.5s infinite;
}

.drag-text {
  font-size: 20px;
  font-weight: 600;
}

/* Expanded state: Drop Zone */
.drop-zone {
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.drop-zone:hover, .drop-zone.is-dragover {
  border-color: #FF6B2B;
  background: rgba(255, 107, 43, 0.05);
}

.drop-zone.is-decoding {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.01);
  cursor: wait;
}

.hidden-file-input {
  display: none;
}

.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.upload-icon {
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 12px;
  transition: color 0.2s;
}

.drop-zone:hover .upload-icon {
  color: #FF6B2B;
}

.upload-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  margin: 0 0 6px 0;
}

.upload-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
}

/* Collapsed state: Active File Bar */
.active-file-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 14px;
  gap: 12px;
  backdrop-filter: blur(10px);
}

.file-meta-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-grow: 1;
}

.file-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.file-details {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.file-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-specs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

.dot-separator {
  color: rgba(255, 255, 255, 0.15);
}

.resampled-badge {
  font-size: 9px;
  background: rgba(0, 229, 255, 0.12);
  color: #00E5FF;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.replace-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.replace-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.reset-btn {
  background: rgba(255, 82, 82, 0.05);
  border: 1px solid rgba(255, 82, 82, 0.15);
  color: #FF5252;
}

.reset-btn:hover {
  background: rgba(255, 82, 82, 0.12);
  border-color: #FF5252;
}

/* Loading decoding state */
.decoding-state {
  display: flex;
  align-items: center;
  gap: 12px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: #FF6B2B;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.decoding-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

/* Error banner */
.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 82, 82, 0.12);
  border: 1px solid rgba(255, 82, 82, 0.25);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 10px;
  color: #FF8A80;
  font-size: 12px;
}

.error-message {
  font-weight: 500;
}

.error-close {
  background: transparent;
  border: none;
  color: #FF8A80;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

/* Animations */
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.slide-enter-active, .slide-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.slide-enter-from, .slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
