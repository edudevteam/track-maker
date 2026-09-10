/**
 * Models the user picked off their own disk, kept in this browser.
 *
 * Track Maker runs wholly client-side, so a model can reach it two ways: sitting
 * in `public/cars/` and named in that folder's manifest, which means it ships
 * with the app and everyone gets it, or picked from disk here, which means it
 * belongs to this browser and costs the project nothing. Big models want the
 * second: a 98MB car is a fine thing to drive and a terrible thing to make
 * everyone download.
 *
 * The bytes go in IndexedDB rather than localStorage — that holds strings, and
 * a model base64'd into one would be a third larger again and capped at a few
 * megabytes. They survive a reload and are cleared with the browser's site data.
 * They do not travel with a saved project: a `.tmproj` sent to someone else
 * arrives naming a car their browser has never seen, and falls back to the
 * placeholder block until they pick their own file.
 */

import type { VehicleFacing } from '../geometry/vehicle'

const DB_NAME = 'track-maker'
const DB_VERSION = 1
const STORE = 'cars'

export interface StoredCar {
  /** Unique, and what the project stores when this car is the one riding. */
  id: string
  name: string
  /** The name the file had, which is also what says how to read it. */
  file: string
  bytes: ArrayBuffer
  /**
   * Millimetres per unit of the file, worked out when it was added, so the real
   * vehicle size behind a scale preset survives without re-measuring.
   */
  mmPerUnit: number
  /** Whether that was worked out from the model or is only the fallback. */
  realFromFile: boolean
  /**
   * Which way the model faces in its own file, once someone has said. Absent
   * until then — and on records written before facing could be set — in which
   * case the format's own convention is used.
   */
  facing?: VehicleFacing
  addedAt: number
}

/** What a listing gives back — everything but the bytes, which stay unread. */
export type StoredCarInfo = Omit<StoredCar, 'bytes'> & { bytes: number }

/**
 * A browser with no IndexedDB, or one refusing it in a private window, is not an
 * error worth stopping for — it means no stored cars, and the reason is shown
 * rather than swallowed.
 */
export class CarStorageUnavailable extends Error {}

let db: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (db) return db
  db = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new CarStorageUnavailable('this browser has no storage for models'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(new CarStorageUnavailable(req.error?.message ?? 'models cannot be stored in this browser'))
    // A private window can leave the request hanging rather than failing it.
    req.onblocked = () => reject(new CarStorageUnavailable('another tab is holding the model store open'))
  })
  // A failed open is forgotten, so a later attempt tries again rather than
  // being stuck with the first refusal for the life of the page.
  db.catch(() => {
    db = null
  })
  return db
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (handle) =>
      new Promise<T>((resolve, reject) => {
        const tx = handle.transaction(STORE, mode)
        const req = work(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('the model store refused that'))
        tx.onabort = () =>
          reject(
            tx.error?.name === 'QuotaExceededError'
              ? new Error('there is not enough room left in this browser for a model that size')
              : (tx.error ?? new Error('the model store refused that')),
          )
      }),
  )
}

/** Every stored car, newest first, without reading a single model's bytes. */
export async function listStoredCars(): Promise<StoredCarInfo[]> {
  const all = await run<StoredCar[]>('readonly', (s) => s.getAll() as IDBRequest<StoredCar[]>)
  return all
    .map(({ bytes, ...rest }) => ({ ...rest, bytes: bytes.byteLength }))
    .sort((a, b) => b.addedAt - a.addedAt)
}

export async function readStoredCar(id: string): Promise<ArrayBuffer> {
  const car = await run<StoredCar | undefined>('readonly', (s) => s.get(id) as IDBRequest<StoredCar | undefined>)
  if (!car) throw new Error('that model is no longer stored in this browser')
  return car.bytes
}

export function putStoredCar(car: StoredCar): Promise<unknown> {
  return run('readwrite', (s) => s.put(car))
}

/**
 * Change what is recorded about a stored model without rewriting its bytes, so
 * fixing which way a car faces does not mean handling a hundred megabytes again.
 */
export async function patchStoredCar(id: string, patch: Partial<Omit<StoredCar, 'id' | 'bytes'>>): Promise<void> {
  const car = await run<StoredCar | undefined>('readonly', (s) => s.get(id) as IDBRequest<StoredCar | undefined>)
  if (!car) return
  await run('readwrite', (s) => s.put({ ...car, ...patch }))
}

export function deleteStoredCar(id: string): Promise<unknown> {
  return run('readwrite', (s) => s.delete(id))
}

/** An id no stored car and no manifest entry is already using. */
export function freeCarId(base: string, taken: Set<string>): string {
  const slug =
    base
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'car'
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) {
    const next = `${slug}-${n}`
    if (!taken.has(next)) return next
  }
}

/** `muscle_car.glb` reads as `Muscle Car`. */
export function nameFromFile(file: string): string {
  const stem = file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return (
    stem
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ') || file
  )
}
