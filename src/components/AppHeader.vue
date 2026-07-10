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
        class="header-btn theme-toggle-btn"
        :class="{ 'is-active': isPhosphor }"
        @click="toggleTheme"
        :title="isPhosphor ? 'Disattiva tema CRT Phosphor' : 'Attiva tema CRT Phosphor'"
      >
        {{ isPhosphor ? '🟢 CRT' : '⚫ CRT' }}
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
import { ref, computed, onMounted } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'
import { useWaveformState } from '@/composables/useWaveformState'
import { useAudioEngine } from '@/composables/useAudioEngine'

const isPhosphor = ref(false)

function toggleTheme() {
  isPhosphor.value = !isPhosphor.value
  if (isPhosphor.value) {
    document.documentElement.classList.add('theme-phosphor')
    localStorage.setItem('theme', 'phosphor')
  } else {
    document.documentElement.classList.remove('theme-phosphor')
    localStorage.setItem('theme', 'default')
  }
}

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'phosphor') {
    isPhosphor.value = true
    document.documentElement.classList.add('theme-phosphor')
  }
})

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
.app-header {
  position: sticky;
  top: 0;
  z-index: 500;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(13, 13, 20, 0.8);
  backdrop-filter: blur(16px);
  border-bottom: 1.5px solid rgba(255, 255, 255, 0.06);
  height: 56px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 20px;
}

.logo-title {
  font-size: 16px;
  font-weight: 700;
  color: white;
  margin: 0;
  letter-spacing: -0.2px;
}

.status-badge {
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
}

.status-ok {
  background: rgba(0, 230, 118, 0.1);
  color: #00E676;
  border-color: rgba(0, 230, 118, 0.15);
}

.status-warning {
  background: rgba(255, 217, 61, 0.1);
  color: #FFD93D;
  border-color: rgba(255, 217, 61, 0.15);
}

.status-error {
  background: rgba(255, 82, 82, 0.1);
  color: #FF5252;
  border-color: rgba(255, 82, 82, 0.15);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  font-size: 11px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.generate-btn {
  background: rgba(0, 229, 255, 0.1);
  border: 1.5px solid rgba(0, 229, 255, 0.25);
  color: #00E5FF;
}

.generate-btn:hover:not(:disabled) {
  background: #00E5FF;
  color: #000;
  border-color: #00E5FF;
}

.generate-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.25);
}

.export-btn {
  background: #FF6B2B;
  border: none;
  color: white;
}

.export-btn:hover:not(:disabled) {
  background: #FF8A50;
  box-shadow: 0 0 10px rgba(255, 107, 43, 0.4);
}

.export-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.25);
}

.theme-toggle-btn, .snapshot-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.theme-toggle-btn:hover, .snapshot-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-color: rgba(255, 255, 255, 0.25);
}

.snapshot-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.theme-toggle-btn.is-active {
  background: rgba(57, 255, 20, 0.1);
  border-color: rgba(57, 255, 20, 0.4);
  color: #39FF14;
}

.pulse-text {
  animation: pulse 1.2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  max-width: 380px;
  margin: 0 16px;
}

.preset-strip {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px 4px;
  width: 100%;
  gap: 4px;
}

.preset-select {
  flex-grow: 1;
  background: transparent;
  border: none;
  color: white;
  font-size: 11px;
  font-weight: 700;
  outline: none;
  padding: 4px 6px;
  cursor: pointer;
  max-width: 260px;
}

.preset-select optgroup {
  background: #1a1a26;
  color: white;
}

.preset-select option {
  background: #1a1a26;
  color: white;
}

.strip-btn {
  background: transparent;
  border: none;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: all 0.15s;
}

.strip-btn:hover:not(:disabled) {
  opacity: 1;
  background: rgba(255, 255, 255, 0.06);
}

.strip-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .header-center {
    display: none;
  }
}

@media (max-width: 480px) {
  .logo-title {
    display: none;
  }
  .status-badge {
    display: none;
  }
}
</style>
