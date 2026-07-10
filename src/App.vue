<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'
import { useWaveformState } from '@/composables/useWaveformState'
import { useAudioEngine } from '@/composables/useAudioEngine'

// Components
import PasswordGate from '@/components/PasswordGate.vue'
import AppHeader from '@/components/AppHeader.vue'
import PresetsModal from '@/components/PresetsModal.vue'
import GuideModal from '@/components/GuideModal.vue'
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
import { generateSyncInterleaved } from '@/services/syncGenerator'
import { downloadWAV } from '@/services/wavEncoder'
import { buildProjectSnapshot, parseProjectSnapshot } from '@/services/projectSnapshot'
import { loadUserPresets, saveUserPreset, deleteUserPreset, type UserPreset } from '@/services/db'
import { v4 as uuidv4 } from 'uuid'
import { formatDuration, formatDBFS } from '@/utils/formatters'
import type { TransientPoint } from '@/types'

const store = useSampleStore()
const waveform = useWaveformState()
const engine = useAudioEngine()

// ── State ─────────────────────────────────────────────────────────────────
const isAuthorized = ref(false)
const transients = ref<TransientPoint[]>([])
const showTransients = ref(false)
const showSettings = ref(false)
const showOptionsModal = ref(false)
const showPresetsModal = ref(false)
const showGuideModal = ref(false)
const optionsSlotId = ref(0)

const factoryPresets = ref<{ id: string; name: string; fileName: string; description: string }[]>([])
const userPresets = ref<UserPreset[]>([])

const isGenerating = ref(false)
const generateError = ref('')
const normResult = ref<{ peakBefore: number; peakAfter: number; gain: number } | null>(null)

// ── Computeds ─────────────────────────────────────────────────────────────
const activeSourceId = computed(() => store.activeSourceId)
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

// Aggiorna lo stato della waveform quando cambia la sorgente attiva (caricamento o switch dropdown)
watch(() => store.activeSourceId, (newId) => {
  transients.value = []
  showTransients.value = false

  if (!newId) {
    waveform.resetWaveform()
    return
  }

  const meta = store.bufferMeta?.get(newId)
  const cachedPeaks = store.sourcePeaks?.get(newId)
  if (meta && cachedPeaks) {
    waveform.setPeaks(cachedPeaks)
    waveform.initView(meta.duration, 10)
  }
}, { immediate: true })

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

    // Normalizzazione (avviene sempre in mono prima del sync per evitare bias del picco del clock)
    const norm = normalize(result.data, store.settings.normalizationMode, store.settings.normalizationTarget)
    normResult.value = {
      peakBefore: norm.peakBefore,
      peakAfter: norm.peakAfter,
      gain: norm.gain
    }

    let finalData = norm.data
    if (store.settings.syncEnabled) {
      finalData = generateSyncInterleaved(norm.data, store.settings.syncBpm)
      result.log.push(`✓ Segnale Sync PO-33 generato a ${store.settings.syncBpm} BPM (Canale L) ed interleto con l'audio (Canale R).`)
    }

    store.setOutputBuffer(finalData, result.durationSeconds, result.log)
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
  downloadWAV(store.outputBuffer, `${name}-po33`, store.settings.syncEnabled ? 2 : 1)
}


async function importProject(snapshot: any) {
  try {
    const ctx = engine.getContext()
    await store.importProjectSnapshot(snapshot, ctx)
    await refreshPresetsList()
  } catch (err) {
    alert(`Errore nell'importazione dello snapshot: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function refreshPresetsList() {
  try {
    const res = await fetch('/presets/manifest.json')
    if (res.ok) {
      factoryPresets.value = await res.json()
    }
  } catch (e) {
    console.warn('Errore caricamento factory presets manifest:', e)
  }
  try {
    userPresets.value = await loadUserPresets()
  } catch (e) {
    console.error('Errore caricamento user presets:', e)
  }
}

async function handlePresetSelect(value: string) {
  if (!value) {
    store.activePresetId = ''
    store.activePresetName = ''
    return
  }

  const ctx = engine.getContext()

  if (value.startsWith('factory:')) {
    const id = value.replace('factory:', '')
    const preset = factoryPresets.value.find(p => p.id === id)
    if (!preset) return
    if (confirm(`Caricare il Factory Preset "${preset.name}"? Questo sovrascriverà il tuo progetto corrente.`)) {
      try {
        const res = await fetch(`/presets/${preset.fileName}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        const snapshot = parseProjectSnapshot(text)
        await store.importProjectSnapshot(snapshot, ctx)
        store.activePresetId = value
        store.activePresetName = preset.name
      } catch (err) {
        alert(`Errore nel caricamento del preset: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } else if (value.startsWith('user:')) {
    const id = value.replace('user:', '')
    const preset = userPresets.value.find(p => p.id === id)
    if (!preset) return
    if (confirm(`Caricare il preset "${preset.name}"? Questo sovrascriverà il tuo progetto corrente.`)) {
      try {
        await store.importProjectSnapshot(preset.snapshot, ctx)
        store.activePresetId = value
        store.activePresetName = preset.name
      } catch (err) {
        alert(`Errore nel caricamento del preset: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}

async function handleQuickSave() {
  if (!store.activePresetId || !store.activePresetId.startsWith('user:')) {
    await handleSaveAs()
    return
  }

  const id = store.activePresetId.replace('user:', '')
  const existing = userPresets.value.find(p => p.id === id)
  const name = existing ? existing.name : 'Mio Preset'

  try {
    const snapshot = buildProjectSnapshot(
      store.slots,
      store.settings,
      store.activeSourceId,
      store.sourceBuffers,
      store.bufferMeta
    )

    await saveUserPreset({
      id,
      name,
      createdAt: Date.now(),
      snapshot
    })

    await refreshPresetsList()
    alert(`Preset "${name}" sovrascritto e salvato correttamente!`)
  } catch (err) {
    alert(`Errore durante il salvataggio rapido: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function handleSaveAs() {
  const name = prompt("Inserisci il nome per il nuovo preset:")
  if (!name || !name.trim()) return

  try {
    const snapshot = buildProjectSnapshot(
      store.slots,
      store.settings,
      store.activeSourceId,
      store.sourceBuffers,
      store.bufferMeta
    )

    const newId = uuidv4()
    await saveUserPreset({
      id: newId,
      name: name.trim(),
      createdAt: Date.now(),
      snapshot
    })

    await refreshPresetsList()
    store.activePresetId = `user:${newId}`
    store.activePresetName = name.trim()
    alert(`Preset "${name}" salvato con successo!`)
  } catch (err) {
    alert(`Errore durante il salvataggio: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function handleDeleteCurrent() {
  if (!store.activePresetId || !store.activePresetId.startsWith('user:')) return

  const id = store.activePresetId.replace('user:', '')
  const name = store.activePresetName || 'questo preset'

  if (confirm(`Sei sicuro di voler eliminare permanentemente il preset "${name}"? questa operazione è irreversibile.`)) {
    try {
      await deleteUserPreset(id)
      await refreshPresetsList()
      store.activePresetId = ''
      store.activePresetName = ''
      alert(`Preset "${name}" eliminato con successo.`)
    } catch (err) {
      alert(`Errore nell'eliminazione del preset: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

onMounted(async () => {
  // Controlla l'autorizzazione salvata in localStorage
  const cachedHash = localStorage.getItem('po_companion_auth_hash')
  const CORRECT_HASH = 'eb4ea9f4ce7e68df84f44c72b9649df8e6a2a7b0e738dd622211c3f907b40773'
  if (cachedHash === CORRECT_HASH) {
    isAuthorized.value = true
  }

  const ctx = engine.getContext()
  await store.loadFromDB(ctx)
  await refreshPresetsList()
})
</script>

<template>
  <PasswordGate v-if="!isAuthorized" @authorized="isAuthorized = true" />
  <div v-else class="app">
    <!-- Header -->
    <AppHeader
      :isGenerating="isGenerating"
      :factoryPresets="factoryPresets"
      :userPresets="userPresets"
      @generate="generateStream"
      @export="exportWAV"
      @open-presets="showPresetsModal = true"
      @select-preset="handlePresetSelect"
      @quick-save="handleQuickSave"
      @save-as="handleSaveAs"
      @delete-current="handleDeleteCurrent"
      @open-guide="showGuideModal = true"
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

                <div class="setting-item">
                  <label class="setting-label">Sync Clock (Canale L)</label>
                  <select
                    class="input-select"
                    :value="store.settings.syncEnabled ? 'on' : 'off'"
                    @change="store.updateSettings({ syncEnabled: ($event.target as HTMLSelectElement).value === 'on' })"
                  >
                    <option value="off">Disabilitato (Dual Mono)</option>
                    <option value="on">Abilitato (L=Clock, R=Audio)</option>
                  </select>
                </div>

                <div class="setting-item" v-if="store.settings.syncEnabled">
                  <label class="setting-label">BPM Sync Clock</label>
                  <div class="setting-control">
                    <input
                      type="range"
                      min="60" max="220" step="1"
                      :value="store.settings.syncBpm"
                      @input="store.updateSettings({ syncBpm: +($event.target as HTMLInputElement).value })"
                    />
                    <span class="setting-value">{{ store.settings.syncBpm }} BPM</span>
                  </div>
                </div>

                <div class="setting-item">
                  <label class="setting-label">Simulatore PO-33 (Preview)</label>
                  <select
                    class="input-select"
                    :value="store.settings.po33Simulation ? 'on' : 'off'"
                    @change="store.updateSettings({ po33Simulation: ($event.target as HTMLSelectElement).value === 'on' })"
                  >
                    <option value="off">Disabilitato (Qualità CD)</option>
                    <option value="on">Abilitato (23kHz, 8-bit µ-law)</option>
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

    <!-- Presets & Import Modal -->
    <PresetsModal
      :isOpen="showPresetsModal"
      @close="showPresetsModal = false"
      @import-snapshot="importProject"
    />

    <!-- Quick Guide Modal -->
    <GuideModal
      :isOpen="showGuideModal"
      @close="showGuideModal = false"
    />
  </div>
</template>

<style scoped>
</style>
