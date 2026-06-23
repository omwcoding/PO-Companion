/**
 * peakAnalyzer.ts
 * ───────────────
 * Converte un AudioBuffer in un array di peak data per il rendering waveform.
 *
 * Output: Float32Array di lunghezza `numBins * 2`.
 * Ogni coppia [i*2, i*2+1] = [min_amplitude, max_amplitude] per la colonna i.
 * Valori in range [-1, 1].
 */

/**
 * Computa i peak data dalla channel data di un AudioBuffer.
 *
 * @param channelData - Float32Array dei campioni PCM (mono, -1.0 a 1.0)
 * @param numBins - numero di colonne desiderate (tipicamente la larghezza del canvas in px)
 * @returns Float32Array con coppie [min, max] per ogni bin
 */
export function computePeaks(channelData: Float32Array, numBins: number): Float32Array {
  const totalSamples = channelData.length
  const peaks = new Float32Array(numBins * 2)

  for (let i = 0; i < numBins; i++) {
    const startSample = Math.floor((i / numBins) * totalSamples)
    const endSample = Math.floor(((i + 1) / numBins) * totalSamples)

    let min = 0
    let max = 0

    for (let s = startSample; s < endSample; s++) {
      const val = channelData[s]
      if (val < min) min = val
      if (val > max) max = val
    }

    peaks[i * 2] = min
    peaks[i * 2 + 1] = max
  }

  return peaks
}

/**
 * Computa i peak per la Overview (intera durata del file).
 * Usa un numero di bin adattato alla larghezza dello schermo.
 *
 * @param channelData - campioni PCM mono
 * @param overviewWidth - larghezza in pixel della strip overview
 */
export function computeOverviewPeaks(channelData: Float32Array, overviewWidth: number): Float32Array {
  // Per l'overview usiamo devicePixelRatio * larghezza per nitidezza su retina
  const bins = Math.max(overviewWidth * 2, 400) // minimo 400 bin
  return computePeaks(channelData, bins)
}

/**
 * Estrae i picchi per una sotto-regione del buffer.
 * Usato nel detail renderer per renderizzare solo la regione visibile.
 *
 * @param channelData - campioni PCM mono dell'intero file
 * @param sampleRate - sample rate del buffer
 * @param viewStartSec - inizio regione visibile (secondi)
 * @param viewEndSec - fine regione visibile (secondi)
 * @param numBins - larghezza canvas detail
 */
export function computeDetailPeaks(
  channelData: Float32Array,
  sampleRate: number,
  viewStartSec: number,
  viewEndSec: number,
  numBins: number
): Float32Array {
  const startSample = Math.floor(viewStartSec * sampleRate)
  const endSample = Math.min(channelData.length, Math.ceil(viewEndSec * sampleRate))
  const regionData = channelData.subarray(startSample, endSample)
  return computePeaks(regionData, numBins)
}

/**
 * Mixdown a mono da buffer multi-canale.
 * Restituisce un Float32Array mono.
 */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length
  const mono = new Float32Array(length)

  if (buffer.numberOfChannels === 1) {
    mono.set(buffer.getChannelData(0))
    return mono
  }

  // Media aritmetica di tutti i canali
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      mono[i] += channel[i]
    }
  }
  const numChannels = buffer.numberOfChannels
  for (let i = 0; i < length; i++) {
    mono[i] /= numChannels
  }

  return mono
}
