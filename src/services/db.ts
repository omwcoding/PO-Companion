const DB_NAME = 'POCompanionDB'
const DB_VERSION = 2

export interface DBStoredFile {
  id: string
  fileName: string
  pcmData: Float32Array
  duration: number
  sampleRate: number
}

export interface UserPreset {
  id: string
  name: string
  createdAt: number
  snapshot: any // ProjectSnapshot (JSON format)
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('audio_files')) {
        db.createObjectStore('audio_files', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('project_state')) {
        db.createObjectStore('project_state')
      }
      if (!db.objectStoreNames.contains('user_presets')) {
        db.createObjectStore('user_presets', { keyPath: 'id' })
      }
    }
  })
}

/**
 * Salva un file audio (PCM + metadati) in IndexedDB.
 */
export async function saveAudioFile(file: DBStoredFile): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('audio_files', 'readwrite')
    const store = transaction.objectStore('audio_files')
    const request = store.put(file)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Rimuove un file audio da IndexedDB.
 */
export async function deleteAudioFile(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('audio_files', 'readwrite')
    const store = transaction.objectStore('audio_files')
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Carica tutti i file audio registrati in IndexedDB.
 */
export async function loadAudioFiles(): Promise<DBStoredFile[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('audio_files', 'readonly')
    const store = transaction.objectStore('audio_files')
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

/**
 * Salva un valore generico nello store di stato del progetto (es. slots, impostazioni).
 */
export async function saveProjectState(key: string, value: any): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('project_state', 'readwrite')
    const store = transaction.objectStore('project_state')
    const request = store.put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Recupera un valore dallo store di stato del progetto.
 */
export async function loadProjectState(key: string): Promise<any> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('project_state', 'readonly')
    const store = transaction.objectStore('project_state')
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Salva un preset creato dall'utente in IndexedDB.
 */
export async function saveUserPreset(preset: UserPreset): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_presets', 'readwrite')
    const store = transaction.objectStore('user_presets')
    const request = store.put(preset)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Elimina un preset salvato in IndexedDB.
 */
export async function deleteUserPreset(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_presets', 'readwrite')
    const store = transaction.objectStore('user_presets')
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Carica tutti i preset salvati dall'utente in IndexedDB.
 */
export async function loadUserPresets(): Promise<UserPreset[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_presets', 'readonly')
    const store = transaction.objectStore('user_presets')
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

/**
 * Cancella lo stato di lavoro corrente (audio e griglia) in IndexedDB, preservando i preset dell'utente.
 */
export async function clearDB(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['audio_files', 'project_state'], 'readwrite')
    transaction.objectStore('audio_files').clear()
    transaction.objectStore('project_state').clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
