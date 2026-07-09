import { PO33_SAMPLE_RATE } from '@/types'

/**
 * Genera un segnale di sync biphasico (Left) e lo interleva con l'audio mono (Right) in stereo.
 *
 * @param monoAudio  Float32Array contenente l'audio mono (già normalizzato)
 * @param bpm        BPM del segnale di clock
 * @returns          Float32Array interleaved stereo (lunghezza = monoAudio.length * 2)
 */
export function generateSyncInterleaved(monoAudio: Float32Array, bpm: number): Float32Array {
  const sr = PO33_SAMPLE_RATE
  // 2 PPQN = 2 impulsi per quarto (ottavi)
  // pulseInterval in secondi = 60 / BPM / 2 = 30 / BPM
  const pulseIntervalSec = 30 / bpm
  const samplesPerPulse = Math.round(pulseIntervalSec * sr)
  const length = monoAudio.length

  // Alloca buffer interleaved stereo
  const stereo = new Float32Array(length * 2)

  // Canale Left: conterrà gli impulsi di sync
  const left = new Float32Array(length)

  // Durata dell'impulso: ~2.5ms (110 campioni a 44.1kHz)
  // Biphasico (DC balanced): 55 campioni a +1.0, 55 campioni a -1.0
  const pulseHalfWidth = 55

  for (let offset = 0; offset < length; offset += samplesPerPulse) {
    // Scrive la prima metà dell'impulso (+1.0)
    const limitFirstHalf = Math.min(length, offset + pulseHalfWidth)
    for (let i = offset; i < limitFirstHalf; i++) {
      left[i] = 1.0
    }

    // Scrive la seconda metà dell'impulso (-1.0)
    const limitSecondHalf = Math.min(length, offset + 2 * pulseHalfWidth)
    for (let i = offset + pulseHalfWidth; i < limitSecondHalf; i++) {
      left[i] = -1.0
    }
  }

  // Interleva: Left (sync) a indice pari, Right (audio) a indice dispari
  for (let i = 0; i < length; i++) {
    stereo[i * 2] = left[i]
    stereo[i * 2 + 1] = monoAudio[i]
  }

  return stereo
}
