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
  if (!s || isNaN(s) || s < 0) return '0:00.0'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}
</script>

<style scoped>
.transport-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(17, 17, 25, 0.75);
  border-top: 1.5px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  backdrop-filter: blur(10px);
}

.transport-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.transport-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
}

.transport-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.transport-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.play-btn {
  width: 40px;
  height: 40px;
  background: #FF6B2B;
  border-color: transparent;
  color: white;
  border-radius: 50%;
  box-shadow: 0 4px 10px rgba(255, 107, 43, 0.25);
}

.play-btn:hover:not(:disabled) {
  background: #FF8A50;
  color: white;
  transform: scale(1.05);
}

.play-btn.is-playing {
  background: #FF5252;
  box-shadow: 0 4px 10px rgba(255, 82, 82, 0.25);
}

.transport-progress {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.progress-bar {
  position: relative;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  cursor: pointer;
  overflow: visible;
}

.progress-fill {
  height: 100%;
  background: #FF6B2B;
  border-radius: 2px;
  transition: width 0.05s linear;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%) scale(0);
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transition: transform 0.15s;
  pointer-events: none;
}

.progress-thumb.visible {
  transform: translate(-50%, -50%) scale(1);
}

.progress-time {
  display: flex;
  gap: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
}

.current-time {
  color: rgba(255, 255, 255, 0.7);
}

.separator {
  color: rgba(255, 255, 255, 0.2);
}

.total-time {
  color: rgba(255, 255, 255, 0.35);
}

.output-controls {
  flex-shrink: 0;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.4);
}

.volume-slider {
  width: 60px;
  height: 3px;
  appearance: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  cursor: pointer;
  accent-color: #FF6B2B;
}

.volume-value {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.35);
  min-width: 28px;
}

@media (max-width: 480px) {
  .volume-control { display: none; }
  .transport-bar { padding: 8px 12px; gap: 8px; }
}
</style>
