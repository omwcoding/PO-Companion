<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'
import { useWaveformState } from '@/composables/useWaveformState'
import { useAudioEngine } from '@/composables/useAudioEngine'

// Components
import AppHeader from '@/components/AppHeader.vue'
import FileUploadBar from '@/components/FileUploadBar.vue'
import ModeSelector from '@/components/ModeSelector.vue'
import ChopToolbar from '@/components/ChopToolbar.vue'
import WaveformOverview from '@/components/WaveformOverview.vue'
import WaveformDetail from '@/components/WaveformDetail.vue'
import BudgetMeter from '@/components/BudgetMeter.vue'
import PadGrid from '@/components/PadGrid.vue'
import TransportBar from '@/components/TransportBar.vue'
import PadOptionsModal from '@/components/PadOptionsModal.vue'

// Services & Utils
import { detectTransients as runTransientDetection, snapToTransient } from '@/services/transientDetector'
import { concatenateSlots } from '@/services/pcmConcatenator'
import { normalize } from '@/services/audioNormalizer'
import { downloadWAV } from '@/services/wavEncoder'
import { formatDuration, formatDBFS } from '@/utils/formatters'
import type { TransientPoint } from '@/types'

const store = useSampleStore()
const waveform = useWaveformState()
const engine = useAudioEngine()

// ── State ─────────────────────────────────────────────────────────────────
const transients = ref<TransientPoint[]>([])
const showTransients = ref(false)
const showSettings = ref(false)
const showOptionsModal = ref(false)
const optionsSlotId = ref(0)

const isGenerating = ref(false)
const generateError = ref('')
const normResult = ref<{ peakBefore: number; peakAfter: number; gain: number } | null>(null)

// ── Computeds ─────────────────────────────────────────────────────────────
const activeSourceId = computed(() => [...store.sourceBuffers.keys()][0] || '')
const activeMonoData = computed(() => store.sourceBuffers.get(activeSourceId.value) || null)
const selectedSlot = computed(() => store.selectedSlot)

// Reset transients if the source file is removed
watch(() => waveform.hasSource.value, (hasSrc) => {
  if (!hasSrc) {
    transients.value = []
    showTransients.value = false
    showSettings.value = false
    normResult.value = null
  }
})

// ── Event Handlers ────────────────────────────────────────────────────────
function onPadLongPress(slotId: number) {
  optionsSlotId.value = slotId
  showOptionsModal.value = true
}

function handleDetailLongPress() {
  if (store.selectedSlotId) {
    optionsSlotId.value = store.selectedSlotId
    showOptionsModal.value = true
  }
}

function onMarkerUpdate(slotId: number, start: number, end: number) {
  store.updateMarkers(slotId, start, end)
}

function assignSelectionToPad() {
  const slotId = store.selectedSlotId
  const sourceId = activeSourceId.value
  if (!slotId || !sourceId) return

  // Assegna il 50% centrale della vista corrente
  const viewDur = waveform.viewEnd.value - waveform.viewStart.value
  const start = waveform.viewStart.value + viewDur * 0.25
  const end = waveform.viewStart.value + viewDur * 0.75
  store.assignSlot(slotId, sourceId, start, end)
}

function detectTransientsHandler() {
  const pcm = activeMonoData.value
  if (!pcm) return

  try {
    transients.value = runTransientDetection(pcm, 44100, {
      threshold: 1.3,
      minDistanceMs: 60,
      maxTransients: 32
    })
  } catch (err) {
    console.error('Errore durante il detect dei transienti:', err)
  }
}

function toggleTransientsHandler() {
  showTransients.value = !showTransients.value
}

function snapToTransientHandler() {
  const sel = selectedSlot.value
  if (!sel || !sel.isAssigned || transients.value.length === 0) return

  // Trova transiente più vicino per lo start e per l'end
  const nearStart = snapToTransient(sel.startMarker, transients.value, 1.5)
  const nearEnd = snapToTransient(sel.endMarker, transients.value, 1.5)

  const newStart = nearStart ? nearStart.timeSeconds : sel.startMarker
  const newEnd = nearEnd ? nearEnd.timeSeconds : sel.endMarker

  if (newEnd > newStart) {
    store.updateMarkers(sel.id, newStart, newEnd)
  }
}

// ── Stream Concatenation & Export ─────────────────────────────────────────
async function generateStream() {
  generateError.value = ''
  isGenerating.value = true
  normResult.value = null

  // Ferma eventuale riproduzione attiva
  engine.stop()

  try {
    const result = concatenateSlots({
      slots: store.slots,
      sourceData: store.sourceBuffers,
      settings: store.settings,
    })

    // Normalizzazione
    const norm = normalize(result.data, store.settings.normalizationMode, store.settings.normalizationTarget)
    normResult.value = {
      peakBefore: norm.peakBefore,
      peakAfter: norm.peakAfter,
      gain: norm.gain
    }

    store.setOutputBuffer(result.data, result.durationSeconds, result.log)
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isGenerating.value = false
  }
}

function exportWAV() {
  if (!store.outputBuffer) return
  const originalName = [...store.bufferMeta.values()][0]?.fileName || 'po-companion-output'
  const name = originalName.replace(/\.[^.]+$/, '')
  downloadWAV(store.outputBuffer, `${name}-po33`)
}
</script>

<template>
  <div class="app">
    <!-- Header -->
    <AppHeader
      :isGenerating="isGenerating"
      @generate="generateStream"
      @export="exportWAV"
    />

    <!-- Main Workspace -->
    <main class="app-main">
      <div class="workspace-grid">
        <!-- Colonna Sinistra: Audio e Waveform -->
        <div class="workspace-left">
          <!-- File Upload Section -->
          <div class="card section-card">
            <div class="card-header-row">
              <span class="section-label">1 — File Audio</span>
              <button
                v-if="waveform.hasSource.value"
                class="settings-toggle-btn"
                @click="showSettings = !showSettings"
                :class="{ active: showSettings }"
                title="Impostazioni avanzate"
              >
                ⚙️ Impostazioni
              </button>
            </div>
            <FileUploadBar />
          </div>

          <!-- Advanced Settings Panel (Collapsible) -->
          <transition name="slide-down">
            <div v-if="showSettings && waveform.hasSource.value" class="card section-card settings-panel">
              <span class="section-label">Impostazioni Avanzate</span>
              <div class="settings-grid">
                <div class="setting-item">
                  <label class="setting-label">Silenzio Pre-roll (ms)</label>
                  <div class="setting-control">
                    <input
                      type="range"
                      min="10" max="500" step="10"
                      :value="store.settings.prefixSilenceMs"
                      @input="store.updateSettings({ prefixSilenceMs: +($event.target as HTMLInputElement).value })"
                    />
                    <span class="setting-value">{{ store.settings.prefixSilenceMs }}ms</span>
                  </div>
                </div>

                <div class="setting-item">
                  <label class="setting-label">Anti-click Mode</label>
                  <select
                    class="input-select"
                    :value="store.settings.antiClickMode"
                    @change="store.updateSettings({ antiClickMode: ($event.target as HTMLSelectElement).value as any })"
                  >
                    <option value="both">Zero-crossing + Fade (Consigliato)</option>
                    <option value="fade">Solo Micro-Fade</option>
                    <option value="zero-crossing">Solo Zero-Crossing</option>
                  </select>
                </div>

                <div class="setting-item">
                  <label class="setting-label">Normalizzazione Target</label>
                  <div class="setting-control">
                    <input
                      type="range"
                      min="0.7" max="1.0" step="0.01"
                      :value="store.settings.normalizationTarget"
                      @input="store.updateSettings({ normalizationTarget: +($event.target as HTMLInputElement).value })"
                    />
                    <span class="setting-value">{{ formatDBFS(store.settings.normalizationTarget) }}</span>
                  </div>
                </div>

                <div class="setting-item">
                  <label class="setting-label">Modalità Norm.</label>
                  <select
                    class="input-select"
                    :value="store.settings.normalizationMode"
                    @change="store.updateSettings({ normalizationMode: ($event.target as HTMLSelectElement).value as any })"
                  >
                    <option value="global">Globale (intero flusso)</option>
                    <option value="per-pad">Per-pad (ogni segmento)</option>
                  </select>
                </div>
              </div>
            </div>
          </transition>

          <!-- Waveform editor area -->
          <transition name="fade">
            <div v-if="waveform.hasSource.value" class="waveform-section">
              <!-- Waveform Header / Toolbars -->
              <div class="waveform-toolbars-card card">
                <div class="toolbar-header">
                  <span class="section-label">2 — Waveform Chopper</span>
                  <ModeSelector />
                </div>
                <div class="toolbar-body">
                  <ChopToolbar
                    :transients="transients"
                    :showTransients="showTransients"
                    @detectTransients="detectTransientsHandler"
                    @toggleTransients="toggleTransientsHandler"
                    @snapToTransient="snapToTransientHandler"
                  />
                </div>
              </div>

              <!-- Overview Canvas -->
              <div class="card overview-card">
                <WaveformOverview />
              </div>

              <!-- Detail Canvas -->
              <div class="card detail-card">
                <WaveformDetail
                  :transients="showTransients ? transients : []"
                  :monoChannelData="activeMonoData"
                  @markerUpdate="onMarkerUpdate"
                  @longPress="handleDetailLongPress"
                />

                <!-- Empty Selected Pad State Overlay -->
                <div
                  v-if="store.selectedSlotId > 0 && !store.selectedSlot?.isAssigned"
                  class="unassigned-pad-overlay"
                >
                  <div class="unassigned-box">
                    <span class="unassigned-title">Pad {{ store.selectedSlotId }} Vuoto</span>
                    <p class="unassigned-text">Trascina i marker per selezionare, o assegna la porzione visibile della waveform.</p>
                    <button class="assign-action-btn" @click="assignSelectionToPad">
                      ➕ Assegna a Pad {{ store.selectedSlotId }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Compilation Log & normalization results (if generated) -->
              <div v-if="normResult" class="card norm-card">
                <div class="norm-title">⚡ Risultati Compilazione</div>
                <div class="norm-stats">
                  <div class="stat-box">
                    <span class="stat-label">Picco pre-norm</span>
                    <span class="stat-value">{{ formatDBFS(normResult.peakBefore) }}</span>
                  </div>
                  <div class="stat-box">
                    <span class="stat-label">Guadagno</span>
                    <span class="stat-value">×{{ normResult.gain.toFixed(2) }}</span>
                  </div>
                  <div class="stat-boxHighlight">
                    <span class="stat-label">Picco finale</span>
                    <span class="stat-valueHighlight">{{ formatDBFS(normResult.peakAfter) }}</span>
                  </div>
                  <div class="stat-box">
                    <span class="stat-label">Durata Output</span>
                    <span class="stat-value">{{ formatDuration(store.outputDurationSeconds) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- Colonna Destra: Griglia Pad e Output -->
        <div class="workspace-right" :class="{ 'has-source': waveform.hasSource.value }">
          <div class="card pad-section-card">
            <span class="section-label">3 — Griglia Pad</span>
            <PadGrid @longPress="onPadLongPress" />
          </div>

          <div v-if="waveform.hasSource.value" class="card output-section-card">
            <span class="section-label">4 — Budget & Output</span>
            <div class="output-inner">
              <BudgetMeter />
              <div class="transport-wrap">
                <TransportBar />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs Terminal Box (Collapsible) -->
      <div v-if="store.concatenationLog.length > 0" class="card log-card">
        <span class="section-label">Logs Concatenatore</span>
        <div class="log-terminal">
          <div
            v-for="(line, i) in store.concatenationLog"
            :key="i"
            class="log-line"
            :class="{
              'log-line-warn': line.includes('⚠️'),
              'log-line-ok': line.includes('✓'),
              'log-line-divider': line.startsWith('───')
            }"
          >
            {{ line }}
          </div>
        </div>
      </div>
    </main>

    <!-- Pad Options Modal -->
    <PadOptionsModal
      :show="showOptionsModal"
      :slotId="optionsSlotId"
      @close="showOptionsModal = false"
    />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #08080C;
  color: #F3F3F7;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  gap: 16px;
}

/* Grid layout */
.workspace-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 800px) {
  .workspace-grid {
    grid-template-columns: 1.4fr 1fr;
  }
}

.workspace-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.workspace-right.has-source {
  opacity: 1;
  pointer-events: auto;
}

/* Section card header customizations */
.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: rgba(255, 255, 255, 0.4);
}

.settings-toggle-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}

.settings-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.settings-toggle-btn.active {
  background: rgba(255, 107, 43, 0.1);
  border-color: #FF6B2B;
  color: #FF6B2B;
}

/* Collapsible Settings Panel */
.settings-panel {
  background: rgba(25, 25, 35, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 10px;
}

@media (min-width: 500px) {
  .settings-grid {
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.setting-control input[type="range"] {
  flex: 1;
  height: 3px;
  background: rgba(255, 255, 255, 0.12);
  appearance: none;
  cursor: pointer;
  accent-color: #FF6B2B;
  border-radius: 2px;
}

.setting-value {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: #00E5FF;
  min-width: 54px;
  text-align: right;
}

.input-select {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: white;
  padding: 6px 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.input-select:focus {
  border-color: #FF6B2B;
}

/* Waveform components wrapper */
.waveform-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.waveform-toolbars-card {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 6px;
}

.overview-card {
  padding: 8px;
}

.detail-card {
  padding: 4px;
  height: 200px;
  position: relative;
}

/* Overlay for unassigned pad */
.unassigned-pad-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 15, 0.65);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.unassigned-box {
  background: rgba(26, 26, 38, 0.9);
  border: 1.5px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 18px 24px;
  text-align: center;
  max-width: 320px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.unassigned-title {
  font-size: 14px;
  font-weight: 700;
  color: #FFD93D;
  display: block;
  margin-bottom: 6px;
}

.unassigned-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 12px;
  line-height: 1.5;
}

.assign-action-btn {
  background: #FF6B2B;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.assign-action-btn:hover {
  background: #FF8A50;
}

/* Pad and Output Right Panel Cards */
.pad-section-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.output-section-card {
  padding: 14px;
}

.output-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.transport-wrap {
  margin-top: 4px;
}

/* Normalization results card */
.norm-card {
  padding: 12px 16px;
  background: rgba(0, 229, 255, 0.03);
  border: 1.5px solid rgba(0, 229, 255, 0.12);
}

.norm-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #00E5FF;
  margin-bottom: 8px;
}

.norm-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

@media (min-width: 480px) {
  .norm-stats {
    grid-template-columns: repeat(4, 1fr);
  }
}

.stat-box {
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.03);
}

.stat-boxHighlight {
  display: flex;
  flex-direction: column;
  background: rgba(0, 230, 118, 0.06);
  border-radius: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(0, 230, 118, 0.15);
}

.stat-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.stat-value {
  font-size: 13px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.85);
}

.stat-valueHighlight {
  font-size: 13px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: #00E676;
}

/* Log Card Terminal */
.log-card {
  padding: 14px;
  margin-top: 8px;
}

.log-terminal {
  background: #06060A;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px 14px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 8px;
}

.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line-warn {
  color: #FFD93D;
}

.log-line-ok {
  color: #00E676;
}

.log-line-divider {
  color: rgba(255, 255, 255, 0.15);
  margin: 4px 0;
}

/* Transitions */
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
}
.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
