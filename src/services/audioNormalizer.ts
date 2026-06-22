import type { NormalizationResult } from '@/types'
import { findPeak } from '@/utils/audioHelpers'

/**
 * Normalizzazione al picco (Peak Normalization) dell'intero flusso.
 * Amplifica l'audio affinché il picco massimo raggiunga il targetPeak.
 *
 * @param data        Float32Array del flusso audio (modificato in-place)
 * @param targetPeak  Valore float target (default: 0.97 ≈ -0.3 dBFS)
 */
export function normalizeGlobal(
  data: Float32Array,
  targetPeak: number = 0.97,
): NormalizationResult {
  const peakBefore = findPeak(data)

  if (peakBefore === 0) {
    return { data, peakBefore: 0, peakAfter: 0, gain: 1.0 }
  }

  const gain = targetPeak / peakBefore

  for (let i = 0; i < data.length; i++) {
    data[i] *= gain
  }

  const peakAfter = findPeak(data)

  return { data, peakBefore, peakAfter, gain }
}

/**
 * Normalizzazione per-pad: ogni segmento viene normalizzato individualmente
 * prima della concatenazione. Utile per kit eterogenei (kick forte + hihat debole).
 *
 * @param segments    Array di Float32Array, uno per pad
 * @param targetPeak  Valore float target (default: 0.97)
 */
export function normalizePerPad(
  segments: Float32Array[],
  targetPeak: number = 0.97,
): NormalizationResult[] {
  return segments.map((seg) => {
    const peakBefore = findPeak(seg)

    if (peakBefore === 0) {
      return { data: seg, peakBefore: 0, peakAfter: 0, gain: 1.0 }
    }

    const gain = targetPeak / peakBefore

    for (let i = 0; i < seg.length; i++) {
      seg[i] *= gain
    }

    return { data: seg, peakBefore, peakAfter: findPeak(seg), gain }
  })
}

/**
 * Normalizza un Float32Array in base alla modalità specificata.
 * Wrapper unificato usato dall'AudioEngine.
 *
 * @param data        Flusso audio concatenato
 * @param mode        'global' | 'per-pad' (in modalità per-pad usa normalizeGlobal sul flusso finale)
 * @param targetPeak  Target peak float
 */
export function normalize(
  data: Float32Array,
  mode: 'global' | 'per-pad',
  targetPeak: number = 0.97,
): NormalizationResult {
  // In entrambi i casi, dopo la concatenazione normalizziamo il flusso finale.
  // La normalizzazione per-pad avviene in pcmConcatenator prima dell'assemblea;
  // qui eseguiamo sempre un passo finale di global normalization per sicurezza.
  return normalizeGlobal(data, targetPeak)
}
