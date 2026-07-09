import { PO33_SAMPLE_RATE } from '@/types'

/**
 * Codifica un Float32Array mono in un file WAV RIFF/WAVE PCM 16-bit.
 *
 * Formato output:
 *   - Container: RIFF/WAVE
 *   - Encoding:  PCM lineare, little-endian
 *   - Sample Rate: 44100 Hz
 *   - Bit Depth: 16-bit
 *   - Canali: 1 (mono)
 *
 * Conversione Float32 → Int16:
 *   int16 = clamp(round(float32 × 32767), -32768, 32767)
 */
export function encodeWAV(
  data: Float32Array,
  sampleRate: number = PO33_SAMPLE_RATE,
  numChannels: number = 1,
): Blob {
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = data.length * bytesPerSample
  const bufferSize = 44 + dataSize // 44 byte header WAV standard

  const buffer = new ArrayBuffer(bufferSize)
  const view = new DataView(buffer)

  // ── RIFF Header ────────────────────────────────────────────────────────
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)      // ChunkSize
  writeString(view, 8, 'WAVE')

  // ── fmt sub-chunk ───────────────────────────────────────────────────────
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)                // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true)                 // AudioFormat (PCM = 1)
  view.setUint16(22, numChannels, true)        // NumChannels
  view.setUint32(24, sampleRate, true)         // SampleRate
  view.setUint32(28, byteRate, true)           // ByteRate
  view.setUint16(32, blockAlign, true)         // BlockAlign
  view.setUint16(34, bitsPerSample, true)      // BitsPerSample

  // ── data sub-chunk ──────────────────────────────────────────────────────
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)           // Subchunk2Size

  // ── PCM Data (Float32 → Int16) ──────────────────────────────────────────
  let offset = 44
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    const int16 = s < 0 ? s * 32768 : s * 32767
    view.setInt16(offset, Math.round(int16), true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Genera il download del file WAV nel browser.
 *
 * @param data      Float32Array del flusso audio normalizzato
 * @param filename  Nome del file da scaricare (senza estensione)
 */
export function downloadWAV(
  data: Float32Array,
  filename: string = 'po-companion-output',
  numChannels: number = 1
): void {
  const blob = encodeWAV(data, PO33_SAMPLE_RATE, numChannels)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.wav`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoca l'URL dopo un breve delay per permettere il download
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
