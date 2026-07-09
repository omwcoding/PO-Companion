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

    <div class="header-right">
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
}

defineProps<Props>()

defineEmits<{
  (e: 'generate'): void
  (e: 'export'): void
}>()

const store = useSampleStore()
const waveform = useWaveformState()
const engine = useAudioEngine()

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

.theme-toggle-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.theme-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-color: rgba(255, 255, 255, 0.25);
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

@media (max-width: 480px) {
  .logo-title {
    display: none;
  }
  .status-badge {
    display: none;
  }
}
</style>
