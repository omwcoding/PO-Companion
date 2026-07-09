import type { SampleSlot, ProjectSettings, ConcatenationResult } from '@/types'
import { PO33_MEMORY_SECONDS, PO33_SAMPLE_RATE } from '@/types'
import {
  findNearestZeroCrossing,
  applyMicroFadeOut,
} from '@/utils/audioHelpers'
import { repitchPCM } from '@/services/pitchShifter'

export interface ConcatenateOptions {
  slots: SampleSlot[]
  /** Map<sourceBufferId, Float32Array> con i dati PCM di ogni sorgente */
  sourceData: Map<string, Float32Array>
  settings: ProjectSettings
}

/**
 * Concatena i segmenti PCM dei pad assegnati in un unico flusso audio
 * pronto per essere inviato al PO-33.
 *
 * Struttura del flusso generato:
 *   [pre-roll 0.0] [Pad1] [gap 0.0] [Pad2] [gap 0.0] ... [PadN]
 *
 * Protezione anti-click:
 *   - Zero-crossing snap: sposta endSample al crossing più vicino
 *   - Micro-fade OUT: fade lineare sugli ultimi fadeSamples del segmento
 *
 * ⚠️ Fade-IN NON applicato: il PO-33 rileva il transiente in ingresso
 *    per eseguire il chop. Un fade-in rovina l'auto-chop.
 */
export function concatenateSlots(options: ConcatenateOptions): ConcatenationResult {
  const { slots, sourceData, settings } = options
  const log: string[] = []

  const sr = PO33_SAMPLE_RATE
  const gapSamples = Math.round((settings.gapDurationMs / 1000) * sr)
  const prefixSamples = Math.round((settings.prefixSilenceMs / 1000) * sr)
  const fadeSamples = Math.round((settings.fadeDurationMs / 1000) * sr)

  log.push(`Sample rate: ${sr}Hz`)
  log.push(`Gap: ${settings.gapDurationMs}ms (${gapSamples} campioni)`)
  log.push(`Pre-roll: ${settings.prefixSilenceMs}ms (${prefixSamples} campioni)`)
  log.push(`Anti-click: ${settings.antiClickMode}, fade: ${settings.fadeDurationMs}ms`)

  // Filtra solo i pad assegnati con sorgente valida, ordinati per id
  const assignedSlots = slots
    .filter((s) => s.isAssigned && s.sourceBufferId !== null)
    .sort((a, b) => a.id - b.id)

  if (assignedSlots.length === 0) {
    throw new Error('Nessun pad assegnato. Assegna almeno un pad prima di generare il flusso.')
  }

  log.push(`Pad assegnati: ${assignedSlots.length} (${assignedSlots.map((s) => s.id).join(', ')})`)

  // ── Calcola segmenti ──────────────────────────────────────────────────────
  interface Segment {
    slot: SampleSlot
    sourceData: Float32Array
    startSample: number
    endSample: number
    length: number
  }

  const segments: Segment[] = []

  for (const slot of assignedSlots) {
    const data = sourceData.get(slot.sourceBufferId!)
    if (!data) {
      log.push(`⚠️ Pad ${slot.id}: buffer sorgente non trovato, skip`)
      continue
    }

    let startSample = Math.round(slot.startMarker * sr)
    let endSample = Math.round(slot.endMarker * sr)

    // Clamp ai limiti del buffer
    startSample = Math.max(0, Math.min(startSample, data.length - 1))
    endSample = Math.max(startSample + 1, Math.min(endSample, data.length))

    if (endSample <= startSample) {
      log.push(`⚠️ Pad ${slot.id}: intervallo vuoto (start=${startSample}, end=${endSample}), skip`)
      continue
    }

    const origLength = endSample - startSample
    const pitchFactor = slot.pitch !== 0 ? Math.pow(2, slot.pitch / 12) : 1.0
    const resampledLength = Math.round(origLength / pitchFactor)

    segments.push({
      slot,
      sourceData: data,
      startSample,
      endSample,
      length: resampledLength,
    })

    log.push(
      `Pad ${slot.id} "${slot.name}": ${slot.startMarker.toFixed(3)}s → ${slot.endMarker.toFixed(3)}s ` +
      `(Pitch: ${slot.pitch > 0 ? '+' : ''}${slot.pitch} st, ${resampledLength} campioni = ${(resampledLength / sr).toFixed(3)}s)`,
    )
  }

  if (segments.length === 0) {
    throw new Error('Nessun segmento valido da concatenare.')
  }

  // ── Calcola lunghezza totale ───────────────────────────────────────────────
  const totalSegmentSamples = segments.reduce((acc, s) => acc + s.length, 0)
  const totalGapSamples = (segments.length - 1) * gapSamples
  const totalSamples = prefixSamples + totalSegmentSamples + totalGapSamples
  const totalSeconds = totalSamples / sr
  const overBudget = totalSeconds > PO33_MEMORY_SECONDS

  log.push(`─────────────────────────────`)
  log.push(`Totale campioni: ${totalSamples} (${totalSeconds.toFixed(3)}s)`)
  log.push(`Budget PO-33: ${PO33_MEMORY_SECONDS}s`)
  if (overBudget) {
    log.push(`⚠️ ATTENZIONE: il flusso supera il budget di ${PO33_MEMORY_SECONDS}s!`)
  } else {
    log.push(`✓ Rientra nel budget (${((totalSeconds / PO33_MEMORY_SECONDS) * 100).toFixed(1)}% usato)`)
  }

  // ── Alloca output (Float32Array inizializzata a 0.0 = silenzio garantito) ─
  const output = new Float32Array(totalSamples)
  let offset = prefixSamples // I campioni 0..prefixSamples-1 rimangono 0.0 (pre-roll)

  // ── Copia i segmenti con protezione anti-click ────────────────────────────
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const { startSample, sourceData: src } = seg
    let { endSample } = seg

    // ── Zero-Crossing Snap (se abilitato) ──────────────────────────────────
    if (settings.antiClickMode === 'zero-crossing' || settings.antiClickMode === 'both') {
      const windowSamples = fadeSamples
      const snapped = findNearestZeroCrossing(src, endSample, windowSamples)
      if (snapped !== endSample) {
        log.push(`  Pad ${seg.slot.id}: zero-crossing snap ${endSample} → ${snapped}`)
        endSample = snapped
      }
    }

    const segLength = endSample - startSample
    if (segLength <= 0) continue

    // Estrai il segmento (copia in un buffer temporaneo per il fade)
    let segment = src.slice(startSample, endSample)

    // Applica volume individuale del pad
    if (seg.slot.volume !== 1.0) {
      for (let j = 0; j < segment.length; j++) segment[j] *= seg.slot.volume
    }

    // Applica reverse se richiesto
    if (seg.slot.reversed) {
      segment.reverse()
    }

    // Applica custom Attack (fade-in)
    if (seg.slot.attack && seg.slot.attack > 0) {
      const attackSamples = Math.round(seg.slot.attack * sr)
      const fadeLen = Math.min(attackSamples, segment.length)
      for (let j = 0; j < fadeLen; j++) {
        segment[j] *= (j / fadeLen)
      }
    }

    // Applica custom Release (fade-out)
    if (seg.slot.release && seg.slot.release > 0) {
      const releaseSamples = Math.round(seg.slot.release * sr)
      const fadeLen = Math.min(releaseSamples, segment.length)
      for (let j = 0; j < fadeLen; j++) {
        segment[segment.length - 1 - j] *= (j / fadeLen)
      }
    }

    // ── Micro-Fade OUT (se abilitato) ──────────────────────────────────────
    if (settings.antiClickMode === 'fade' || settings.antiClickMode === 'both') {
      applyMicroFadeOut(segment, segment.length, Math.min(fadeSamples, segment.length))
    }

    // Applica repitch se specificato
    if (seg.slot.pitch !== 0) {
      segment = repitchPCM(segment, seg.slot.pitch) as Float32Array<ArrayBuffer>
    }

    // Copia il segmento nell'output con clamp di sicurezza per la lunghezza
    const copyLen = Math.min(segment.length, output.length - offset)
    if (copyLen > 0) {
      output.set(segment.subarray(0, copyLen), offset)
      offset += copyLen
    }

    // Salta il gap (già 0.0) — tranne dopo l'ultimo segmento
    if (i < segments.length - 1) {
      offset = Math.min(output.length, offset + gapSamples)
    }
  }

  log.push(`─────────────────────────────`)
  log.push(`✓ Concatenazione completata`)

  return {
    data: output,
    durationSeconds: totalSeconds,
    overBudget,
    log,
  }
}
