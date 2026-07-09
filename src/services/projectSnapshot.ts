import type { SampleSlot, ProjectSettings } from '@/types'

export interface ProjectSnapshot {
  version: string
  activeSourceId: string
  settings: ProjectSettings
  slots: SampleSlot[]
  audioFiles: {
    id: string
    fileName: string
    duration: number
    sampleRate: number
    pcmBase64: string
  }[]
}

/**
 * Converte un Float32Array in una stringa codificata Base64.
 */
function float32ArrayToBase64(array: Float32Array): string {
  const buffer = array.buffer
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Converte una stringa codificata Base64 in un Float32Array.
 */
export function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Float32Array(bytes.buffer)
}

/**
 * Genera ed esporta lo snapshot JSON del progetto corrente (comprendente l'audio in Base64).
 */
export function exportProjectSnapshot(
  slots: SampleSlot[],
  settings: ProjectSettings,
  activeSourceId: string,
  sourceBuffers: Map<string, Float32Array>,
  bufferMeta: Map<string, { fileName: string; duration: number; sampleRate: number }>
): void {
  const audioFiles: ProjectSnapshot['audioFiles'] = []

  // Estrae tutti i file audio presenti nello store
  for (const [id, pcm] of sourceBuffers.entries()) {
    const meta = bufferMeta.get(id)
    if (!meta) continue

    audioFiles.push({
      id,
      fileName: meta.fileName,
      duration: meta.duration,
      sampleRate: meta.sampleRate,
      pcmBase64: float32ArrayToBase64(pcm)
    })
  }

  const snapshot: ProjectSnapshot = {
    version: '1.0',
    activeSourceId,
    settings,
    slots,
    audioFiles
  }

  const jsonString = JSON.stringify(snapshot, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `po-companion-project-${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Carica e valida un file JSON di snapshot di progetto.
 */
export function parseProjectSnapshot(jsonText: string): ProjectSnapshot {
  const parsed = JSON.parse(jsonText) as ProjectSnapshot
  if (!parsed.slots || !Array.isArray(parsed.slots) || !parsed.settings || !parsed.audioFiles) {
    throw new Error('Formato snapshot non valido. Manca la struttura di dati attesa.')
  }
  return parsed
}
