<template>
  <div class="waveform-detail" ref="containerRef">
    <canvas ref="canvasRef" class="detail-canvas" />

    <!-- Overlay: bottone zoom-to-fit -->
    <button class="zoom-fit-btn" @click="zoomToFit" title="Zoom to fit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 4h4V2H2v6h2zm16 0h-4V2h6v6h-2zM4 20h4v2H2v-6h2zm16 0h-4v2h6v-6h-2z"/>
      </svg>
    </button>

    <!-- Overlay: label tempo corrente -->
    <div class="time-display">
      <span class="view-range">
        {{ formatTime(viewStart) }} – {{ formatTime(viewEnd) }}
      </span>
    </div>

    <!-- Transient markers (HTML overlay per performance) -->
    <div
      v-for="t in visibleTransients"
      :key="t.timeSeconds"
      class="transient-marker"
      :style="{ left: `${timeToPixelPercent(t.timeSeconds)}%` }"
      :title="`Transient ${formatTime(t.timeSeconds)} (strength: ${(t.strength * 100).toFixed(0)}%)`"
      @click="snapSelectedMarkerToTransient(t.timeSeconds)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useWaveformState } from '@/composables/useWaveformState'
import { useTouchGestures } from '@/composables/useTouchGestures'
import { useSampleStore } from '@/stores/useSampleStore'
import { computeDetailPeaks } from '@/utils/peakAnalyzer'
import type { TransientPoint } from '@/types'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  transients?: TransientPoint[]
  monoChannelData?: Float32Array | null
}

const props = withDefaults(defineProps<Props>(), {
  transients: () => [],
  monoChannelData: null,
})

const emit = defineEmits<{
  (e: 'markerUpdate', slotId: number, startMarker: number, endMarker: number): void
  (e: 'slotAssign', slotId: number, startMarker: number, endMarker: number): void
  (e: 'longPress', x: number, y: number): void
}>()

// ── State ─────────────────────────────────────────────────────────────────────
const waveform = useWaveformState()
const store = useSampleStore()
const { viewStart, viewEnd, sourceDuration, playheadPosition } = waveform

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── Marker drag state ─────────────────────────────────────────────────────────
type DragTarget = { slotId: number; marker: 'start' | 'end' } | null
let activeDrag: DragTarget = null

// ── Constants ─────────────────────────────────────────────────────────────────
const MARKER_HIT_AREA_PX = 24 // Half-width del hit area (total 48px)
const MARKER_MIN_DURATION = 0.05 // Durata minima segmento: 50ms

const PAD_COLORS = [
  '#FF6B2B', '#FFD93D', '#00E5FF', '#00E676',
  '#FF5252', '#B388FF', '#FF80AB', '#69F0AE',
  '#40C4FF', '#FFAB40', '#E040FB', '#F50057',
  '#64FFDA', '#EEFF41', '#FF6D00', '#18FFFF',
]

// ── Computed ──────────────────────────────────────────────────────────────────

const visibleTransients = computed(() =>
  props.transients.filter(
    t => t.timeSeconds >= viewStart.value && t.timeSeconds <= viewEnd.value
  )
)

function timeToPixelPercent(seconds: number): number {
  const dur = viewEnd.value - viewStart.value
  if (dur === 0) return 0
  return ((seconds - viewStart.value) / dur) * 100
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function getCanvasSize(): { w: number; h: number; dpr: number } {
  const canvas = canvasRef.value
  if (!canvas) return { w: 0, h: 0, dpr: 1 }
  const dpr = window.devicePixelRatio || 1
  return { w: canvas.width / dpr, h: canvas.height / dpr, dpr }
}

function timeToX(seconds: number, canvasW: number): number {
  const dur = viewEnd.value - viewStart.value
  if (dur === 0) return 0
  return ((seconds - viewStart.value) / dur) * canvasW
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { w, h, dpr } = getCanvasSize()
  if (w === 0 || h === 0) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Background
  ctx.fillStyle = '#0A0A12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, canvas.height / 2)
  ctx.lineTo(canvas.width, canvas.height / 2)
  ctx.stroke()

  const duration = sourceDuration.value
  if (duration === 0) {
    // Empty state hint
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.font = `${13 * dpr}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('Load an audio file to start chopping', canvas.width / 2, canvas.height / 2)
    return
  }

  // ── Waveform ──────────────────────────────────────────────────────────────
  if (props.monoChannelData && props.monoChannelData.length > 0) {
    const numBins = Math.ceil(w * dpr)
    const peaks = computeDetailPeaks(
      props.monoChannelData,
      44100,
      viewStart.value,
      viewEnd.value,
      numBins
    )
    const binWidth = canvas.width / numBins
    const midY = canvas.height / 2

    for (let i = 0; i < numBins; i++) {
      const minVal = peaks[i * 2]
      const maxVal = peaks[i * 2 + 1]
      const x = i * binWidth
      const yTop = midY - maxVal * midY * 0.92
      const yBot = midY - minVal * midY * 0.92

      ctx.fillStyle = 'rgba(0, 229, 255, 0.75)'
      ctx.fillRect(x, yTop, Math.max(1, binWidth - 0.5), Math.max(1, yBot - yTop))
    }
  }

  // ── Pad regions ───────────────────────────────────────────────────────────
  for (const slot of store.assignedSlots) {
    if (!slot.isAssigned) continue
    const x1 = timeToX(slot.startMarker, canvas.width)
    const x2 = timeToX(slot.endMarker, canvas.width)
    if (x2 < 0 || x1 > canvas.width) continue

    const color = PAD_COLORS[(slot.id - 1) % PAD_COLORS.length]
    const isSelected = slot.id === store.selectedSlotId

    // Region fill
    ctx.fillStyle = color + (isSelected ? '33' : '1A')
    ctx.fillRect(x1, 0, x2 - x1, canvas.height)

    // Region border top (thick for selected)
    ctx.fillStyle = color + (isSelected ? 'FF' : 'AA')
    ctx.fillRect(x1, 0, x2 - x1, isSelected ? 2 * dpr : dpr)

    // Pad label
    if (x2 - x1 > 20 * dpr) {
      ctx.fillStyle = color
      ctx.font = `bold ${10 * dpr}px Inter, sans-serif`
      ctx.textAlign = 'left'
      ctx.fillText(`P${slot.id}`, x1 + 3 * dpr, 12 * dpr)
    }
  }

  // ── Markers for selected slot ─────────────────────────────────────────────
  const sel = store.selectedSlot
  if (sel && sel.isAssigned) {
    const color = PAD_COLORS[(sel.id - 1) % PAD_COLORS.length]

    // Start marker
    const sx = timeToX(sel.startMarker, canvas.width)
    drawMarker(ctx, sx, canvas.height, color, 'start', dpr)

    // End marker
    const ex = timeToX(sel.endMarker, canvas.width)
    drawMarker(ctx, ex, canvas.height, color, 'end', dpr)

    // Duration label
    const dur = sel.endMarker - sel.startMarker
    const midX = (sx + ex) / 2
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = `${10 * dpr}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${dur.toFixed(2)}s`, midX, canvas.height - 4 * dpr)
  }

  // ── Playhead ──────────────────────────────────────────────────────────────
  const ph = playheadPosition.value
  if (ph >= viewStart.value && ph <= viewEnd.value) {
    const phX = timeToX(ph, canvas.width)
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 1.5 * dpr
    ctx.setLineDash([4 * dpr, 3 * dpr])
    ctx.beginPath()
    ctx.moveTo(phX, 0)
    ctx.lineTo(phX, canvas.height)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  canvasH: number,
  color: string,
  type: 'start' | 'end',
  dpr: number
) {
  // Line
  ctx.strokeStyle = color
  ctx.lineWidth = 2 * dpr
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, canvasH)
  ctx.stroke()

  // Top triangle handle
  const size = 7 * dpr
  ctx.fillStyle = color
  ctx.beginPath()
  if (type === 'start') {
    ctx.moveTo(x, 0)
    ctx.lineTo(x + size, 0)
    ctx.lineTo(x, size)
  } else {
    ctx.moveTo(x, 0)
    ctx.lineTo(x - size, 0)
    ctx.lineTo(x, size)
  }
  ctx.closePath()
  ctx.fill()

  // Bottom triangle handle
  ctx.beginPath()
  if (type === 'start') {
    ctx.moveTo(x, canvasH)
    ctx.lineTo(x + size, canvasH)
    ctx.lineTo(x, canvasH - size)
  } else {
    ctx.moveTo(x, canvasH)
    ctx.lineTo(x - size, canvasH)
    ctx.lineTo(x, canvasH - size)
  }
  ctx.closePath()
  ctx.fill()
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function hitTestMarkers(pixelX: number): DragTarget {
  const { w } = getCanvasSize()
  if (w === 0) return null
  const dpr = window.devicePixelRatio || 1
  const hitArea = MARKER_HIT_AREA_PX * dpr

  for (const slot of store.assignedSlots) {
    if (!slot.isAssigned) continue
    const sx = timeToX(slot.startMarker, canvasRef.value!.width)
    const ex = timeToX(slot.endMarker, canvasRef.value!.width)
    if (Math.abs(pixelX - ex) < hitArea) return { slotId: slot.id, marker: 'end' }
    if (Math.abs(pixelX - sx) < hitArea) return { slotId: slot.id, marker: 'start' }
  }
  return null
}

// ── Gesture handlers ──────────────────────────────────────────────────────────

function onDragStart(x: number, _y: number): boolean {
  const canvas = canvasRef.value
  if (!canvas) return false
  const dpr = window.devicePixelRatio || 1
  const px = x * dpr
  const hit = hitTestMarkers(px)
  if (hit) {
    activeDrag = hit
    if (hit.slotId !== store.selectedSlotId) store.selectSlot(hit.slotId)
    return true
  }
  return false
}

function onDrag(deltaX: number, _deltaY: number, currentX: number, _currentY: number) {
  if (activeDrag) {
    // Drag marker
    const canvas = canvasRef.value
    if (!canvas) return
    const { w } = getCanvasSize()
    const time = waveform.pixelToTime(currentX, w)
    const slot = store.slots.find(s => s.id === activeDrag!.slotId)
    if (!slot) return

    if (activeDrag.marker === 'start') {
      const newStart = Math.max(0, Math.min(slot.endMarker - MARKER_MIN_DURATION, time))
      store.updateMarkers(slot.id, newStart, slot.endMarker)
    } else {
      const newEnd = Math.min(sourceDuration.value, Math.max(slot.startMarker + MARKER_MIN_DURATION, time))
      store.updateMarkers(slot.id, slot.startMarker, newEnd)
    }
    draw()
  } else {
    // Pan
    const { w } = getCanvasSize()
    const deltaSec = -(deltaX / w) * (viewEnd.value - viewStart.value)
    waveform.panView(deltaSec)
    draw()
  }
}

function onDragEnd(_x: number, _y: number) {
  if (activeDrag) {
    const slot = store.slots.find(s => s.id === activeDrag!.slotId)
    if (slot) {
      emit('markerUpdate', slot.id, slot.startMarker, slot.endMarker)
    }
  }
  activeDrag = null
}

function onTap(x: number, _y: number) {
  const { w } = getCanvasSize()
  const time = waveform.pixelToTime(x, w)
  waveform.setPlayhead(time)
  draw()
}

function onPinch(factor: number, centerX: number) {
  const { w } = getCanvasSize()
  const centerSec = waveform.pixelToTime(centerX, w)
  waveform.zoomView(factor, centerSec)
  draw()
}

function onLongPress(x: number, y: number) {
  emit('longPress', x, y)
}

// ── Zoom to fit ───────────────────────────────────────────────────────────────

function zoomToFit() {
  waveform.setView(0, sourceDuration.value)
  draw()
}

// ── Snap marker to transient ──────────────────────────────────────────────────

function snapSelectedMarkerToTransient(timeSeconds: number) {
  const sel = store.selectedSlot
  if (!sel || !sel.isAssigned) return
  // Snap la fine se il click è dopo la metà del segmento, altrimenti l'inizio
  const mid = (sel.startMarker + sel.endMarker) / 2
  if (timeSeconds > mid) {
    store.updateMarkers(sel.id, sel.startMarker, timeSeconds)
  } else {
    store.updateMarkers(sel.id, timeSeconds, sel.endMarker)
  }
  draw()
}

// ── Resize ────────────────────────────────────────────────────────────────────

function resizeCanvas() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return
  const dpr = window.devicePixelRatio || 1
  const w = container.clientWidth
  const h = container.clientHeight || 180
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
  }
  draw()
}

const ro = new ResizeObserver(() => resizeCanvas())

// ── Touch gestures attach ─────────────────────────────────────────────────────

const { attach } = useTouchGestures(
  () => canvasRef.value,
  { onDragStart, onDrag, onDragEnd, onTap, onPinch, onLongPress }
)

// ── Formatting ────────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await nextTick()
  if (containerRef.value) ro.observe(containerRef.value)
  resizeCanvas()
  attach()
})

onUnmounted(() => ro.disconnect())

watch(
  [viewStart, viewEnd, playheadPosition, () => store.slots, () => store.selectedSlotId],
  () => draw(),
  { deep: true }
)

// Ridisegna quando cambiano i dati audio
watch(() => props.monoChannelData, () => {
  resizeCanvas()
})
</script>

<style scoped>
.waveform-detail {
  position: relative;
  width: 100%;
  height: 100%;
  background: #0A0A12;
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.detail-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.zoom-fit-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  padding: 0;
}

.zoom-fit-btn:hover {
  background: rgba(255,255,255,0.14);
  color: rgba(255,255,255,0.9);
}

.time-display {
  position: absolute;
  bottom: 6px;
  left: 8px;
  pointer-events: none;
}

.view-range {
  font-size: 10px;
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  color: rgba(255,255,255,0.3);
}

.transient-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 171, 0, 0.6);
  cursor: pointer;
  transform: translateX(-50%);
  transition: background 0.1s;
}

.transient-marker::before {
  content: '▼';
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  color: #FFAB00;
  line-height: 1;
}

.transient-marker:hover {
  background: rgba(255, 171, 0, 1);
  width: 2px;
}
</style>
