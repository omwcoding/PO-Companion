import { linearToDBFS } from './audioHelpers'

/**
 * Formatta una durata in secondi come stringa leggibile.
 * Es: 65.4 → "1:05.4"
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.0'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * Formatta una durata in millisecondi come stringa.
 * Es: 20 → "20ms"
 */
export function formatMs(ms: number): string {
  return `${Math.round(ms)}ms`
}

/**
 * Formatta una dimensione in byte come stringa leggibile.
 * Es: 1234567 → "1.2 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Formatta un valore lineare (0.0 – 1.0) come stringa dBFS.
 * Es: 0.97 → "-0.3 dBFS"
 */
export function formatDBFS(value: number): string {
  const db = linearToDBFS(value)
  if (!isFinite(db)) return '-∞ dBFS'
  return `${db.toFixed(1)} dBFS`
}

/**
 * Formatta un numero di campioni come stringa temporale a 44100Hz.
 * Es: 882 → "20.0ms"
 */
export function formatSamples(samples: number, sampleRate = 44100): string {
  const ms = (samples / sampleRate) * 1000
  return `${ms.toFixed(1)}ms`
}

/**
 * Formatta una percentuale (0.0 – 1.0) come stringa.
 * Es: 0.587 → "58.7%"
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
