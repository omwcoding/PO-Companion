<template>
  <div class="transport-bar">
    <!-- Left: transport controls -->
    <div class="transport-controls">
      <button class="transport-btn" @click="seekToStart" title="Torna all'inizio">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
        </svg>
      </button>

      <button
        class="transport-btn play-btn"
        :class="{ 'is-playing': engine.isPlaying.value }"
        @click="togglePlay"
        :title="engine.isPlaying.value ? 'Ferma' : 'Riproduci output'"
        :disabled="!store.outputBuffer"
      >
        <!-- Play icon -->
        <svg v-if="!engine.isPlaying.value" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <!-- Stop icon -->
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h12v12H6z"/>
        </svg>
      </button>

      <button class="transport-btn" @click="seekToEnd" title="Vai alla fine">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5-4v8l-5.5-4zm7.5 6h2V6h-2z"/>
        </svg>
      </button>
    </div>

    <!-- Center: progress / time -->
    <div class="transport-progress">
      <div class="progress-bar" @click="onProgressClick">
        <div
          class="progress-fill"
          :style="{ width: `${progressPercent}%` }"
        />
        <div
          class="progress-thumb"
          :style="{ left: `${progressPercent}%` }"
          :class="{ visible: engine.isPlaying.value }"
        />
      </div>
      <div class="progress-time">
        <span class="current-time">{{ formatTime(engine.currentTime.value) }}</span>
        <span class="separator">/</span>
        <span class="total-time">{{ formatTime(totalDuration) }}</span>
      </div>
    </div>

    <!-- Right: output volume (visual only or for preview) -->
    <div class="output-controls">
      <div class="volume-control" title="Volume anteprima">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
        <input
          type="range"
          min="0"
          max="100"
          v-model.number="volumePercent"
          class="volume-slider"
        />
        <span class="volume-value">{{ volumePercent }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useWaveformState } from '@/composables/useWaveformState'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useSampleStore } from '@/stores/useSampleStore'

const waveform = useWaveformState()
const engine = useAudioEngine()
const store = useSampleStore()

const volumePercent = ref(80)

const totalDuration = computed(() => store.outputDurationSeconds)

const progressPercent = computed(() => {
  if (totalDuration.value === 0) return 0
  return (engine.currentTime.value / totalDuration.value) * 100
})

// Sincronizza playhead di waveform detail
watch(() => engine.currentTime.value, (newTime) => {
  waveform.setPlayhead(newTime)
})

function togglePlay() {
  if (engine.isPlaying.value) {
    engine.stop()
    return
  }

  const output = store.outputBuffer
  if (!output || output.length === 0) return

  // Play output buffer starting at current time, supporting stereo split & PO-33 simulation
  engine.playFloat32(
    output,
    engine.currentTime.value,
    store.settings.syncEnabled ? 2 : 1,
    store.settings.po33Simulation
  )
}

function seekToStart() {
  engine.stop()
  waveform.setPlayhead(0)
  if (store.outputBuffer) {
    const buf = engine.createBufferFromFloat32(
      store.outputBuffer,
      store.settings.syncEnabled ? 2 : 1,
      store.settings.po33Simulation
    )
    engine.seek(0, buf)
  }
}

function seekToEnd() {
  engine.stop()
  waveform.setPlayhead(totalDuration.value)
  if (store.outputBuffer) {
    const buf = engine.createBufferFromFloat32(
      store.outputBuffer,
      store.settings.syncEnabled ? 2 : 1,
      store.settings.po33Simulation
    )
    engine.seek(totalDuration.value, buf)
  }
}

function onProgressClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  const targetTime = ratio * totalDuration.value

  const output = store.outputBuffer
  if (output) {
    const buf = engine.createBufferFromFloat32(
      output,
      store.settings.syncEnabled ? 2 : 1,
      store.settings.po33Simulation
    )
    engine.seek(targetTime, buf)
  }
}

function formatTime(s: number): string {
  if (isNaN(s) || s <= 0) return '0:00.0'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}
</script>

<style scoped>
</style>
