import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SampleSlot, ProjectSettings } from '@/types'
import {
  createEmptySlot,
  DEFAULT_SETTINGS,
  PO33_MEMORY_SECONDS,
  PO33_MAX_PADS,
} from '@/types'

export const useSampleStore = defineStore('sample', () => {
  // ── State ────────────────────────────────────────────────────────────────

  /** I 16 slot della griglia */
  const slots = ref<SampleSlot[]>(
    Array.from({ length: PO33_MAX_PADS }, (_, i) => createEmptySlot(i + 1))
  )

  /** Map<sourceBufferId, Float32Array> dei buffer PCM in memoria */
  const sourceBuffers = ref<Map<string, Float32Array>>(new Map())

  /** Map<sourceBufferId, AudioBuffer> per il playback Web Audio */
  const audioBuffers = ref<Map<string, AudioBuffer>>(new Map())

  /** Map<sourceBufferId, { fileName, duration, sampleRate }> metadati */
  const bufferMeta = ref<Map<string, { fileName: string; duration: number; sampleRate: number }>>(new Map())

  /** Il flusso concatenato finale (output pronto per PO-33) */
  const outputBuffer = ref<Float32Array | null>(null)

  /** Durata del flusso concatenato in secondi */
  const outputDurationSeconds = ref(0)

  /** Slot attualmente selezionato (1-16, 0 = nessuno) */
  const selectedSlotId = ref(0)

  /** Impostazioni di progetto */
  const settings = ref<ProjectSettings>({ ...DEFAULT_SETTINGS })

  /** Log degli step dell'ultima concatenazione */
  const concatenationLog = ref<string[]>([])

  // ── Getters (Computed) ───────────────────────────────────────────────────

  /** Pad assegnati, ordinati per id */
  const assignedSlots = computed(() =>
    slots.value.filter((s) => s.isAssigned).sort((a, b) => a.id - b.id)
  )

  /** Durata totale stimata del flusso (senza normalizzazione) */
  const estimatedDurationSeconds = computed(() => {
    const assigned = assignedSlots.value

    if (assigned.length === 0) return 0

    const segmentsDuration = assigned.reduce(
      (acc, s) => acc + (s.endMarker - s.startMarker),
      0,
    )
    const gapDuration = ((assigned.length - 1) * settings.value.gapDurationMs) / 1000
    const prefixDuration = settings.value.prefixSilenceMs / 1000

    return segmentsDuration + gapDuration + prefixDuration
  })

  /** Percentuale del budget 40s usato (0.0 – 1.0, può superare 1.0) */
  const budgetUsed = computed(() =>
    Math.min(estimatedDurationSeconds.value / PO33_MEMORY_SECONDS, 1.0)
  )

  /** true se il flusso supera il budget */
  const isOverBudget = computed(() =>
    estimatedDurationSeconds.value > PO33_MEMORY_SECONDS
  )

  /** Slot selezionato corrente */
  const selectedSlot = computed(() =>
    slots.value.find((s) => s.id === selectedSlotId.value) ?? null
  )

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Registra un nuovo buffer sorgente in memoria */
  function registerBuffer(
    id: string,
    pcmData: Float32Array,
    audioBuffer: AudioBuffer,
    fileName: string,
  ): void {
    sourceBuffers.value.set(id, pcmData)
    audioBuffers.value.set(id, audioBuffer)
    bufferMeta.value.set(id, {
      fileName,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    })
  }

  /** Assegna un buffer sorgente a uno slot con i marker specificati */
  function assignSlot(
    slotId: number,
    sourceBufferId: string,
    startMarker: number,
    endMarker: number,
  ): void {
    const slot = slots.value.find((s) => s.id === slotId)
    if (!slot) return
    slot.sourceBufferId = sourceBufferId
    slot.startMarker = startMarker
    slot.endMarker = endMarker
    slot.isAssigned = true
  }

  /** Aggiorna i marker di un slot */
  function updateMarkers(slotId: number, startMarker: number, endMarker: number): void {
    const slot = slots.value.find((s) => s.id === slotId)
    if (!slot) return
    slot.startMarker = startMarker
    slot.endMarker = endMarker
  }

  /** Aggiorna il nome di un slot */
  function renameSlot(slotId: number, name: string): void {
    const slot = slots.value.find((s) => s.id === slotId)
    if (slot) slot.name = name
  }

  /** Pulisce uno slot (rimuove l'assegnazione) */
  function clearSlot(slotId: number): void {
    const slot = slots.value.find((s) => s.id === slotId)
    if (!slot) return
    slot.sourceBufferId = null
    slot.startMarker = 0
    slot.endMarker = 0
    slot.isAssigned = false
    slot.volume = 1.0
    slot.reversed = false
    slot.attack = 0
    slot.release = 0
    slot.name = `Pad ${slotId}`
  }

  /** Salva il buffer di output concatenato */
  function setOutputBuffer(data: Float32Array, durationSeconds: number, log: string[]): void {
    outputBuffer.value = data
    outputDurationSeconds.value = durationSeconds
    concatenationLog.value = log
  }

  /** Seleziona uno slot */
  function selectSlot(slotId: number): void {
    selectedSlotId.value = slotId === selectedSlotId.value ? 0 : slotId
  }

  /** Aggiorna le impostazioni (merge parziale) */
  function updateSettings(patch: Partial<ProjectSettings>): void {
    settings.value = { ...settings.value, ...patch }
  }

  /** Resetta tutto lo stato */
  function resetAll(): void {
    slots.value = Array.from({ length: PO33_MAX_PADS }, (_, i) => createEmptySlot(i + 1))
    sourceBuffers.value = new Map()
    audioBuffers.value = new Map()
    bufferMeta.value = new Map()
    outputBuffer.value = null
    outputDurationSeconds.value = 0
    selectedSlotId.value = 0
    concatenationLog.value = []
    settings.value = { ...DEFAULT_SETTINGS }
  }

  return {
    // State
    slots,
    sourceBuffers,
    audioBuffers,
    bufferMeta,
    outputBuffer,
    outputDurationSeconds,
    selectedSlotId,
    settings,
    concatenationLog,

    // Getters
    assignedSlots,
    estimatedDurationSeconds,
    budgetUsed,
    isOverBudget,
    selectedSlot,

    // Actions
    registerBuffer,
    assignSlot,
    updateMarkers,
    renameSlot,
    clearSlot,
    setOutputBuffer,
    selectSlot,
    updateSettings,
    resetAll,
  }
})
