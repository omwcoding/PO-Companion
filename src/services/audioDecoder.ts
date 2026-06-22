import { PO33_SAMPLE_RATE } from '@/types'
import { mixToMono, resampleBuffer } from '@/utils/audioHelpers'

/** Formati audio accettati */
const ACCEPTED_TYPES = [
  'audio/mpeg',       // mp3
  'audio/wav',        // wav
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',        // ogg
  'audio/mp4',        // m4a / aac
  'audio/x-m4a',
  'audio/flac',       // flac
  'audio/x-flac',
]

/** Estensioni accettate (fallback se il browser non fornisce MIME type) */
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']

export interface DecodeResult {
  /** Buffer mono a 44100Hz pronto per l'uso */
  buffer: AudioBuffer
  /** Nome del file originale */
  fileName: string
  /** Sample rate originale prima del resample */
  originalSampleRate: number
  /** Numero di canali originali prima del mix-to-mono */
  originalChannels: number
  /** Durata in secondi */
  durationSeconds: number
  /** true se è stato eseguito il resample (es. iOS 48kHz) */
  resampled: boolean
}

/**
 * Verifica se un File è un formato audio supportato.
 */
export function isAudioFileSupported(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true
  const lower = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Legge un File audio e lo decodifica in un AudioBuffer mono a 44100Hz.
 *
 * Pipeline:
 *   File → ArrayBuffer → AudioBuffer (AudioContext.decodeAudioData)
 *        → mix to mono (se stereo/multi-canale)
 *        → resample a 44100Hz (se necessario — fix iOS Safari 48kHz)
 *
 * @param file       Il file audio da decodificare
 * @param audioCtx   Il contesto audio già inizializzato
 */
export async function decodeAudioFile(
  file: File,
  audioCtx: AudioContext,
): Promise<DecodeResult> {
  if (!isAudioFileSupported(file)) {
    throw new Error(`Formato non supportato: ${file.type || file.name}`)
  }

  // 1. File → ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()

  // 2. ArrayBuffer → AudioBuffer
  let decoded: AudioBuffer
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error(`Impossibile decodificare il file: ${file.name}. Il file potrebbe essere corrotto.`)
  }

  const originalSampleRate = decoded.sampleRate
  const originalChannels = decoded.numberOfChannels

  // 3. Mix stereo → mono
  // Lavoriamo con un OfflineAudioContext mono per il resample (step 4),
  // quindi il mix avviene implicitamente se il resample è necessario.
  // Se il sampleRate è già corretto, lo facciamo manualmente.
  let finalBuffer: AudioBuffer

  if (originalSampleRate !== PO33_SAMPLE_RATE) {
    // 4. Resample + mix in OfflineAudioContext mono a 44100Hz
    // Questo gestisce sia il resample che il mix stereo→mono in un solo passo.
    const ratio = PO33_SAMPLE_RATE / originalSampleRate
    const targetLength = Math.round(decoded.length * ratio)

    const offlineCtx = new OfflineAudioContext(1, targetLength, PO33_SAMPLE_RATE)

    // ChannelMergerNode per mix stereo→mono
    const merger = offlineCtx.createChannelMerger(originalChannels)
    const source = offlineCtx.createBufferSource()

    // Ricrea il buffer nel contesto offline (stesso sampleRate del decoded)
    const srcCtx = new OfflineAudioContext(originalChannels, decoded.length, originalSampleRate)
    const srcBuffer = srcCtx.createBuffer(originalChannels, decoded.length, originalSampleRate)
    for (let ch = 0; ch < originalChannels; ch++) {
      srcBuffer.copyToChannel(decoded.getChannelData(ch), ch)
    }

    source.buffer = srcBuffer

    if (originalChannels > 1) {
      // Connetti tutti i canali al merger, poi al destination (mono)
      source.connect(merger)
      merger.connect(offlineCtx.destination)
    } else {
      source.connect(offlineCtx.destination)
    }

    source.start(0)
    finalBuffer = await offlineCtx.startRendering()
  } else {
    // Il sampleRate è già 44100Hz: basta il mix stereo→mono
    if (originalChannels > 1) {
      const monoData = mixToMono(decoded)
      finalBuffer = audioCtx.createBuffer(1, monoData.length, PO33_SAMPLE_RATE)
      finalBuffer.copyToChannel(monoData, 0)
    } else {
      finalBuffer = decoded
    }
  }

  return {
    buffer: finalBuffer,
    fileName: file.name,
    originalSampleRate,
    originalChannels,
    durationSeconds: finalBuffer.duration,
    resampled: originalSampleRate !== PO33_SAMPLE_RATE,
  }
}

/**
 * Versione alternativa che usa resampleBuffer da audioHelpers.
 * Utile per resample di buffer già in memoria (non da File).
 */
export async function normalizeBuffer(
  buffer: AudioBuffer,
  audioCtx: AudioContext,
): Promise<AudioBuffer> {
  let result = buffer

  // Mix to mono se multi-canale
  if (result.numberOfChannels > 1) {
    const monoData = mixToMono(result)
    const monoBuffer = audioCtx.createBuffer(1, monoData.length, result.sampleRate)
    monoBuffer.copyToChannel(monoData, 0)
    result = monoBuffer
  }

  // Resample se necessario
  if (result.sampleRate !== PO33_SAMPLE_RATE) {
    result = await resampleBuffer(result, PO33_SAMPLE_RATE)
  }

  return result
}
