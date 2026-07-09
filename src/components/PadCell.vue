<template>
  <div
    class="pad-cell"
    :class="{
      'is-assigned': slot.isAssigned,
      'is-selected': isSelected,
      'is-playing': isPlaying,
      'is-empty': !slot.isAssigned,
    }"
    :style="slot.isAssigned ? { '--pad-color': padColor } : {}"
    @pointerdown="onPointerDown"
    @pointermove="checkPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="cancelLongPress"
  >
    <!-- Background glow for assigned pads -->
    <div v-if="slot.isAssigned" class="pad-glow" />

    <!-- Content -->
    <div class="pad-content">
      <div class="pad-number">{{ slot.id }}</div>

      <div v-if="slot.isAssigned" class="pad-info">
        <div class="pad-name">{{ shortName }}</div>
        <div class="pad-duration">{{ durationLabel }}</div>
        <canvas ref="miniCanvas" class="mini-waveform-canvas" width="80" height="20" />
      </div>

      <!-- Indicators -->
      <div v-if="slot.isAssigned" class="pad-indicators">
        <span v-if="slot.reversed" class="indicator reverse-indicator" title="Reversed">⟵</span>
        <span v-if="slot.volume !== 1.0" class="indicator volume-indicator" title="Custom volume">
          {{ slot.volume < 0.5 ? '🔈' : '🔉' }}
        </span>
      </div>
    </div>

    <!-- Active/playing animation -->
    <div v-if="isPlaying" class="pad-playing-ring" />

    <!-- Press ripple -->
    <div v-if="isPressed" class="pad-press-effect" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { SampleSlot } from '@/types'
import { useSampleStore } from '@/stores/useSampleStore'

// ── Props / Emits ─────────────────────────────────────────────────────────────

interface Props {
  slot: SampleSlot
  isSelected?: boolean
  isPlaying?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  isPlaying: false,
})

const emit = defineEmits<{
  (e: 'tap', slotId: number): void
  (e: 'longPress', slotId: number): void
}>()

// ── Constants & Store ─────────────────────────────────────────────────────────

const PAD_COLORS = [
  '#FF6B2B', '#FFD93D', '#00E5FF', '#00E676',
  '#FF5252', '#B388FF', '#FF80AB', '#69F0AE',
  '#40C4FF', '#FFAB40', '#E040FB', '#F50057',
  '#64FFDA', '#EEFF41', '#FF6D00', '#18FFFF',
]

const store = useSampleStore()
const miniCanvas = ref<HTMLCanvasElement | null>(null)

// ── State ─────────────────────────────────────────────────────────────────────

const isPressed = ref(false)
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let pointerMoved = false
let pointerStartPos = { x: 0, y: 0 }

// ── Computed ──────────────────────────────────────────────────────────────────

const padColor = computed(() => PAD_COLORS[(props.slot.id - 1) % PAD_COLORS.length])

const durationLabel = computed(() => {
  const dur = props.slot.endMarker - props.slot.startMarker
  if (dur <= 0) return ''
  return dur >= 1 ? `${dur.toFixed(1)}s` : `${(dur * 1000).toFixed(0)}ms`
})

const shortName = computed(() => {
  const name = props.slot.name
  return name.length > 6 ? name.slice(0, 6) + '…' : name
})

// ── Waveform Draw Logic ───────────────────────────────────────────────────────

function drawMiniWaveform() {
  const canvas = miniCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const currentSlot = props.slot
  if (!currentSlot.isAssigned || !currentSlot.sourceBufferId) return

  const pcm = store.sourceBuffers.get(currentSlot.sourceBufferId)
  if (!pcm) return

  const sr = 44100
  const startSample = Math.round(currentSlot.startMarker * sr)
  const endSample = Math.round(currentSlot.endMarker * sr)
  const length = endSample - startSample
  if (length <= 0) return

  const width = canvas.width
  const height = canvas.height
  const step = Math.max(1, Math.floor(length / width))

  ctx.strokeStyle = padColor.value
  ctx.lineWidth = 1.5
  ctx.beginPath()

  for (let i = 0; i < width; i++) {
    const startIdx = startSample + i * step
    if (startIdx >= pcm.length) break

    let max = 0
    for (let j = 0; j < step; j++) {
      const idx = startIdx + j
      if (idx >= pcm.length) break
      const val = Math.abs(pcm[idx])
      if (val > max) max = val
    }

    const valHeight = max * currentSlot.volume * height
    ctx.moveTo(i, (height - valHeight) / 2)
    ctx.lineTo(i, (height + valHeight) / 2)
  }
  ctx.stroke()
}

watch(
  () => [
    props.slot.isAssigned,
    props.slot.startMarker,
    props.slot.endMarker,
    props.slot.sourceBufferId,
    props.slot.volume,
    props.slot.reversed,
    store.sourceBuffers.size
  ],
  () => {
    setTimeout(drawMiniWaveform, 0)
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  drawMiniWaveform()
})

// ── Interactions ──────────────────────────────────────────────────────────────

function onPointerDown(e: PointerEvent) {
  isPressed.value = true
  pointerMoved = false
  pointerStartPos = { x: e.clientX, y: e.clientY }

  longPressTimer = setTimeout(() => {
    if (!pointerMoved) {
      emit('longPress', props.slot.id)
      isPressed.value = false
    }
  }, 500)
}

function onPointerUp() {
  cancelLongPress()
  if (!pointerMoved) {
    emit('tap', props.slot.id)
  }
}

function cancelLongPress() {
  isPressed.value = false
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function checkPointerMove(e: PointerEvent) {
  const dx = Math.abs(e.clientX - pointerStartPos.x)
  const dy = Math.abs(e.clientY - pointerStartPos.y)
  if (dx > 5 || dy > 5) pointerMoved = true
}
</script>

<style scoped>
.pad-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  background: #141420;
  cursor: pointer;
  overflow: hidden;
  touch-action: manipulation;
  user-select: none;
  transition: border-color 0.15s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}

.pad-cell:active {
  transform: scale(0.93);
}

/* Assigned state */
.pad-cell.is-assigned {
  border-color: color-mix(in srgb, var(--pad-color) 60%, transparent);
  background: color-mix(in srgb, var(--pad-color) 8%, #141420);
}

/* Selected state */
.pad-cell.is-selected {
  border-color: var(--pad-color);
  border-width: 2px;
  background: color-mix(in srgb, var(--pad-color) 15%, #141420);
  box-shadow: 0 0 12px color-mix(in srgb, var(--pad-color) 35%, transparent);
}

/* Playing state */
.pad-cell.is-playing {
  animation: pad-pulse 0.3s ease-out;
}

.pad-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center bottom,
    color-mix(in srgb, var(--pad-color) 20%, transparent) 0%,
    transparent 70%
  );
  pointer-events: none;
}

.pad-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 6px;
  gap: 2px;
}

.pad-number {
  font-size: 10px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1;
}

.is-assigned .pad-number {
  color: var(--pad-color);
}

.pad-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.pad-name {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.2;
  letter-spacing: 0.02em;
}

.pad-duration {
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1;
}

.pad-indicators {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  font-size: 8px;
}

.mini-waveform-canvas {
  width: 100%;
  height: 20px;
  opacity: 0.65;
  pointer-events: none;
  margin-top: 4px;
}

.indicator {
  font-size: 8px;
  opacity: 0.7;
}

.pad-playing-ring {
  position: absolute;
  inset: -2px;
  border-radius: 12px;
  border: 2px solid var(--pad-color);
  animation: ring-expand 0.4s ease-out forwards;
  pointer-events: none;
}

.pad-press-effect {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: inherit;
  pointer-events: none;
  animation: press-fade 0.3s ease-out forwards;
}

@keyframes pad-pulse {
  0% { transform: scale(0.92); }
  50% { transform: scale(1.04); }
  100% { transform: scale(1); }
}

@keyframes ring-expand {
  from { opacity: 0.9; inset: -2px; }
  to { opacity: 0; inset: -10px; }
}

@keyframes press-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
