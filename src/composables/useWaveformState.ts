import { ref, computed, readonly } from 'vue'

// ─── Waveform View State ─────────────────────────────────────────────────────
// Singleton: condiviso tra WaveformOverview e WaveformDetail

/** Inizio della regione visibile nel Detail (secondi) */
const viewStart = ref(0)

/** Fine della regione visibile nel Detail (secondi) */
const viewEnd = ref(0)

/** Durata totale del file sorgente corrente (secondi) */
const sourceDuration = ref(0)

/**
 * Peak data pre-calcolata per il rendering waveform.
 * Formato: coppie [min, max] per ogni "colonna" di pixel.
 * Lunghezza = 2 × N dove N = numero di colonne desiderato.
 */
const peaksData = ref<Float32Array | null>(null)

/** Posizione del cursore di riproduzione (secondi, aggiornata in rAF) */
const playheadPosition = ref(0)

/** true se c'è un file sorgente caricato */
const hasSource = computed(() => sourceDuration.value > 0)

/** Durata della regione visibile nel Detail (secondi) */
const viewDuration = computed(() => Math.max(0.01, viewEnd.value - viewStart.value))

/** Percentuale della finestra rispetto al file totale (0.0 – 1.0) */
const windowRatio = computed(() =>
  sourceDuration.value > 0 ? viewDuration.value / sourceDuration.value : 1
)

// ─── Composable ───────────────────────────────────────────────────────────────

export function useWaveformState() {

  /**
   * Inizializza il viewport al caricamento di un nuovo file.
   * Mostra i primi `initialViewSeconds` secondi nel detail.
   */
  function initView(duration: number, initialViewSeconds = 10) {
    sourceDuration.value = duration
    viewStart.value = 0
    viewEnd.value = Math.min(duration, initialViewSeconds)
    playheadPosition.value = 0
  }

  /**
   * Imposta il range visibile del detail.
   * Clamp automatico ai limiti del file.
   */
  function setView(start: number, end: number) {
    const dur = sourceDuration.value
    if (dur === 0) return
    const minDuration = 0.1 // zoom massimo: 100ms visibili
    let s = Math.max(0, start)
    let e = Math.min(dur, end)
    if (e - s < minDuration) e = Math.min(dur, s + minDuration)
    viewStart.value = s
    viewEnd.value = e
  }

  /**
   * Pan: sposta il viewport di `deltaSeconds` secondi.
   * Mantiene la stessa durata visibile.
   */
  function panView(deltaSeconds: number) {
    const dur = sourceDuration.value
    const width = viewDuration.value
    let s = viewStart.value + deltaSeconds
    let e = s + width
    if (s < 0) { s = 0; e = width }
    if (e > dur) { e = dur; s = dur - width }
    viewStart.value = s
    viewEnd.value = e
  }

  /**
   * Zoom centrato su un punto (in secondi).
   * `factor` > 1 = zoom out, < 1 = zoom in.
   */
  function zoomView(factor: number, centerSeconds: number) {
    const dur = sourceDuration.value
    const newWidth = Math.min(dur, viewDuration.value * factor)
    const s = Math.max(0, centerSeconds - newWidth * ((centerSeconds - viewStart.value) / viewDuration.value))
    const e = Math.min(dur, s + newWidth)
    viewStart.value = s
    viewEnd.value = e
  }

  /**
   * Converte un tempo in secondi in posizione pixel nel Detail.
   * Restituisce null se fuori dalla regione visibile.
   */
  function timeToPixel(timeSeconds: number, canvasWidth: number): number | null {
    const t = (timeSeconds - viewStart.value) / viewDuration.value
    if (t < 0 || t > 1) return null
    return t * canvasWidth
  }

  /**
   * Converte una posizione pixel nel Detail in secondi.
   */
  function pixelToTime(px: number, canvasWidth: number): number {
    return viewStart.value + (px / canvasWidth) * viewDuration.value
  }

  /**
   * Centra il viewport su un punto (in secondi) mantenendo la durata.
   * Usato quando si clicca sull'overview.
   */
  function centerViewOn(centerSeconds: number) {
    const half = viewDuration.value / 2
    setView(centerSeconds - half, centerSeconds + half)
  }

  /** Aggiorna la posizione del cursore di riproduzione */
  function setPlayhead(seconds: number) {
    playheadPosition.value = Math.max(0, Math.min(sourceDuration.value, seconds))
  }

  /** Salva i peak data calcolati */
  function setPeaks(peaks: Float32Array) {
    peaksData.value = peaks
  }

  /** Reset completo */
  function resetWaveform() {
    sourceDuration.value = 0
    viewStart.value = 0
    viewEnd.value = 0
    peaksData.value = null
    playheadPosition.value = 0
  }

  return {
    // State (readonly per i consumatori)
    viewStart: readonly(viewStart),
    viewEnd: readonly(viewEnd),
    sourceDuration: readonly(sourceDuration),
    peaksData: readonly(peaksData),
    playheadPosition: readonly(playheadPosition),

    // Computed
    hasSource,
    viewDuration,
    windowRatio,

    // Methods
    initView,
    setView,
    panView,
    zoomView,
    centerViewOn,
    timeToPixel,
    pixelToTime,
    setPlayhead,
    setPeaks,
    resetWaveform,
  }
}
