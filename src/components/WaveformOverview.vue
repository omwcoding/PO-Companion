<template>
  <div class="waveform-overview" ref="containerRef">
    <canvas
      ref="canvasRef"
      class="overview-canvas"
      @mousedown="onMouseDown"
      @touchstart.prevent="onTouchStart"
    />
    <!-- Time labels -->
    <div class="time-labels">
      <span class="time-label start">{{ formatTime(0) }}</span>
      <span class="time-label mid">{{ formatTime(sourceDuration / 2) }}</span>
      <span class="time-label end">{{ formatTime(sourceDuration) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useWaveformState } from '@/composables/useWaveformState'
import { useSampleStore } from '@/stores/useSampleStore'

// ── State ─────────────────────────────────────────────────────────────────────
const waveform = useWaveformState()
const store = useSampleStore()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const { viewStart, viewEnd, sourceDuration, peaksData } = waveform

// ── Colors ────────────────────────────────────────────────────────────────────
const PAD_COLORS = [
  '#FF6B2B', '#FFD93D', '#00E5FF', '#00E676',
  '#FF5252', '#B388FF', '#FF80AB', '#69F0AE',
  '#40C4FF', '#FFAB40', '#E040FB', '#F50057',
  '#64FFDA', '#EEFF41', '#FF6D00', '#18FFFF',
]

// ── Dragging window state ─────────────────────────────────────────────────────
let isDraggingWindow = false
let dragStartPixelX = 0
let dragStartViewStart = 0

// ── Canvas rendering ──────────────────────────────────────────────────────────

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1


  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Background
  ctx.fillStyle = '#0D0D14'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const duration = sourceDuration.value
  if (duration === 0) {
    // Empty state
    ctx.fillStyle = '#2A2A3A'
    ctx.font = `${11 * dpr}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('No file loaded', canvas.width / 2, canvas.height / 2)
    return
  }

  const peaks = peaksData.value

  // ── Draw waveform ─────────────────────────────────────────────────────────
  if (peaks && peaks.length > 0) {
    const numBins = peaks.length / 2
    const binWidth = (canvas.width / numBins)
    const midY = canvas.height / 2

    ctx.beginPath()
    for (let i = 0; i < numBins; i++) {
      const minVal = peaks[i * 2]
      const maxVal = peaks[i * 2 + 1]
      const x = i * binWidth
      const yTop = midY - maxVal * midY * 0.9
      const yBot = midY - minVal * midY * 0.9

      // Gradiente dal centro verso l'alto e il basso
      const grad = ctx.createLinearGradient(0, yTop, 0, yBot)
      grad.addColorStop(0, 'rgba(0, 229, 255, 0.7)')
      grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.9)')
      grad.addColorStop(1, 'rgba(0, 229, 255, 0.7)')
      ctx.fillStyle = grad
      ctx.fillRect(x, yTop, Math.max(1, binWidth - 0.5), Math.max(1, yBot - yTop))
    }
  } else {
    // Placeholder waveform se non ci sono peaks
    ctx.fillStyle = 'rgba(0, 229, 255, 0.3)'
    ctx.fillRect(0, canvas.height * 0.2, canvas.width, canvas.height * 0.6)
  }

  // ── Draw assigned pad regions ─────────────────────────────────────────────
  const assigned = store.assignedSlots.filter(s => s.sourceBufferId === store.activeSourceId)
  for (const slot of assigned) {
    if (!slot.isAssigned) continue
    const x1 = (slot.startMarker / duration) * canvas.width
    const x2 = (slot.endMarker / duration) * canvas.width
    const color = PAD_COLORS[(slot.id - 1) % PAD_COLORS.length]
    ctx.fillStyle = color + '66' // ~40% opacity
    ctx.fillRect(x1, 0, x2 - x1, canvas.height)
    // Top border
    ctx.fillStyle = color
    ctx.fillRect(x1, 0, x2 - x1, 2 * dpr)
  }

  // ── Draw view window ──────────────────────────────────────────────────────
  if (duration > 0) {
    const wx1 = (viewStart.value / duration) * canvas.width
    const wx2 = (viewEnd.value / duration) * canvas.width
    const ww = Math.max(4, wx2 - wx1)

    // Dimming fuori dalla finestra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.fillRect(0, 0, wx1, canvas.height)
    ctx.fillRect(wx2, 0, canvas.width - wx2, canvas.height)

    // Finestra
    ctx.strokeStyle = 'rgba(255, 107, 43, 0.9)'
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeRect(wx1 + 0.5, 0.5, ww - 1, canvas.height - 1)

    // Handle laterali
    ctx.fillStyle = '#FF6B2B'
    const handleW = 3 * dpr
    const handleH = canvas.height * 0.6
    const handleY = (canvas.height - handleH) / 2
    ctx.fillRect(wx1, handleY, handleW, handleH)
    ctx.fillRect(wx2 - handleW, handleY, handleW, handleH)
  }
}

// ── Resize ────────────────────────────────────────────────────────────────────

function resizeCanvas() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return
  const dpr = window.devicePixelRatio || 1
  const w = container.clientWidth
  const h = container.clientHeight || 48
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.scale(dpr, dpr)
  draw()
}

const ro = new ResizeObserver(() => resizeCanvas())

// ── Interaction ───────────────────────────────────────────────────────────────

function pixelToTime(px: number): number {
  const canvas = canvasRef.value
  if (!canvas || sourceDuration.value === 0) return 0
  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  return (px / w) * sourceDuration.value
}

function startDrag(clientX: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  isDraggingWindow = true
  dragStartPixelX = x
  dragStartViewStart = viewStart.value
}

function moveDrag(clientX: number) {
  if (!isDraggingWindow) return
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const deltaTime = pixelToTime(x - dragStartPixelX)
  const newStart = dragStartViewStart + deltaTime
  const windowWidth = viewEnd.value - viewStart.value
  waveform.setView(newStart, newStart + windowWidth)
  draw()
}

function endDrag() {
  isDraggingWindow = false
}


function onMouseDown(e: MouseEvent) {
  startDrag(e.clientX)
  const onMove = (ev: MouseEvent) => moveDrag(ev.clientX)
  const onUp = () => {
    endDrag()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    startDrag(e.touches[0].clientX)
    const onMove = (ev: TouchEvent) => moveDrag(ev.touches[0].clientX)
    const onEnd = () => {
      endDrag()
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await nextTick()
  if (containerRef.value) ro.observe(containerRef.value)
  resizeCanvas()
})

onUnmounted(() => ro.disconnect())

// Ridisegna quando cambia viewStart/viewEnd, i peaks o la sorgente attiva
watch([viewStart, viewEnd, peaksData, () => store.assignedSlots, () => store.activeSourceId], () => {
  draw()
}, { deep: true })
</script>

<style scoped>
</style>
