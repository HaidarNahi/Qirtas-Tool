import type { Doc } from './types'

/**
 * Teachers type long exams on phones that run out of battery, lose signal, or
 * get a stray reload. Every edit is mirrored to two stores:
 *
 *  - localStorage — synchronous, so it can still be written from `pagehide`,
 *    the only event a closing tab reliably gives us.
 *  - IndexedDB — survives more aggressive cleanup, written asynchronously.
 *
 * On load the newer of the two wins, with a rolling backup behind them in case
 * the newest copy is somehow unreadable.
 */

const KEY = 'qirtas:doc:v1'
const BACKUP_KEY = 'qirtas:doc:v1:backup'
const PREFS_KEY = 'qirtas:prefs:v1'
const LEGACY_KEYS = ['test-builder:doc:v1']

const DB_NAME = 'qirtas'
const STORE = 'sheets'
const RECORD_ID = 'current'

export interface Snapshot {
  doc: Doc
  savedAt: number
}

function isSnapshot(value: unknown): value is Snapshot {
  const snapshot = value as Snapshot
  return !!snapshot && typeof snapshot.savedAt === 'number' && !!snapshot.doc && Array.isArray(snapshot.doc.questions)
}

/* ------------------------------------------------------------ IndexedDB */

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, 1)
    } catch {
      return resolve(null)
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return dbPromise
}

async function idbRead(): Promise<Snapshot | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD_ID)
      request.onsuccess = () => resolve(isSnapshot(request.result) ? request.result : null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbWrite(snapshot: Snapshot): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(snapshot, RECORD_ID)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

/* ---------------------------------------------------------- localStorage */

function readLocal(key: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (isSnapshot(parsed)) return parsed
    // Documents saved before snapshots carried a timestamp.
    if (parsed && Array.isArray(parsed.questions)) return { doc: parsed as Doc, savedAt: 0 }
    return null
  } catch {
    return null
  }
}

/**
 * The backup is refreshed on a timer rather than on every save. Copying it each
 * time meant reading and re-writing the whole sheet twice per keystroke-pause,
 * synchronously, on the main thread — on the cheap Android phones this is built
 * for that is a stutter while typing, and a backup a minute old is just as good
 * at its actual job.
 */
const BACKUP_INTERVAL_MS = 60000
let lastBackupAt = 0

function writeLocal(snapshot: Snapshot): boolean {
  try {
    const now = Date.now()
    if (now - lastBackupAt > BACKUP_INTERVAL_MS) {
      const previous = localStorage.getItem(KEY)
      if (previous) localStorage.setItem(BACKUP_KEY, previous)
      lastBackupAt = now
    }
    localStorage.setItem(KEY, JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

/* ---------------------------------------------------------------- public */

/** Synchronous save — the only kind that survives a closing tab. */
export function saveNow(doc: Doc): { ok: boolean; snapshot: Snapshot } {
  const snapshot: Snapshot = { doc, savedAt: Date.now() }
  const ok = writeLocal(snapshot)
  void idbWrite(snapshot)
  return { ok, snapshot }
}

export async function loadLatest(): Promise<{ snapshot: Snapshot; recovered: boolean } | null> {
  const candidates: { snapshot: Snapshot; recovered: boolean }[] = []

  const local = readLocal(KEY)
  if (local) candidates.push({ snapshot: local, recovered: false })

  const backup = readLocal(BACKUP_KEY)
  if (backup) candidates.push({ snapshot: backup, recovered: true })

  for (const legacy of LEGACY_KEYS) {
    const found = readLocal(legacy)
    if (found) candidates.push({ snapshot: found, recovered: false })
  }
  // Whatever they held has been read into the running document by now; leaving
  // them behind means re-reading them on every launch forever.
  if (local) {
    for (const legacy of LEGACY_KEYS) {
      try {
        localStorage.removeItem(legacy)
      } catch {
        /* nothing useful to do */
      }
    }
  }

  try {
    const stored = await idbRead()
    if (stored) candidates.push({ snapshot: stored, recovered: false })
  } catch {
    /* IndexedDB unavailable — localStorage still stands */
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.snapshot.savedAt - a.snapshot.savedAt)
  const best = candidates[0]
  // Only call it a recovery when the primary copy was genuinely unusable.
  return { snapshot: best.snapshot, recovered: best.recovered && !local }
}

/**
 * Asks the browser not to evict our data when the device runs low on space.
 * Granted silently on installed PWAs and on sites the user engages with.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export interface Prefs {
  /** Ids of questions the teacher has folded shut. */
  collapsed: string[]
  /** How many PDFs have been downloaded — used to time the rating nudge. */
  downloads: number
  rated: boolean
  ratePromptDismissed: boolean
  /** Spelling check. A device setting, not part of the sheet, so it lives here. */
  spellcheck: boolean
}

const defaultPrefs: Prefs = {
  collapsed: [],
  downloads: 0,
  rated: false,
  ratePromptDismissed: false,
  spellcheck: true,
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...defaultPrefs, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultPrefs
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}
