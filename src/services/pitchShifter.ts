/**
 * Modifica la tonalità e la velocità del buffer PCM (resampling).
 * - semitones > 0: velocizza il campione (durata inferiore, pitch più alto)
 * - semitones < 0: rallenta il campione (durata superiore, pitch più basso)
 *
 * Utilizza l'interpolazione lineare per una buona qualità audio a bassa latenza.
 *
 * @param data       Float32Array del canale audio mono
 * @param semitones  Variazione in semitoni (da -12 a +12)
 * @returns          Nuovo Float32Array riscalato in pitch/tempo
 */
export function repitchPCM(data: Float32Array, semitones: number): Float32Array {
  if (semitones === 0 || data.length === 0) {
    return data
  }

  // pitchFactor = 2^(semitones / 12)
  // st = +12 -> pitchFactor = 2.0 (velocità raddoppiata, durata dimezzata)
  // st = -12 -> pitchFactor = 0.5 (velocità dimezzata, durata raddoppiata)
  const pitchFactor = Math.pow(2, semitones / 12)
  const newLength = Math.round(data.length / pitchFactor)

  if (newLength <= 0) {
    return new Float32Array(0)
  }

  const out = new Float32Array(newLength)

  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * pitchFactor
    const low = Math.floor(srcIdx)
    const high = Math.min(data.length - 1, low + 1)
    const weight = srcIdx - low

    if (low >= data.length) {
      out[i] = 0
    } else {
      // Interpolazione lineare
      out[i] = data[low] * (1 - weight) + data[high] * weight
    }
  }

  return out
}
