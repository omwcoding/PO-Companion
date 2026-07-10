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
</style>
