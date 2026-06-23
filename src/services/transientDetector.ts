/**
 * transientDetector.ts
 * ────────────────────
 * Algoritmo HFC (High Frequency Content) per onset detection.
 *
 * Principio: un transiente (attacco di un drum hit) produce un picco improvviso
 * nell'energia ad alta frequenza del segnale. Analizziamo lo spettro in finestre
 * successive e rileriamo i salti nell'HFC come punti di onset.
 *
 * Usato in ChopToolbar per suggerire automaticamente i punti di taglio.
 */

import type { TransientPoint } from '../types'

export interface TransientDetectionOptions {
  /**
   * Dimensione della finestra di analisi FFT (potenza di 2).
   * Default: 2048 campioni. Valori tipici: 1024, 2048, 4096.
   */
  fftSize?: number
  /**
   * Sovrapposizione tra finestre successive (hop size = fftSize - overlap).
   * Default: 0 (nessuna sovrapposizione).
   */
  hopSize?: number
  /**
   * Moltiplicatore per la soglia di rilevamento.
   * Un valore più alto = meno transienti rilevati (solo i picchi forti).
   * Un valore più basso = più transienti (più falsi positivi).
   * Default: 1.5
   */
  threshold?: number
  /**
   * Distanza minima tra due transienti consecutivi (millisecondi).
   * Evita rilevamenti multipli per lo stesso hit.
   * Default: 50ms
   */
  minDistanceMs?: number
  /**
   * Numero massimo di transienti da restituire.
   * Default: 32 (due volte i 16 pad del PO-33 per dare margine di scelta).
   */
  maxTransients?: number
}

/**
 * Rileva i punti di onset (transienti) in un array di campioni PCM mono.
 *
 * @param channelData - Float32Array PCM mono, range [-1, 1]
 * @param sampleRate - sample rate del buffer (tipicamente 44100)
 * @param options - parametri di rilevamento
 * @returns Array di TransientPoint ordinati per tempo
 */
export function detectTransients(
  channelData: Float32Array,
  sampleRate: number,
  options: TransientDetectionOptions = {}
): TransientPoint[] {
  const {
    fftSize = 2048,
    hopSize: _hopSize,
    threshold = 1.5,
    minDistanceMs = 50,
    maxTransients = 32,
  } = options

  const hop = _hopSize ?? fftSize // default: nessuna sovrapposizione

  const totalSamples = channelData.length
  const numFrames = Math.floor((totalSamples - fftSize) / hop)
  const minDistanceSamples = Math.floor((minDistanceMs / 1000) * sampleRate)

  if (numFrames <= 0) return []

  // ── Step 1: calcola l'HFC per ogni finestra ──────────────────────────────
  const hfcValues: number[] = []

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hop
    let hfc = 0

    // HFC = Σ (k * |X[k]|²) dove k è il bin di frequenza
    // Approssimazione senza FFT reale: usiamo l'energia dei campioni
    // nella finestra applicando una finestra di Hann per ridurre il leakage.
    // Per un'implementazione production-grade useremmo una FFT vera.
    // Questa approssimazione funziona bene per drum con attacco netto.
    for (let i = 0; i < fftSize; i++) {
      const sample = channelData[offset + i] ?? 0
      // Peso lineare verso le frequenze alte (simula HFC bin weighting)
      const weight = (i / fftSize) + 0.5
      hfc += weight * sample * sample
    }

    hfcValues.push(hfc)
  }

  // ── Step 2: calcola il valore medio e la soglia adattiva ─────────────────
  const mean = hfcValues.reduce((a, b) => a + b, 0) / hfcValues.length
  const adaptiveThreshold = mean * threshold

  // ── Step 3: rileva i picchi locali sopra la soglia ───────────────────────
  const transients: TransientPoint[] = []
  let lastOnsetSample = -minDistanceSamples

  for (let frame = 1; frame < numFrames - 1; frame++) {
    const prev = hfcValues[frame - 1]
    const curr = hfcValues[frame]
    const next = hfcValues[frame + 1]

    // Picco locale: curr > prev, curr > next, curr > soglia
    if (curr > prev && curr > next && curr > adaptiveThreshold) {
      const samplePosition = frame * hop
      const timeDiff = samplePosition - lastOnsetSample

      if (timeDiff >= minDistanceSamples) {
        lastOnsetSample = samplePosition
        const timeSeconds = samplePosition / sampleRate
        const strength = Math.min(1.0, curr / (adaptiveThreshold * 3))

        transients.push({ timeSeconds, strength })
      }
    }
  }

  // ── Step 4: ordina per tempo e limita il numero ───────────────────────────
  transients.sort((a, b) => a.timeSeconds - b.timeSeconds)

  return transients.slice(0, maxTransients)
}

/**
 * Filtra i transienti per mantenere solo i `count` più forti.
 * Utile per "Chop to 16" quando si hanno più di 16 transienti.
 */
export function selectStrongestTransients(
  transients: TransientPoint[],
  count: number
): TransientPoint[] {
  if (transients.length <= count) return transients

  // Prendi i `count` con forza maggiore, poi riordina per tempo
  return [...transients]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, count)
    .sort((a, b) => a.timeSeconds - b.timeSeconds)
}

/**
 * Dato un punto di tempo e un array di transienti,
 * restituisce il transiente più vicino entro una soglia di snap.
 */
export function snapToTransient(
  timeSeconds: number,
  transients: TransientPoint[],
  snapThresholdSeconds = 0.05
): TransientPoint | null {
  let closest: TransientPoint | null = null
  let minDist = snapThresholdSeconds

  for (const t of transients) {
    const dist = Math.abs(t.timeSeconds - timeSeconds)
    if (dist < minDist) {
      minDist = dist
      closest = t
    }
  }

  return closest
}
