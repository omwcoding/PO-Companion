<template>
  <div class="chop-toolbar">
    <!-- Chop to Grid -->
    <div class="tool-group">
      <button
        class="tool-btn"
        :disabled="!hasSource"
        @click="showChopInput = !showChopInput"
        title="Divide source into N equal segments"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/>
        </svg>
        Chop to Grid
      </button>

      <transition name="fade">
        <div v-if="showChopInput" class="chop-input-panel">
          <label class="chop-label">Segments:</label>
          <div class="chop-presets">
            <button
              v-for="n in [4, 8, 16]"
              :key="n"
              class="preset-btn"
              :class="{ active: chopCount === n }"
              @click="chopCount = n"
            >{{ n }}</button>
          </div>
          <input
            type="number"
            v-model.number="chopCount"
            min="2"
            max="16"
            class="chop-number-input"
          />
          <button class="apply-btn" @click="applyChopToGrid">
            Apply
          </button>
        </div>
      </transition>
    </div>

    <!-- Divider -->
    <div class="toolbar-divider" />

    <!-- Auto-detect transienti -->
    <div class="tool-group">
      <button
        class="tool-btn"
        :class="{ active: props.showTransients }"
        :disabled="!hasSource || isDetecting"
        @click="toggleTransients"
        title="Auto-detect transients"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 5v5.41L6.5 5.88 5.09 7.3 10.7 12.9 5.09 18.5l1.41 1.41 5.5-5.53V21h2v-6.62l5.5 5.53 1.41-1.41-5.61-5.6 5.61-5.62-1.41-1.41-5.5 5.53V5h-2z"/>
        </svg>
        <span v-if="isDetecting" class="detecting-label">Detecting…</span>
        <span v-else>Transienti</span>
        <span v-if="transientCount > 0" class="transient-count">{{ transientCount }}</span>
      </button>

      <!-- Snap to nearest transient -->
      <button
        v-if="props.showTransients && transientCount > 0"
        class="tool-btn secondary"
        :disabled="!store.selectedSlot?.isAssigned"
        @click="$emit('snapToTransient')"
        title="Snap selected marker to nearest transient"
      >
        ⟶ Snap
      </button>
    </div>

    <!-- Gap settings -->
    <div class="toolbar-divider" />

    <div class="gap-controls">
      <label class="gap-label" title="Silence gap between pads">Gap</label>
      <input
        type="range"
        min="10"
        max="200"
        step="5"
        :value="store.settings.gapDurationMs"
        @input="onGapChange"
        class="gap-slider"
        title="Gap between pads (ms)"
      />
      <span class="gap-value">{{ store.settings.gapDurationMs }}ms</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'
import { useWaveformState } from '@/composables/useWaveformState'
import type { TransientPoint } from '@/types'

interface Props {
  transients?: TransientPoint[]
  showTransients?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  transients: () => [],
  showTransients: false,
})

const emit = defineEmits<{
  (e: 'detectTransients'): void
  (e: 'toggleTransients'): void
  (e: 'snapToTransient'): void
}>()

const store = useSampleStore()
const waveform = useWaveformState()

const showChopInput = ref(false)
const chopCount = ref(16)
const isDetecting = ref(false)

const hasSource = computed(() => waveform.hasSource.value)
const transientCount = computed(() => props.transients.length)

// ── Chop to Grid ──────────────────────────────────────────────────────────────

function applyChopToGrid() {
  const total = waveform.sourceDuration.value
  if (total === 0) return
  const n = Math.max(2, Math.min(16, chopCount.value))
  const segDur = total / n

  for (let i = 0; i < n; i++) {
    const start = i * segDur
    const end = Math.min(total, (i + 1) * segDur)
    const slotId = i + 1
    // Usa il buffer sorgente del primo slot assegnato o il primo buffer
    const sourceId = store.assignedSlots[0]?.sourceBufferId
      ?? (store.audioBuffers.size > 0 ? [...store.audioBuffers.keys()][0] : null)
    if (!sourceId) break
    store.assignSlot(slotId, sourceId, start, end)
  }

  showChopInput.value = false
  store.selectSlot(0)
}

// ── Transients ────────────────────────────────────────────────────────────────

async function toggleTransients() {
  if (props.showTransients) {
    emit('toggleTransients')
    return
  }
  isDetecting.value = true
  try {
    emit('detectTransients')
    await new Promise(r => setTimeout(r, 100))
  } finally {
    isDetecting.value = false
    emit('toggleTransients')
  }
}

// ── Gap ───────────────────────────────────────────────────────────────────────

function onGapChange(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value)
  store.updateSettings({ gapDurationMs: val })
}
</script>

<style scoped>
.chop-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1.5px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.55);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.tool-btn:hover:not(:disabled) {
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.9);
  background: rgba(255,255,255,0.08);
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tool-btn.active {
  border-color: #FFAB00;
  color: #FFAB00;
  background: rgba(255,171,0,0.1);
}

.tool-btn.secondary {
  padding: 5px 8px;
  font-size: 11px;
}

.detecting-label {
  animation: pulse 1s infinite;
}

.transient-count {
  background: #FFAB00;
  color: #000;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 10px;
  line-height: 1.4;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.08);
  flex-shrink: 0;
}

/* Chop input panel */
.chop-input-panel {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1A1A26;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 6px 10px;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 100;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}

.chop-label {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
}

.chop-presets {
  display: flex;
  gap: 3px;
}

.preset-btn {
  width: 28px;
  height: 24px;
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.55);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.1s;
}

.preset-btn.active,
.preset-btn:hover {
  background: rgba(255,107,43,0.2);
  border-color: #FF6B2B;
  color: #FF6B2B;
}

.chop-number-input {
  width: 44px;
  height: 24px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 5px;
  color: white;
  font-size: 11px;
  text-align: center;
  padding: 0 4px;
}

.apply-btn {
  padding: 4px 10px;
  border-radius: 5px;
  background: #FF6B2B;
  border: none;
  color: white;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.apply-btn:hover { background: #FF8A50; }

/* Gap controls */
.gap-controls {
  display: flex;
  align-items: center;
  gap: 5px;
}

.gap-label {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  white-space: nowrap;
}

.gap-slider {
  width: 70px;
  height: 3px;
  appearance: none;
  background: rgba(255,255,255,0.12);
  border-radius: 2px;
  cursor: pointer;
  accent-color: #FF6B2B;
}

.gap-value {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255,255,255,0.4);
  min-width: 36px;
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s, transform 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (max-width: 480px) {
  .gap-slider { width: 50px; }
  .gap-value { display: none; }
}
</style>
