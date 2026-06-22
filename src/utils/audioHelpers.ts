import { PO33_SAMPLE_RATE } from '@/types'

// ─── Channel Mixing ────────────────────────────────────────────────────────

/**
 * Mixa un AudioBuffer stereo (o multi-canale) a mono.
 * Tutti i canali vengono sommati e mediati campione per campione.
 */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length
  const numChannels = buffer.numberOfChannels
  const mono = new Float32Array(length)

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i]
    }
  }

  if (numChannels > 1) {
    const inv = 1 / numChannels
    for (let i = 0; i < length; i++) {
      mono[i] *= inv
    }
  }

  return mono
}

// ─── Resampling ────────────────────────────────────────────────────────────

/**
 * Ricampiona un AudioBuffer al sample rate target usando OfflineAudioContext.
 * CRITICO per iOS Safari che forza 48kHz nell'AudioContext.
 */
export async function resampleBuffer(
  buffer: AudioBuffer,
  targetSampleRate: number = PO33_SAMPLE_RATE,
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) return buffer

  const ratio = targetSampleRate / buffer.sampleRate
  const targetLength = Math.round(buffer.length * ratio)

  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    targetLength,
    targetSampleRate,
  )

  const source = offlineCtx.createBufferSource()
  source.buffer = buffer
  source.connect(offlineCtx.destination)
  source.start(0)

  return await offlineCtx.startRendering()
}

// ─── Zero-Crossing Detection ───────────────────────────────────────────────

/**
 * Trova il punto di zero-crossing più vicino alla posizione `pos`
 * entro una finestra di `windowSamples` campioni verso l'inizio.
 *
 * Ritorna la posizione del crossing trovato, oppure `pos` se non trovato.
 */
export function findNearestZeroCrossing(
  data: Float32Array,
  pos: number,
  windowSamples: number,
): number {
  const start = Math.max(1, pos - windowSamples)

  for (let i = pos; i >= start; i--) {
    // Zero-crossing: il segnale cambia segno tra il campione i-1 e i
    if (
      (data[i] >= 0 && data[i - 1] < 0) ||
      (data[i] < 0 && data[i - 1] >= 0)
    ) {
      return i
    }
  }

  return pos // Fallback: restituisce la posizione originale
}

// ─── Anti-Click Fades ─────────────────────────────────────────────────────

/**
 * Applica un micro-fade OUT lineare agli ultimi `fadeSamples` campioni
 * del segmento terminante a `endSample`.
 * Previene click/pop alla giunzione con il gap di silenzio.
 *
 * NOTA: Mai applicare fade-IN nel flusso di output verso il PO-33.
 * Il fade-in ammorbidisce il transiente e rompe l'auto-chop.
 */
export function applyMicroFadeOut(
  data: Float32Array,
  endSample: number,
  fadeSamples: number,
): void {
  const start = endSample - fadeSamples
  if (start < 0) return

  for (let i = 0; i < fadeSamples; i++) {
    const gain = 1.0 - i / fadeSamples // 1.0 → 0.0
    data[start + i] *= gain
  }
}

/**
 * Applica un micro-fade IN lineare ai primi `fadeSamples` campioni
 * del segmento a partire da `startSample`.
 *
 * ⚠️ USARE SOLO in contesto di PREVIEW (anteprima interna).
 * NON applicare nel flusso di output verso il PO-33.
 */
export function applyMicroFadeIn(
  data: Float32Array,
  startSample: number,
  fadeSamples: number,
): void {
  for (let i = 0; i < fadeSamples; i++) {
    if (startSample + i >= data.length) break
    const gain = i / fadeSamples // 0.0 → 1.0
    data[startSample + i] *= gain
  }
}

// ─── Peak Analysis ────────────────────────────────────────────────────────

/**
 * Trova il valore assoluto massimo (picco) in un Float32Array.
 */
export function findPeak(data: Float32Array): number {
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i])
    if (abs > peak) peak = abs
  }
  return peak
}

/**
 * Converte un valore lineare (0.0 – 1.0) in dBFS.
 */
export function linearToDBFS(value: number): number {
  if (value <= 0) return -Infinity
  return 20 * Math.log10(value)
}
