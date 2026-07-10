<template>
  <header class="app-header">
    <div class="header-left">
      <div class="logo">
        <span class="logo-icon">🎛️</span>
        <h1 class="logo-title">PO-Companion</h1>
      </div>
      <span class="status-badge" :class="statusClass">
        {{ engine.contextSampleRate.value ? `${engine.contextSampleRate.value} Hz` : 'Muted' }}
      </span>
    </div>

    <div class="header-center">
      <div v-if="hasSource" class="preset-strip">
        <select
          :value="store.activePresetId"
          @change="onPresetSelectChange"
          class="preset-select"
        >
          <option value="">-- Nessun Preset --</option>

          <optgroup v-if="factoryPresets.length > 0" label="Factory Presets">
            <option
              v-for="p in factoryPresets"
              :key="p.id"
              :value="'factory:' + p.id"
            >
              📁 {{ p.name }}
            </option>
          </optgroup>

          <optgroup v-if="userPresets.length > 0" label="I Miei Preset">
            <option
              v-for="p in userPresets"
              :key="p.id"
              :value="'user:' + p.id"
            >
              💾 {{ p.name }}
            </option>
          </optgroup>
        </select>

        <button
          class="strip-btn"
          :disabled="!store.activePresetId.startsWith('user:')"
          @click="$emit('quick-save')"
          title="Sovrascrivi Preset Corrente (Salvataggio rapido)"
        >
          💾
        </button>

        <button
          class="strip-btn"
          @click="$emit('save-as')"
          title="Salva come Nuovo Preset"
        >
          📝
        </button>

        <button
          class="strip-btn"
          :disabled="!store.activePresetId.startsWith('user:')"
          @click="$emit('delete-current')"
          title="Elimina Preset Corrente"
        >
          🗑️
        </button>

        <button
          class="strip-btn"
          @click="$emit('open-presets')"
          title="Gestione Avanzata Preset & Progetti"
        >
          ⚙️
        </button>
      </div>
    </div>

    <div class="header-right">
      <button
        class="header-btn guide-btn"
        @click="$emit('open-guide')"
        title="Scorciatoie & Guida Rapida PO-33"
      >
        📖 Guida
      </button>

      <button
        class="header-btn generate-btn"
        :disabled="!hasSource || isGenerating"
        @click="$emit('generate')"
        title="Concatena i segmenti e applica normalizzazione"
      >
        <span v-if="isGenerating" class="pulse-text">Concatenazione...</span>
        <span v-else>⚡ Concatena</span>
      </button>

      <button
        class="header-btn export-btn"
        :disabled="!store.outputBuffer"
        @click="$emit('export')"
        title="Esporta file WAV pronto per il PO-33"
      >
        📥 Scarica WAV
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'
import { useWaveformState } from '@/composables/useWaveformState'
import { useAudioEngine } from '@/composables/useAudioEngine'

interface Props {
  isGenerating?: boolean
  factoryPresets: any[]
  userPresets: any[]
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'export'): void
  (e: 'open-presets'): void
  (e: 'select-preset', val: string): void
  (e: 'quick-save'): void
  (e: 'save-as'): void
  (e: 'delete-current'): void
  (e: 'open-guide'): void
}>()

const store = useSampleStore()
const waveform = useWaveformState()
const engine = useAudioEngine()

function onPresetSelectChange(e: Event) {
  const select = e.target as HTMLSelectElement
  emit('select-preset', select.value)
}

const hasSource = computed(() => waveform.hasSource.value)

const statusClass = computed(() => {
  const sr = engine.contextSampleRate.value
  if (!sr) return 'status-error'
  if (sr === 44100) return 'status-ok'
  return 'status-warning' // iOS sample rate shift active
})
</script>

<style scoped>
</style>
