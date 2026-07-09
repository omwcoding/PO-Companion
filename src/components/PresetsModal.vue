<template>
  <transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content preset-modal">
        <!-- Header -->
        <div class="modal-header">
          <h2 class="modal-title">📂 Gestione Progetti & Preset</h2>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <!-- Salva progetto corrente -->
          <div class="save-current-section">
            <h3 class="section-title">💾 Salva Preset Locale</h3>
            <div class="save-control">
              <input
                type="text"
                v-model="newPresetName"
                placeholder="Nome del preset (es. Amen Break Kit)"
                class="input-text preset-name-input"
                @keyup.enter="saveCurrentAsPreset"
              />
              <button
                class="btn-save"
                :disabled="!newPresetName.trim() || !store.activeSourceId"
                @click="saveCurrentAsPreset"
              >
                Salva Preset
              </button>
            </div>
            <p v-if="!store.activeSourceId" class="help-text">
              Carica almeno un file audio per salvare un preset.
            </p>
          </div>

          <!-- Presets Columns -->
          <div class="preset-columns">
            <!-- Column 1: Factory Presets -->
            <div class="preset-column">
              <h3 class="column-title">📁 Factory Presets</h3>
              <div class="presets-list">
                <div v-if="isLoadingFactory" class="loading-state">
                  Caricamento factory presets...
                </div>
                <div v-else-if="factoryPresets.length === 0" class="empty-state">
                  Nessun preset di fabbrica trovato.
                </div>
                <div
                  v-else
                  v-for="preset in factoryPresets"
                  :key="preset.id"
                  class="preset-item"
                  @click="loadFactoryPreset(preset)"
                >
                  <div class="preset-info">
                    <div class="preset-name">{{ preset.name }}</div>
                    <div class="preset-desc" :title="preset.description">{{ preset.description }}</div>
                  </div>
                  <span class="load-badge">Carica</span>
                </div>
              </div>
            </div>

            <!-- Column 2: User Presets -->
            <div class="preset-column">
              <h3 class="column-title">💾 I Miei Preset (IndexedDB)</h3>
              <div class="presets-list">
                <div v-if="isLoadingUser" class="loading-state">
                  Caricamento i miei preset...
                </div>
                <div v-else-if="userPresets.length === 0" class="empty-state">
                  Nessun preset salvato in locale.
                </div>
                <div
                  v-else
                  v-for="preset in userPresets"
                  :key="preset.id"
                  class="preset-item"
                >
                  <div class="preset-info" @click="loadUserPreset(preset)">
                    <div class="preset-name">{{ preset.name }}</div>
                    <div class="preset-desc">
                      Creato il {{ formatDate(preset.createdAt) }}
                    </div>
                  </div>
                  <div class="preset-actions">
                    <button
                      class="btn-delete-preset"
                      @click.stop="deletePreset(preset.id, preset.name)"
                      title="Elimina preset"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-left-actions">
            <button class="footer-btn btn-import-file" @click="triggerFileInput">
              ➕ Carica File JSON Esterno
            </button>
            <button
              class="footer-btn btn-export-file"
              :disabled="!store.activeSourceId"
              @click="exportJSONFile"
              title="Esporta il progetto corrente come file JSON da condividere o salvare come Factory Preset"
            >
              📤 Esporta JSON Esterno
            </button>
          </div>
          <input
            type="file"
            ref="fileInputRef"
            style="display: none"
            accept=".json"
            @change="importJSONFile"
          />
          <button class="footer-btn btn-close" @click="$emit('close')">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSampleStore } from '@/stores/useSampleStore'
import {
  saveUserPreset,
  loadUserPresets,
  deleteUserPreset,
  type UserPreset
} from '@/services/db'
import { parseProjectSnapshot, buildProjectSnapshot, exportProjectSnapshot } from '@/services/projectSnapshot'
import { v4 as uuidv4 } from 'uuid'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'import-snapshot', snapshot: any): void
}>()

const store = useSampleStore()

const newPresetName = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const factoryPresets = ref<{ id: string; name: string; fileName: string; description: string }[]>([])
const userPresets = ref<UserPreset[]>([])

const isLoadingFactory = ref(false)
const isLoadingUser = ref(false)

// Aggiorna la lista quando si apre il modal
watch(() => props.isOpen, (open) => {
  if (open) {
    newPresetName.value = ''
    fetchFactoryPresets()
    fetchUserPresets()
  }
})

async function fetchFactoryPresets() {
  isLoadingFactory.value = true
  try {
    const res = await fetch('/presets/manifest.json')
    if (res.ok) {
      factoryPresets.value = await res.json()
    }
  } catch (err) {
    console.warn('Errore nel caricare il manifest dei factory presets:', err)
  } finally {
    isLoadingFactory.value = false
  }
}

async function fetchUserPresets() {
  isLoadingUser.value = true
  try {
    userPresets.value = await loadUserPresets()
  } catch (err) {
    console.error('Errore nel caricare i preset utente:', err)
  } finally {
    isLoadingUser.value = false
  }
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function importJSONFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const text = event.target?.result as string
      const snapshot = parseProjectSnapshot(text)
      emit('import-snapshot', snapshot)
      emit('close')
    } catch (err) {
      alert(`Errore nell'importazione: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      target.value = ''
    }
  }
  reader.readAsText(file)
}

function exportJSONFile() {
  exportProjectSnapshot(
    store.slots,
    store.settings,
    store.activeSourceId,
    store.sourceBuffers,
    store.bufferMeta
  )
}

async function loadFactoryPreset(preset: any) {
  if (!confirm(`Caricare il Factory Preset "${preset.name}"? Questo sovrascriverà il tuo progetto corrente.`)) {
    return
  }

  try {
    const res = await fetch(`/presets/${preset.fileName}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const snapshot = parseProjectSnapshot(text)
    emit('import-snapshot', snapshot)
    emit('close')
  } catch (err) {
    alert(`Impossibile caricare il Factory Preset: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function loadUserPreset(preset: UserPreset) {
  if (!confirm(`Caricare il preset "${preset.name}"? Questo sovrascriverà il tuo progetto corrente.`)) {
    return
  }
  emit('import-snapshot', preset.snapshot)
  emit('close')
}

async function deletePreset(id: string, name: string) {
  if (!confirm(`Sei sicuro di voler eliminare il preset "${name}"? Questa azione è irreversibile.`)) {
    return
  }

  try {
    await deleteUserPreset(id)
    await fetchUserPresets()
  } catch (err) {
    alert(`Errore nell'eliminazione: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function saveCurrentAsPreset() {
  const name = newPresetName.value.trim()
  if (!name || !store.activeSourceId) return

  try {
    const snapshot = buildProjectSnapshot(
      store.slots,
      store.settings,
      store.activeSourceId,
      store.sourceBuffers,
      store.bufferMeta
    )

    const newPreset: UserPreset = {
      id: uuidv4(),
      name,
      createdAt: Date.now(),
      snapshot,
    }

    await saveUserPreset(newPreset)
    newPresetName.value = ''
    await fetchUserPresets()
    alert(`Preset "${name}" salvato con successo!`)
  } catch (err) {
    alert(`Errore durante il salvataggio del preset: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  z-index: 1100;
  padding: 16px;
}

.preset-modal {
  background: rgba(26, 26, 38, 0.85);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  border-top: 4px solid #FF6B2B;
  border-radius: 16px;
  width: 100%;
  max-width: 680px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6),
              inset 0 1px 1px rgba(255, 255, 255, 0.1);
  overflow: hidden;
  backdrop-filter: blur(20px);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  font-size: 18px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  gap: 10px;
}

.footer-btn {
  font-size: 11px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.save-current-section {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 11px;
  text-transform: uppercase;
  color: #FF6B2B;
  margin: 0 0 10px 0;
  letter-spacing: 0.8px;
  font-weight: 700;
}

.save-control {
  display: flex;
  gap: 10px;
}

.preset-name-input {
  flex-grow: 1;
  background: rgba(0, 0, 0, 0.25);
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: white;
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}

.preset-name-input:focus {
  border-color: #FF6B2B;
}

.btn-save {
  background: #FF6B2B;
  border: none;
  border-radius: 6px;
  color: white;
  padding: 8px 16px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.btn-save:hover:not(:disabled) {
  background: #FF8A50;
  box-shadow: 0 0 8px rgba(255, 107, 43, 0.3);
}

.btn-save:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.preset-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.preset-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.column-title {
  font-size: 11px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 8px 0;
  letter-spacing: 0.8px;
  font-weight: 700;
}

.presets-list {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  height: 240px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.preset-info {
  flex-grow: 1;
  min-width: 0;
  padding-right: 8px;
}

.preset-name {
  font-size: 13px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-desc {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.load-badge {
  font-size: 8px;
  font-weight: 700;
  background: rgba(0, 229, 255, 0.1);
  border: 1px solid rgba(0, 229, 255, 0.25);
  color: #00E5FF;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.preset-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-delete-preset {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.btn-delete-preset:hover {
  opacity: 1;
  background: rgba(255, 82, 82, 0.12);
}

.footer-left-actions {
  display: flex;
  gap: 8px;
}

.btn-import-file {
  background: rgba(0, 229, 255, 0.1);
  border: 1.5px solid rgba(0, 229, 255, 0.25);
  color: #00E5FF;
}

.btn-import-file:hover {
  background: #00E5FF;
  color: black;
  border-color: #00E5FF;
}

.btn-export-file {
  background: rgba(255, 107, 43, 0.1);
  border: 1.5px solid rgba(255, 107, 43, 0.25);
  color: #FF6B2B;
}

.btn-export-file:hover:not(:disabled) {
  background: #FF6B2B;
  color: white;
  border-color: #FF6B2B;
}

.btn-export-file:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-close {
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.help-text {
  font-size: 11px;
  color: rgba(255, 82, 82, 0.8);
  margin: 6px 0 0 0;
}

.loading-state, .empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  padding: 20px;
}

@media (max-width: 580px) {
  .preset-columns {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .presets-list {
    height: 160px;
  }
}
</style>
