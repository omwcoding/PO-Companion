import { ref, computed, readonly } from 'vue'
import { PO33_SAMPLE_RATE } from '@/types'
import { simulatePO33LoFi } from '@/services/po33Simulator'
import { repitchPCM } from '@/services/pitchShifter'

/**
 * Composable che gestisce l'AudioContext singleton e il playback audio.
 *
 * Regole critiche:
 * - L'AudioContext viene creato SOLO dopo un gesto utente (click/touch).
 *   I browser bloccano la creazione automatica per evitare autoplay indesiderato.
 * - Un solo AudioContext viene riutilizzato per tutta la sessione.
 * - Il volume di playback è al massimo (gainNode con gain = 1.0).
 */

let _ctx: AudioContext | null = null
let _currentSource: AudioBufferSourceNode | null = null
let _startTime = 0
let _startOffset = 0
let _animFrame = 0

const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isContextReady = ref(false)
const contextSampleRate = ref(0)

/**
 * Inizializza (o riusa) l'AudioContext.
 * DEVE essere chiamato all'interno di un gestore di eventi utente.
 */
export function useAudioEngine() {

  function ensureContext(): AudioContext {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new AudioContext()
      isContextReady.value = true
      contextSampleRate.value = _ctx.sampleRate

      // Se iOS forza 48kHz, lo rendiamo visibile nei log
      if (_ctx.sampleRate !== PO33_SAMPLE_RATE) {
        console.warn(
          `[AudioEngine] AudioContext.sampleRate = ${_ctx.sampleRate}Hz ≠ ${PO33_SAMPLE_RATE}Hz. ` +
          `Il resample verrà applicato automaticamente in audioDecoder.ts.`
        )
      }
    }

    // Resume se suspended (politica autoplay browser)
    if (_ctx.state === 'suspended') {
      _ctx.resume()
    }

    return _ctx
  }

  /** Restituisce il contesto audio, creandolo se necessario. */
  function getContext(): AudioContext {
    return ensureContext()
  }

  /**
   * Riproduce un AudioBuffer dal tempo `startOffset` (in secondi).
   * Ferma qualsiasi riproduzione precedente.
   */
  function play(buffer: AudioBuffer, startOffset: number = 0): void {
    const ctx = ensureContext()
    stop()

    duration.value = buffer.duration

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0, startOffset)
    source.onended = () => {
      if (isPlaying.value) {
        isPlaying.value = false
        currentTime.value = buffer.duration
        cancelAnimationFrame(_animFrame)
      }
    }

    _currentSource = source
    _startTime = ctx.currentTime
    _startOffset = startOffset
    isPlaying.value = true

    // Aggiorna currentTime in loop
    function tick() {
      if (!_ctx || !isPlaying.value) return
      currentTime.value = Math.min(
        _ctx.currentTime - _startTime + _startOffset,
        buffer.duration,
      )
      _animFrame = requestAnimationFrame(tick)
    }
    tick()
  }

  /** Ferma la riproduzione corrente. */
  function stop(): void {
    cancelAnimationFrame(_animFrame)
    if (_currentSource) {
      try {
        _currentSource.stop()
        _currentSource.disconnect()
      } catch {
        // Il source potrebbe essere già terminato
      }
      _currentSource = null
    }
    isPlaying.value = false
  }

  /**
   * Crea un AudioBuffer mono o stereo da un Float32Array (eventualmente interleaved).
   * Applica la simulazione lo-fi del PO-33 se il flag simulatePO33 è attivo (solo al canale audio).
   */
  function createBufferFromFloat32(
    data: Float32Array,
    numChannels: number = 1,
    simulatePO33: boolean = false
  ): AudioBuffer {
    const ctx = ensureContext()
    const frames = data.length / numChannels
    const buffer = ctx.createBuffer(numChannels, frames, PO33_SAMPLE_RATE)

    if (numChannels === 1) {
      let channelData = new Float32Array(data)
      if (simulatePO33) {
        channelData = simulatePO33LoFi(channelData)
      }
      buffer.copyToChannel(channelData, 0)
    } else {
      // De-interleva L (sync) e R (audio)
      const left = new Float32Array(frames)
      let right = new Float32Array(frames)
      for (let i = 0; i < frames; i++) {
        left[i] = data[i * 2]
        right[i] = data[i * 2 + 1]
      }

      // Applica la simulazione solo al canale R (audio), NON a L (sync clock)
      if (simulatePO33) {
        right = simulatePO33LoFi(right)
      }

      buffer.copyToChannel(left, 0)
      buffer.copyToChannel(right, 1)
    }
    return buffer
  }

  /**
   * Riproduce un Float32Array direttamente (senza passare per AudioBuffer esterno).
   */
  function playFloat32(
    data: Float32Array,
    startOffset: number = 0,
    numChannels: number = 1,
    simulatePO33: boolean = false
  ): void {
    const buffer = createBufferFromFloat32(data, numChannels, simulatePO33)
    play(buffer, startOffset)
  }

  /** Salta a una posizione temporale (in secondi). */
  function seek(time: number, buffer: AudioBuffer): void {
    const wasPlaying = isPlaying.value
    stop()
    currentTime.value = Math.max(0, Math.min(time, buffer.duration))
    if (wasPlaying) {
      play(buffer, currentTime.value)
    }
  }

  /**
   * Riproduce un intervallo specifico di un AudioBuffer, applicando volume, reverse, fades e simulazione lo-fi opzionale.
   */
  function previewSlice(
    buffer: AudioBuffer,
    startMarker: number,
    endMarker: number,
    volume: number = 1.0,
    reversed: boolean = false,
    attack: number = 0,
    release: number = 0,
    pitch: number = 0,
    simulatePO33: boolean = false
  ): Promise<void> {
    const ctx = ensureContext()
    stop()

    const durationSeconds = endMarker - startMarker
    if (durationSeconds <= 0) return Promise.resolve()

    const sampleRate = buffer.sampleRate
    const startSample = Math.round(startMarker * sampleRate)
    const endSample = Math.round(endMarker * sampleRate)
    const length = Math.max(1, endSample - startSample)

    let channelData = new Float32Array(length)

    // Estrae i campioni del canale 0 per l'anteprima
    const origData = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      const idx = startSample + i
      channelData[i] = idx < origData.length ? origData[idx] * volume : 0
    }

    if (reversed) {
      channelData.reverse()
    }

    // Applica custom Attack (fade-in)
    if (attack > 0) {
      const attackSamples = Math.round(attack * sampleRate)
      const fadeLen = Math.min(attackSamples, length)
      for (let i = 0; i < fadeLen; i++) {
        channelData[i] *= (i / fadeLen)
      }
    }

    // Applica custom Release (fade-out)
    if (release > 0) {
      const releaseSamples = Math.round(release * sampleRate)
      const fadeLen = Math.min(releaseSamples, length)
      for (let i = 0; i < fadeLen; i++) {
        channelData[length - 1 - i] *= (i / fadeLen)
      }
    }

    // Applica pitch shifting (resampling)
    if (pitch !== 0) {
      channelData = repitchPCM(channelData, pitch)
    }

    // Applica simulazione lo-fi PO-33
    if (simulatePO33) {
      channelData = simulatePO33LoFi(channelData)
    }

    const sliceBuffer = ctx.createBuffer(1, channelData.length, sampleRate)
    sliceBuffer.copyToChannel(channelData, 0)

    return new Promise((resolve) => {
      duration.value = sliceBuffer.duration
      const source = ctx.createBufferSource()
      source.buffer = sliceBuffer
      source.connect(ctx.destination)
      source.start(0)

      source.onended = () => {
        if (isPlaying.value) {
          isPlaying.value = false
          currentTime.value = sliceBuffer.duration
          cancelAnimationFrame(_animFrame)
        }
        resolve()
      }

      _currentSource = source
      _startTime = ctx.currentTime
      _startOffset = 0
      isPlaying.value = true

      function tick() {
        if (!_ctx || !isPlaying.value) return
        currentTime.value = Math.min(
          _ctx.currentTime - _startTime,
          sliceBuffer.duration
        )
        _animFrame = requestAnimationFrame(tick)
      }
      tick()
    })
  }

  return {
    // State (readonly per i consumatori)
    isPlaying: readonly(isPlaying),
    currentTime: readonly(currentTime),
    duration: readonly(duration),
    isContextReady: readonly(isContextReady),
    contextSampleRate: readonly(contextSampleRate),

    // Computed
    progress: computed(() =>
      duration.value > 0 ? currentTime.value / duration.value : 0,
    ),

    // Methods
    getContext,
    play,
    stop,
    seek,
    playFloat32,
    createBufferFromFloat32,
    previewSlice,
  }
}
