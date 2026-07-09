const DB_NAME = 'POCompanionDB'
const DB_VERSION = 1

export interface DBStoredFile {
  id: string
  fileName: string
  pcmData: Float32Array
  duration: number
  sampleRate: number
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
    // Usiamo il valore grezzo (essendo un oggetto JSON semplice è pienamente serializzabile in IndexedDB)
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
 * Cancella tutti i dati in IndexedDB (usato per il reset completo).
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
