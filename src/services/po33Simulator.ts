const MU = 255

function compressMuLaw(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample))
  const sign = Math.sign(s)
  const abs = Math.abs(s)
  return sign * (Math.log(1 + MU * abs) / Math.log(1 + MU))
}

function decompressMuLaw(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample))
  const sign = Math.sign(s)
  const abs = Math.abs(s)
  return sign * ((Math.pow(1 + MU, abs) - 1) / MU)
}

/**
 * Simula il comportamento lo-fi del PO-33:
 * - Ricampionamento Nearest-Neighbor a ~23.437 Hz per riprodurre l'aliasing metallico.
 * - Quantizzazione a 8-bit µ-law companding.
 *
 * @param data  Float32Array audio mono a 44100Hz
 * @returns     Float32Array simulato a 44100Hz
 */
export function simulatePO33LoFi(data: Float32Array): Float32Array {
  // Il sample rate interno del PO-33 è ~23437.5 Hz
  const ratio = 23437.5 / 44100
  const out = new Float32Array(data.length)

  for (let i = 0; i < data.length; i++) {
    // Calcola l'indice ricampionato (nearest-neighbor hold)
    const downsampledIdx = Math.round(i * ratio)
    const srcIdx = Math.max(0, Math.min(data.length - 1, Math.round(downsampledIdx / ratio)))

    const sample = data[srcIdx]

    // Compressione µ-law
    const compressed = compressMuLaw(sample)

    // Quantizzazione a 8-bit (256 livelli discreti tra -1.0 e 1.0)
    // 8-bit compreso il bit di segno: 127 livelli per polarità + lo zero
    const quantized = Math.round(compressed * 127) / 127

    // Decompressione µ-law
    out[i] = decompressMuLaw(quantized)
  }

  return out
}
