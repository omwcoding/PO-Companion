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
</style>
