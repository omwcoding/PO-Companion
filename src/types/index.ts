// ─── Core Data Structures ──────────────────────────────────────────────────

/** Rappresenta un singolo pad della griglia 4x4 */
export interface SampleSlot {
  /** Posizione nella griglia (1-16) */
  id: number
  /** Nome personalizzabile ("Kick", "Snare", ...) */
  name: string
  /** Riferimento al buffer sorgente in IndexedDB. Può essere diverso per ogni pad. */
  sourceBufferId: string | null
  /** Punto di inizio taglio in secondi (precisione ms) */
  startMarker: number
  /** Punto di fine taglio in secondi (precisione ms) */
  endMarker: number
  /** true se il pad ha un campione assegnato */
  isAssigned: boolean
  /** Volume individuale del pad 0.0 – 1.0 */
  volume: number
  /** Colore visuale del pad nella griglia */
  color: string
  /** true = PCM invertito (effetto reverse) */
  reversed: boolean
  /** Attack (fade-in) in secondi (default: 0) */
  attack: number
  /** Release (fade-out) in secondi (default: 0) */
  release: number
  /** Pitch shift (repitch) in semitoni -12 a +12 (default: 0) */
  pitch: number
}

/** Impostazioni di progetto */
export interface ProjectSettings {
  /** Durata gap di silenzio tra i pad in ms (default: 20) */
  gapDurationMs: number
  /** Silenzio pre-roll prima del primo pad in ms (default: 50) */
  prefixSilenceMs: number
  /** Sample rate fisso per il PO-33 */
  sampleRate: 44100
  /** Picco target per normalizzazione float 0.0-1.0 (default: 0.97 ≈ -0.3 dBFS) */
  normalizationTarget: number
  /** Normalizzazione sull'intero flusso o per-pad individualmente */
  normalizationMode: 'global' | 'per-pad'
  /** Abilita split L=sync / R=audio (Fase 3) */
  syncEnabled: boolean
  /** BPM per il clock sync */
  syncBpm: number
  /** Strategia di protezione anti-click ai bordi dei segmenti */
  antiClickMode: 'fade' | 'zero-crossing' | 'both'
  /** Durata micro-fade in ms (default: 2) */
  fadeDurationMs: number
  /** Modalità destinazione sul PO-33 */
  slotMode: 'drum' | 'melodic'
  /** Abilita la simulazione audio lo-fi del PO-33 nell'anteprima */
  po33Simulation: boolean
}

/** Progetto salvato */
export interface Project {
  /** UUID */
  id: string
  /** Nome del progetto */
  name: string
  /** Timestamp creazione */
  createdAt: number
  /** Timestamp ultimo aggiornamento */
  updatedAt: number
  /** Array di 16 slot */
  slots: SampleSlot[]
  /** Lista di tutti i sourceBufferId usati nel progetto */
  sourceBufferIds: string[]
  settings: ProjectSettings
}

/** Buffer audio serializzato per IndexedDB */
export interface StoredAudioBuffer {
  /** UUID */
  id: string
  /** Nome file originale */
  fileName: string
  sampleRate: number
  numberOfChannels: number
  /** Numero totale di campioni per canale */
  length: number
  /** Dati PCM per canale (Float32Array serializzati) */
  channelData: Float32Array[]
}

/** Punto transiente rilevato automaticamente */
export interface TransientPoint {
  /** Posizione temporale nel buffer sorgente in secondi */
  timeSeconds: number
  /** Forza del transiente 0.0 – 1.0 */
  strength: number
}

// ─── Result Types ──────────────────────────────────────────────────────────

/** Risultato della concatenazione PCM */
export interface ConcatenationResult {
  /** Il flusso audio concatenato (mono, 44100Hz) */
  data: Float32Array
  /** Durata totale in secondi */
  durationSeconds: number
  /** true se supera il budget di 40s */
  overBudget: boolean
  /** Log degli step eseguiti */
  log: string[]
}

/** Risultato della normalizzazione */
export interface NormalizationResult {
  /** Dati normalizzati */
  data: Float32Array
  /** Picco prima della normalizzazione (0.0 – 1.0) */
  peakBefore: number
  /** Picco dopo la normalizzazione (0.0 – 1.0) */
  peakAfter: number
  /** Guadagno applicato */
  gain: number
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const PO33_MEMORY_SECONDS = 40.0
export const PO33_SAMPLE_RATE = 44100
export const PO33_MAX_PADS = 16

export const DEFAULT_SETTINGS: ProjectSettings = {
  gapDurationMs: 20,
  prefixSilenceMs: 50,
  sampleRate: 44100,
  normalizationTarget: 0.97,
  normalizationMode: 'global',
  syncEnabled: false,
  syncBpm: 120,
  antiClickMode: 'both',
  fadeDurationMs: 2,
  slotMode: 'drum',
  po33Simulation: false,
}

/** Colori predefiniti per i 16 pad */
export const PAD_COLORS: string[] = [
  '#FF6B2B', '#FFD93D', '#00E676', '#00E5FF',
  '#B388FF', '#FF80AB', '#69F0AE', '#40C4FF',
  '#FF6E40', '#EEFF41', '#64FFDA', '#18FFFF',
  '#FF4081', '#7C4DFF', '#00BFA5', '#FFAB00',
]

/** Genera uno slot vuoto con valori default */
export function createEmptySlot(id: number): SampleSlot {
  return {
    id,
    name: `Pad ${id}`,
    sourceBufferId: null,
    startMarker: 0,
    endMarker: 0,
    isAssigned: false,
    volume: 1.0,
    color: PAD_COLORS[(id - 1) % PAD_COLORS.length],
    reversed: false,
    attack: 0,
    release: 0,
    pitch: 0,
  }
}
