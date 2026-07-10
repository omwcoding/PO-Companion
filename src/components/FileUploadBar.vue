<template>
  <div class="file-upload-container">
    <!-- Input nascosto sempre montato nel DOM -->
    <input
      type="file"
      ref="fileInputRef"
      class="hidden-file-input"
      accept="audio/*"
      @change="onFileInput"
    />

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
          <select
            class="source-select"
            :value="store.activeSourceId"
            @change="store.activeSourceId = ($event.target as HTMLSelectElement).value"
          >
            <option
              v-for="[id, meta] in store.bufferMeta"
              :key="id"
              :value="id"
            >
              {{ meta.fileName }}
            </option>
          </select>
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
        <button class="action-btn add-btn" @click="triggerFileInput" title="Carica un altro file audio in memoria">
          ➕ Aggiungi File
        </button>
        <button
          class="action-btn delete-btn-icon"
          @click="deleteActiveFile"
          title="Rimuovi questo file"
          :disabled="store.bufferMeta.size <= 1"
        >
          🗑️
        </button>
        <button class="action-btn reset-btn" @click="resetCurrentFile" title="Rimuovi tutti i file e svuota tutto">
          Svuota Tutto
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

    const id = uuidv4()
    // Mix to mono
    const pcmData = mixToMono(result.buffer)

    // Calcola overview peaks (1000 bin per l'intero file)
    const overviewPeaks = computeOverviewPeaks(pcmData, 1000)

    // Registra buffer in store (imposta anche activeSourceId e memorizza i picchi)
    store.registerBuffer(id, pcmData, result.buffer, result.fileName, overviewPeaks)
    activeMetaStatus.value = { resampled: result.resampled }

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
  if (confirm('Vuoi davvero rimuovere TUTTI i file e svuotare tutti i pad assegnati?')) {
    waveform.resetWaveform()
    store.resetAll()
  }
}

function deleteActiveFile() {
  const id = store.activeSourceId
  if (!id) return
  const meta = store.bufferMeta.get(id)
  if (meta && confirm(`Sei sicuro di voler rimuovere il file "${meta.fileName}"? Qualsiasi pad associato a questo file verrà liberato.`)) {
    store.deleteSourceBuffer(id)
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
</style>
