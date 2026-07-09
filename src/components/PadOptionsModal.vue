<template>
  <transition name="fade">
    <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
      <transition name="scale">
        <div v-if="show" class="modal-container" :style="{ '--pad-color': slot?.color ?? '#FF6B2B' }">
          <!-- Header -->
          <div class="modal-header">
            <span class="pad-badge" :style="{ backgroundColor: slot?.color }">Pad {{ slotId }}</span>
            <h3 class="modal-title">Proprietà Pad</h3>
            <button class="close-btn" @click="$emit('close')" title="Chiudi">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <div v-if="slot" class="modal-body">
            <!-- Rinomina -->
            <div class="control-group">
              <label class="control-label">Nome Pad</label>
              <input
                type="text"
                v-model="slot.name"
                class="text-input"
                placeholder="Es. Kick, Snare, Voice..."
                maxlength="20"
              />
            </div>

            <!-- Volume -->
            <div class="control-group">
              <div class="label-row">
                <label class="control-label">Volume</label>
                <span class="value-label">{{ Math.round(slot.volume * 100) }}%</span>
              </div>
              <div class="slider-row">
                <button
                  class="mute-btn"
                  @click="slot.volume = slot.volume > 0 ? 0 : 1"
                  :title="slot.volume === 0 ? 'Attiva audio' : 'Disattiva audio'"
                >
                  <svg v-if="slot.volume > 0" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                </button>
                <input
                  type="range"
                  v-model.number="slot.volume"
                  min="0"
                  max="2"
                  step="0.05"
                  class="volume-slider"
                />
                <button
                  class="norm-pad-btn"
                  @click="onNormalizePad"
                  title="Normalizza il volume di questo pad a -0.3 dBFS"
                >
                  ⚡ Norm
                </button>
              </div>
            </div>

            <!-- Intervallo temporale (marker info) -->
            <div class="control-group">
              <label class="control-label">Slice Time</label>
              <div class="time-range-box" v-if="slot.isAssigned">
                <div class="time-point">
                  <span class="point-label">Start:</span>
                  <span class="point-value">{{ slot.startMarker.toFixed(3) }}s</span>
                </div>
                <div class="time-divider">➔</div>
                <div class="time-point">
                  <span class="point-label">End:</span>
                  <span class="point-value">{{ slot.endMarker.toFixed(3) }}s</span>
                </div>
                <div class="time-duration">
                  ({{ (slot.endMarker - slot.startMarker).toFixed(3) }}s)
                </div>
              </div>
              <div v-else class="time-range-box unassigned">
                Non assegnato
              </div>
            </div>

            <!-- Attack / Release Envelope -->
            <div class="control-group" v-if="slot.isAssigned">
              <div class="label-row">
                <label class="control-label">Attack (Fade-In)</label>
                <span class="value-label">{{ slot.attack.toFixed(2) }}s</span>
              </div>
              <input
                type="range"
                v-model.number="slot.attack"
                min="0"
                max="1.0"
                step="0.05"
                class="volume-slider"
              />
            </div>

            <div class="control-group" v-if="slot.isAssigned">
              <div class="label-row">
                <label class="control-label">Release (Fade-Out)</label>
                <span class="value-label">{{ slot.release.toFixed(2) }}s</span>
              </div>
              <input
                type="range"
                v-model.number="slot.release"
                min="0"
                max="1.0"
                step="0.05"
                class="volume-slider"
              />
            </div>

            <!-- Opzioni Boolean (Reverse, etc) -->
            <div class="options-row">
              <label class="toggle-container">
                <input type="checkbox" v-model="slot.reversed" />
                <span class="toggle-slider" />
                <span class="toggle-label">Reverse ↩</span>
              </label>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button
              class="footer-btn delete-btn"
              :disabled="!slot?.isAssigned"
              @click="onClear"
            >
              Rimuovi Sample
            </button>
            <div class="right-buttons">
              <button
                class="footer-btn preview-btn"
                :disabled="!slot?.isAssigned"
                @click="onPreview"
              >
                <span>Ascolta</span>
              </button>
              <button class="footer-btn close-action-btn" @click="$emit('close')">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { findPeak } from '@/utils/audioHelpers'

interface Props {
  show: boolean
  slotId: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'preview', slotId: number): void
}>()

const store = useSampleStore()
const engine = useAudioEngine()

const slot = computed(() => store.slots.find(s => s.id === props.slotId) ?? null)

function onClear() {
  if (confirm(`Sei sicuro di voler liberare il Pad ${props.slotId}?`)) {
    store.clearSlot(props.slotId)
    emit('close')
  }
}

async function onPreview() {
  const currentSlot = slot.value
  if (!currentSlot || !currentSlot.isAssigned || !currentSlot.sourceBufferId) return
  const audioBuffer = store.audioBuffers.get(currentSlot.sourceBufferId)
  if (!audioBuffer) return

  try {
    await engine.previewSlice(
      audioBuffer,
      currentSlot.startMarker,
      currentSlot.endMarker,
      currentSlot.volume,
      currentSlot.reversed,
      currentSlot.attack || 0,
      currentSlot.release || 0
    )
  } catch (err) {
    console.error('Preview error:', err)
  }
}

function onNormalizePad() {
  const currentSlot = slot.value
  if (!currentSlot || !currentSlot.isAssigned || !currentSlot.sourceBufferId) return
  const pcm = store.sourceBuffers.get(currentSlot.sourceBufferId)
  if (!pcm) return

  const sr = 44100
  const startSample = Math.round(currentSlot.startMarker * sr)
  const endSample = Math.round(currentSlot.endMarker * sr)

  if (endSample > startSample) {
    const slice = pcm.slice(startSample, endSample)
    const peak = findPeak(slice)
    if (peak > 0) {
      const target = store.settings.normalizationTarget
      const gain = target / peak
      currentSlot.volume = Math.min(Math.round(gain * 100) / 100, 2.0)
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 15, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-container {
  background: rgba(26, 26, 38, 0.85);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  border-top: 4px solid var(--pad-color);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6),
              inset 0 1px 1px rgba(255, 255, 255, 0.1);
  overflow: hidden;
  backdrop-filter: blur(20px);
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.pad-badge {
  font-size: 10px;
  font-weight: 700;
  color: #000;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  flex-grow: 1;
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

/* Body */
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.value-label {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--pad-color);
  font-weight: 600;
}

.text-input {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px 12px;
  color: white;
  font-size: 13px;
  transition: border-color 0.15s;
}

.text-input:focus {
  outline: none;
  border-color: var(--pad-color);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mute-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}

.mute-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.volume-slider {
  flex-grow: 1;
  height: 4px;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  cursor: pointer;
  accent-color: var(--pad-color);
}

.norm-pad-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 0 10px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pad-color);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.norm-pad-btn:hover {
  background: color-mix(in srgb, var(--pad-color) 12%, rgba(255, 255, 255, 0.08));
  border-color: var(--pad-color);
}

/* Time range details */
.time-range-box {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 8px 12px;
  gap: 12px;
  font-family: 'JetBrains Mono', monospace;
}

.time-range-box.unassigned {
  color: rgba(255, 255, 255, 0.25);
  font-style: italic;
  justify-content: center;
}

.time-point {
  display: flex;
  flex-direction: column;
}

.point-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
}

.point-value {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.time-divider {
  color: rgba(255, 255, 255, 0.15);
  font-size: 12px;
}

.time-duration {
  font-size: 11px;
  color: var(--pad-color);
  margin-left: auto;
  font-weight: 500;
}

/* Boolean Options */
.options-row {
  display: flex;
  align-items: center;
}

.toggle-container {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.toggle-container input {
  display: none;
}

.toggle-slider {
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  position: relative;
  transition: background-color 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.toggle-container input:checked + .toggle-slider {
  background: var(--pad-color);
}

.toggle-container input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

.toggle-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

/* Footer */
.modal-footer {
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.delete-btn {
  background: transparent;
  border: 1.5px solid rgba(255, 82, 82, 0.3);
  color: #FF5252;
}

.delete-btn:hover:not(:disabled) {
  background: rgba(255, 82, 82, 0.1);
  border-color: #FF5252;
}

.delete-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.right-buttons {
  display: flex;
  gap: 8px;
}

.preview-btn {
  background: var(--pad-color);
  border: none;
  color: #000;
}

.preview-btn:hover:not(:disabled) {
  filter: brightness(1.15);
}

.preview-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.close-action-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.close-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

/* Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.scale-enter-active, .scale-leave-active {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
}
.scale-enter-from, .scale-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
</style>
