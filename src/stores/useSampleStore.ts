import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { SampleSlot, ProjectSettings } from '@/types'
import {
  createEmptySlot,
  DEFAULT_SETTINGS,
  PO33_MEMORY_SECONDS,
  PO33_MAX_PADS,
} from '@/types'
import {
  saveAudioFile,
  deleteAudioFile,
  saveProjectState,
  loadProjectState,
  loadAudioFiles,
  clearDB,
} from '@/services/db'

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

  /** Map<sourceBufferId, Float32Array> dei picchi calcolati per l'overview */
  const sourcePeaks = ref<Map<string, Float32Array>>(new Map())

  /** Il flusso concatenato finale (output pronto per PO-33) */
  const outputBuffer = ref<Float32Array | null>(null)

  /** Durata del flusso concatenato in secondi */
  const outputDurationSeconds = ref(0)

  /** Slot attualmente selezionato (1-16, 0 = nessuno) */
  const selectedSlotId = ref(0)

  /** ID del file sorgente correntemente attivo per il chopping */
  const activeSourceId = ref('')

  /** Impostazioni di progetto */
  const settings = ref<ProjectSettings>({ ...DEFAULT_SETTINGS })

  /** Log degli step dell'ultima concatenazione */
  const concatenationLog = ref<string[]>([])

  /** Preset attivo corrente */
  const activePresetId = ref('')
  const activePresetName = ref('')

  // ── Getters (Computed) ───────────────────────────────────────────────────

  /** Pad assegnati, ordinati per id */
  const assignedSlots = computed(() =>
    slots.value.filter((s) => s.isAssigned).sort((a, b) => a.id - b.id)
  )

  /** Durata totale stimata del flusso (senza normalizzazione) */
  const estimatedDurationSeconds = computed(() => {
    const assigned = assignedSlots.value
    if (assigned.length === 0) return 0
    const totalSegmentDuration = assigned.reduce((acc, s) => {
      const duration = s.endMarker - s.startMarker
      const factor = s.pitch !== 0 ? Math.pow(2, s.pitch / 12) : 1.0
      return acc + (duration / factor)
    }, 0)
    const totalGapDuration = (assigned.length - 1) * (settings.value.gapDurationMs / 1000)
    const prefixSilence = settings.value.prefixSilenceMs / 1000
    return prefixSilence + totalSegmentDuration + totalGapDuration
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

  // Flag per evitare di auto-salvare su IndexedDB durante la fase di ripristino iniziale
  const isRestoringFromDB = ref(false)

  // Auto-salvataggi asincroni su variazione stato
  watch(slots, (newSlots) => {
    if (isRestoringFromDB.value) return
    saveProjectState('slots', JSON.parse(JSON.stringify(newSlots)))
  }, { deep: true })

  watch(settings, (newSettings) => {
    if (isRestoringFromDB.value) return
    saveProjectState('settings', JSON.parse(JSON.stringify(newSettings)))
  }, { deep: true })

  watch(activeSourceId, (newId) => {
    if (isRestoringFromDB.value) return
    saveProjectState('activeSourceId', newId)
  })

  watch(activePresetId, (newId) => {
    if (isRestoringFromDB.value) return
    saveProjectState('activePresetId', newId)
  })

  watch(activePresetName, (newName) => {
    if (isRestoringFromDB.value) return
    saveProjectState('activePresetName', newName)
  })

  // ── Actions ──────────────────────────────────────────────────────────────

  function registerBuffer(
    id: string,
    pcmData: Float32Array,
    audioBuffer: AudioBuffer,
    fileName: string,
    overviewPeaks: Float32Array,
  ): void {
    sourceBuffers.value.set(id, pcmData)
    audioBuffers.value.set(id, audioBuffer)
    bufferMeta.value.set(id, {
      fileName,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    })
    sourcePeaks.value.set(id, overviewPeaks)
    activeSourceId.value = id

    // Salva file audio in IndexedDB in background
    saveAudioFile({
      id,
      fileName,
      pcmData,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate
    }).catch(err => console.error('Errore di persistenza file audio in IndexedDB:', err))
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
    slot.pitch = 0
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

  /** Elimina un file sorgente e libera i pad associati */
  function deleteSourceBuffer(id: string): void {
    sourceBuffers.value.delete(id)
    audioBuffers.value.delete(id)
    bufferMeta.value.delete(id)
    sourcePeaks.value.delete(id)

    // Libera tutti gli slot assegnati a questo file
    slots.value.forEach((s) => {
      if (s.sourceBufferId === id) {
        clearSlot(s.id)
      }
    })

    // Aggiorna activeSourceId se rimosso
    if (activeSourceId.value === id) {
      activeSourceId.value = [...sourceBuffers.value.keys()][0] || ''
    }

    // Rimuove da IndexedDB
    deleteAudioFile(id).catch(err => console.error('Errore di eliminazione file audio in IndexedDB:', err))
  }

  /** Resetta tutto lo stato e svuota IndexedDB */
  function resetAll(): void {
    slots.value = Array.from({ length: PO33_MAX_PADS }, (_, i) => createEmptySlot(i + 1))
    sourceBuffers.value = new Map()
    audioBuffers.value = new Map()
    bufferMeta.value = new Map()
    sourcePeaks.value = new Map()
    outputBuffer.value = null
    outputDurationSeconds.value = 0
    selectedSlotId.value = 0
    activeSourceId.value = ''
    concatenationLog.value = []
    settings.value = { ...DEFAULT_SETTINGS }

    clearDB().catch(err => console.error('Errore di cancellazione IndexedDB:', err))
  }

  /** Carica lo stato dal DB IndexedDB */
  async function loadFromDB(audioCtx: AudioContext): Promise<void> {
    isRestoringFromDB.value = true
    try {
      const files = await loadAudioFiles()
      for (const file of files) {
        // Re-crea l'AudioBuffer
        const buffer = audioCtx.createBuffer(1, file.pcmData.length, file.sampleRate)
        buffer.copyToChannel(file.pcmData as Float32Array<ArrayBuffer>, 0)

        // Ricalcola i picchi di overview
        const { computeOverviewPeaks } = await import('@/utils/peakAnalyzer')
        const overviewPeaks = computeOverviewPeaks(file.pcmData, 1000)

        sourceBuffers.value.set(file.id, file.pcmData)
        audioBuffers.value.set(file.id, buffer)
        bufferMeta.value.set(file.id, {
          fileName: file.fileName,
          duration: file.duration,
          sampleRate: file.sampleRate,
        })
        sourcePeaks.value.set(file.id, overviewPeaks)
      }

      // Ripristina slots, settings e activeSourceId
      const savedSlots = await loadProjectState('slots')
      if (savedSlots && savedSlots.length > 0) {
        slots.value = savedSlots
      }

      const savedSettings = await loadProjectState('settings')
      if (savedSettings) {
        settings.value = { ...DEFAULT_SETTINGS, ...savedSettings }
      }

      const savedActiveId = await loadProjectState('activeSourceId')
      if (savedActiveId && sourceBuffers.value.has(savedActiveId)) {
        activeSourceId.value = savedActiveId
      } else {
        activeSourceId.value = [...sourceBuffers.value.keys()][0] || ''
      }

      const savedPresetId = await loadProjectState('activePresetId')
      if (savedPresetId) {
        activePresetId.value = savedPresetId
      }

      const savedPresetName = await loadProjectState('activePresetName')
      if (savedPresetName) {
        activePresetName.value = savedPresetName
      }
    } catch (err) {
      console.error('Errore durante il caricamento da IndexedDB:', err)
    } finally {
      isRestoringFromDB.value = false
    }
  }

  /** Importa uno snapshot di progetto decodificando e persistendo i dati */
  async function importProjectSnapshot(snapshot: any, audioCtx: AudioContext): Promise<void> {
    isRestoringFromDB.value = true
    try {
      // Svuota lo stato locale
      slots.value = Array.from({ length: PO33_MAX_PADS }, (_, i) => createEmptySlot(i + 1))
      sourceBuffers.value = new Map()
      audioBuffers.value = new Map()
      bufferMeta.value = new Map()
      sourcePeaks.value = new Map()
      outputBuffer.value = null
      outputDurationSeconds.value = 0
      selectedSlotId.value = 0
      activeSourceId.value = ''
      concatenationLog.value = []

      // Pulisce IndexedDB prima dell'import
      await clearDB()

      const { base64ToFloat32Array } = await import('@/services/projectSnapshot')
      const { computeOverviewPeaks } = await import('@/utils/peakAnalyzer')

      // Ripristina e inserisce i file
      for (const file of snapshot.audioFiles) {
        const pcm = base64ToFloat32Array(file.pcmBase64)

        // Crea l'AudioBuffer
        const buffer = audioCtx.createBuffer(1, pcm.length, file.sampleRate)
        buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)

        // Calcola overview peaks
        const overviewPeaks = computeOverviewPeaks(pcm, 1000)

        sourceBuffers.value.set(file.id, pcm)
        audioBuffers.value.set(file.id, buffer)
        bufferMeta.value.set(file.id, {
          fileName: file.fileName,
          duration: file.duration,
          sampleRate: file.sampleRate,
        })
        sourcePeaks.value.set(file.id, overviewPeaks)

        // Salva in IndexedDB
        await saveAudioFile({
          id: file.id,
          fileName: file.fileName,
          pcmData: pcm,
          duration: file.duration,
          sampleRate: file.sampleRate,
        })
      }

      // Ripristina slots, settings e activeSourceId
      slots.value = snapshot.slots
      settings.value = snapshot.settings
      activeSourceId.value = snapshot.activeSourceId

      // Salva lo stato in IndexedDB
      await saveProjectState('slots', JSON.parse(JSON.stringify(slots.value)))
      await saveProjectState('settings', JSON.parse(JSON.stringify(settings.value)))
      await saveProjectState('activeSourceId', activeSourceId.value)
    } finally {
      isRestoringFromDB.value = false
    }
  }

  return {
    // State
    slots,
    sourceBuffers,
    audioBuffers,
    bufferMeta,
    sourcePeaks,
    outputBuffer,
    outputDurationSeconds,
    selectedSlotId,
    activeSourceId,
    activePresetId,
    activePresetName,
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
    deleteSourceBuffer,
    setOutputBuffer,
    selectSlot,
    updateSettings,
    resetAll,
    loadFromDB,
    importProjectSnapshot,
  }
})
