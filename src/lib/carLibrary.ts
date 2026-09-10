import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import {
  AXES,
  axisOf,
  facingIsValid,
  seatVehicleObject,
  vehicleClumps,
  vehicleObjectSize,
  type Axis,
  type VehicleFacing,
} from '../geometry/vehicle'
import { REFERENCE_VEHICLE, guessMmPerUnit, sizeAtScale } from './carScales'
import {
  CarStorageUnavailable,
  deleteStoredCar,
  freeCarId,
  listStoredCars,
  nameFromFile,
  patchStoredCar,
  putStoredCar,
  readStoredCar,
} from './carStorage'
import type { VehicleSize } from '../types'

/**
 * The vehicle library — what can ride the track.
 *
 * Three kinds of car reach it. Two are built in and need no file: the Die Cast
 * shape, and a plain Block that is exactly the reference vehicle, so it shows
 * how big a car at a given scale actually is. The rest are models — either
 * shipped in `public/cars/` and listed in that folder's `cars.json`, or picked
 * off the user's own disk and kept in this browser.
 *
 * The manifest folder has to be inside the app: this runs wholly in the browser,
 * so a manifest cannot name a path elsewhere on disk. Picking a file is how a
 * model that is too big to ship — and most car models are — gets on the track.
 *
 * A loaded model is turned so it faces down the track (+X) with up as +Y, seated
 * on the road and centred across it. Its size is then a pure scale, which is why
 * the size fields in Settings ▸ Vehicle can be typed over freely and why a model
 * exported at any scale still rides correctly.
 *
 * Colour comes from the file wherever the file has any — GLB, 3MF and an OBJ
 * with its MTL all carry materials, and those are used untouched. STL carries
 * none, so the manifest's `color` paints it.
 */

/** Where the manifest and the models live, under the app's base path. */
export const CARS_DIR = `${import.meta.env.BASE_URL}cars/`
export const CARS_MANIFEST = `${CARS_DIR}cars.json`

/** Millimetres per unit of a file exported in something other than mm. */
const UNIT_SCALE: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 }

/** What can be read, and what each format's own axes usually are. */
const FORMATS = {
  // No convention exists for either, so these keep the axes Track Maker started with.
  stl: { forward: '+X', up: '+Y', carriesColor: false },
  obj: { forward: '+X', up: '+Y', carriesColor: true },
  // glTF 2.0 fixes both: +Y up, and an asset faces +Z.
  glb: { forward: '+Z', up: '+Y', carriesColor: true },
  gltf: { forward: '+Z', up: '+Y', carriesColor: true },
  // 3MF is a print format, so it comes out of the slicer standing up in Z.
  '3mf': { forward: '+Y', up: '+Z', carriesColor: true },
} as const satisfies Record<string, { forward: Axis; up: Axis; carriesColor: boolean }>

export type CarFormat = keyof typeof FORMATS

export const FORMAT_LIST = Object.keys(FORMATS) as CarFormat[]

/** Each format's own axes and whether it carries colour — also what tooling reads. */
export const CAR_FORMATS = FORMATS

const formatOf = (file: string): CarFormat | null => {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  return ext in FORMATS ? (ext as CarFormat) : null
}

/** Which way a file of this kind usually faces, before anyone says otherwise. */
export function defaultFacingOf(format: CarFormat | null): VehicleFacing {
  const { forward, up } = FORMATS[format ?? 'glb']
  return { forward, up }
}

/** Put a facing on a spec, for a car whose direction has been corrected. */
export function withFacing(spec: CarModelSpec, facing: VehicleFacing | undefined): CarModelSpec {
  if (!facing || (facing.forward === spec.forward && facing.up === spec.up)) return spec
  return { ...spec, forward: facing.forward, up: facing.up }
}

/** Where a car came from — the app itself, the manifest, or this browser. */
export type CarSource = 'builtIn' | 'manifest' | 'stored'

export interface CarModelSpec {
  id: string
  name: string
  /** File name. Empty for a built-in car. */
  file: string
  /** Where the mesh is read from. Empty for a built-in or a stored car. */
  url: string
  /** Which reader the file goes through. Null for a built-in car. */
  format: CarFormat | null
  /** Size the car starts at, mm. Null uses the file's own size. */
  size: VehicleSize | null
  /** Which way the model faces, as the library has it — the file's own, or fixed. */
  forward: Axis
  up: Axis
  /**
   * What the facing would be with nothing said about it: the format's own
   * convention, or what a manifest entry declares. Resetting goes back to this.
   */
  defaultFacing: VehicleFacing
  /**
   * Millimetres per unit of the file. Null means the entry did not say, and the
   * model's own proportions are used to work it out when it is read.
   */
  mmPerUnit: number | null
  /** Body colour, for a file that carries none of its own — an STL. */
  color: string
  source: CarSource
  /** How much room the file takes in this browser, bytes. Stored cars only. */
  bytes: number
}

export const isBuiltIn = (spec: CarModelSpec): boolean => spec.source === 'builtIn'

/** A model ready to ride: oriented, seated, measured, and painted. */
export interface LoadedCar {
  /** A flat group of meshes at the identity, so the car's size is its scale. */
  object: THREE.Group
  /** The size it comes out at before any scaling, mm. */
  natural: VehicleSize
  /** Triangles in the model — worth showing, since nothing decimates it. */
  triangles: number
  /**
   * Separate objects the file was built from. A model in parts keeps them, each
   * where the file put it and in its own colour; this says how many arrived, so
   * a file that came in as one lump is obvious.
   */
  parts: number
  /**
   * Separate clumps those parts fall into. One means an assembled car; more
   * means parts standing apart from each other, which is what a print plate — or
   * a project file holding several plates — looks like once read.
   */
  clumps: number
  /** Whether the colours came from the file rather than from `cars.json`. */
  ownColors: boolean
  /** Millimetres per unit the model was actually read at. */
  mmPerUnit: number
  /**
   * Whether `natural` is a real vehicle's size rather than a number in whatever
   * units the file happened to use. Only then can a scale be worked out from it.
   */
  realFromFile: boolean
  /** Distinct materials the file brought. */
  materials: number
  /**
   * The materials Track Maker made because the file had none, so the manifest's
   * colour can be changed without re-reading the file.
   */
  painted: THREE.MeshStandardMaterial[]
}

/** The car that needs no files — the simple shape the preview has always used. */
export const BUILT_IN_CAR: CarModelSpec = {
  id: 'diecast',
  name: 'Die Cast',
  file: '',
  url: '',
  format: null,
  size: null,
  forward: '+X',
  up: '+Y',
  defaultFacing: { forward: '+X', up: '+Y' },
  mmPerUnit: 1,
  color: '#dc2626',
  source: 'builtIn',
  bytes: 0,
}

/**
 * A plain box exactly the size of the reference vehicle, so a scale can be seen
 * before there is a model to see it on. It is what a car that has not been
 * picked yet looks like, and what a project opened on a browser without the
 * stored model falls back to.
 */
export const BLOCK_CAR: CarModelSpec = {
  ...BUILT_IN_CAR,
  id: 'block',
  name: 'Block',
  // Starts at die-cast scale rather than at its own four-and-a-half metres.
  size: sizeAtScale(REFERENCE_VEHICLE, 64),
  color: '#64748b',
}

/** The ids the app keeps for itself, which a manifest entry cannot take. */
const RESERVED_IDS = new Set([BUILT_IN_CAR.id, BLOCK_CAR.id])

export const BUILT_IN_CARS: CarModelSpec[] = [BUILT_IN_CAR, BLOCK_CAR]

export interface CarLibrary {
  models: CarModelSpec[]
  /** Why the manifest could not be read at all, if it could not. */
  error: string | null
  /** Entries that were skipped, and why. */
  problems: string[]
  /** Why models cannot be kept in this browser, if they cannot. */
  storageError: string | null
}

export const EMPTY_LIBRARY: CarLibrary = {
  models: BUILT_IN_CARS,
  error: null,
  problems: [],
  storageError: null,
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function axis(v: unknown, fallback: Axis): Axis {
  return typeof v === 'string' && (AXES as readonly string[]).includes(v) ? (v as Axis) : fallback
}

/** Whether a file of this kind brings colour of its own. */
export const carriesColor = (format: CarFormat | null): boolean =>
  format !== null && FORMATS[format].carriesColor

/** The size fields, but only when all three are given — a partial size is no size. */
function readSize(v: Record<string, unknown>): VehicleSize | null {
  const length = positive(v.length)
  const width = positive(v.width)
  const height = positive(v.height)
  if (length === null || width === null || height === null) return null
  return { length, width, height }
}

/** Read one manifest entry, or say why it was skipped. */
function readEntry(v: unknown, index: number, taken: Set<string>): CarModelSpec | string {
  if (!isObj(v)) return `Entry ${index + 1} is not an object.`
  const id = typeof v.id === 'string' ? v.id.trim() : ''
  if (!id) return `Entry ${index + 1} has no "id".`
  if (RESERVED_IDS.has(id)) return `"${id}" is a built-in car's id — pick another.`
  if (taken.has(id)) return `Two entries share the id "${id}".`
  const file = typeof v.file === 'string' ? v.file.trim() : ''
  if (!file) return `"${id}" has no "file".`
  if (file.includes('/') || file.includes('\\')) {
    return `"${id}" names ${file} — models have to sit beside cars.json, not in a subfolder.`
  }
  const format = formatOf(file)
  if (!format) {
    const ext = file.split('.').pop()?.toLowerCase() ?? ''
    return `"${id}" is a .${ext} file; only ${FORMAT_LIST.map((f) => `.${f}`).join(', ')} can be read.`
  }

  // Each format has its own idea of which way is up, so an entry that says
  // nothing gets that format's convention rather than a single global guess.
  const forward = axis(v.forward, FORMATS[format].forward)
  const up = axis(v.up, FORMATS[format].up)
  if (!facingIsValid({ forward, up })) {
    return `"${id}" has forward and up on the same axis (${axisOf(forward)}).`
  }

  taken.add(id)
  return {
    id,
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim() : id,
    file,
    url: `${CARS_DIR}${encodeURIComponent(file)}`,
    format,
    size: readSize(v),
    forward,
    up,
    // What the entry declares is the file's own truth, so resetting comes back here.
    defaultFacing: { forward, up },
    mmPerUnit: readUnits(v.units),
    color: typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : BUILT_IN_CAR.color,
    source: 'manifest',
    bytes: 0,
  }
}

/**
 * What one unit of a file is worth in millimetres — a unit name, or a plain
 * number for a file on some other scale entirely, which is what an exporter that
 * bakes a scale into the root node produces. Nothing given means nothing stated,
 * and the model's own proportions are used to work it out instead.
 */
function readUnits(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  if (typeof v !== 'string') return null
  return UNIT_SCALE[v.toLowerCase()] ?? null
}

/**
 * Read `public/cars/cars.json`. A missing manifest is not an error — it means no
 * models have been added yet — but one that cannot be parsed is reported, since
 * silently showing only the built-in car would look like the file was ignored.
 */
export async function fetchCarLibrary(): Promise<CarLibrary> {
  const manifest = await readManifest()
  const stored = await readStored()
  return {
    models: [...BUILT_IN_CARS, ...manifest.models, ...stored.models],
    error: manifest.error,
    problems: manifest.problems,
    storageError: stored.error,
  }
}

/** The manifest's own entries — the cars that ship with the app. */
async function readManifest(): Promise<{ models: CarModelSpec[]; error: string | null; problems: string[] }> {
  const none = { models: [], error: null, problems: [] }
  let res: Response
  try {
    res = await fetch(CARS_MANIFEST, { cache: 'no-cache' })
  } catch {
    return { ...none, error: `Could not reach ${CARS_MANIFEST}.` }
  }
  if (res.status === 404) return none
  if (!res.ok) return { ...none, error: `${CARS_MANIFEST} returned ${res.status}.` }

  let raw: unknown
  try {
    raw = JSON.parse(await res.text())
  } catch {
    return { ...none, error: `${CARS_MANIFEST} is not valid JSON.` }
  }
  if (!isObj(raw) || !Array.isArray(raw.cars)) {
    return { ...none, error: `${CARS_MANIFEST} needs a "cars" array.` }
  }

  const models: CarModelSpec[] = []
  const problems: string[] = []
  const taken = new Set<string>()
  raw.cars.forEach((entry, i) => {
    const read = readEntry(entry, i, taken)
    if (typeof read === 'string') {
      problems.push(read)
      return
    }
    models.push(read)
  })
  return { models, error: null, problems }
}

/** The models this browser is holding. Never fatal — a browser may hold none. */
async function readStored(): Promise<{ models: CarModelSpec[]; error: string | null }> {
  // Models picked when the store would not take them are listed all the same:
  // they drive for as long as the page is open, which is what was promised.
  const held = [...sessionOnly.values()]
  try {
    const cars = await listStoredCars()
    return {
      models: [
        ...held,
        ...cars.map((car) => {
          const defaultFacing = defaultFacingOf(formatOf(car.file))
          // Whichever way round it was last set outlives the session.
          const facing = car.facing && facingIsValid(car.facing) ? car.facing : defaultFacing
          return {
            id: car.id,
            name: car.name,
            file: car.file,
            url: '',
            format: formatOf(car.file),
            size: null,
            forward: facing.forward,
            up: facing.up,
            defaultFacing,
            mmPerUnit: car.realFromFile ? car.mmPerUnit : null,
            color: BUILT_IN_CAR.color,
            source: 'stored' as const,
            bytes: car.bytes,
          }
        }),
      ],
      error: null,
    }
  } catch (err) {
    return {
      models: held,
      error:
        err instanceof CarStorageUnavailable
          ? `Models cannot be kept in this browser — ${err.message}. Picking one will still work for as long as the page is open.`
          : null,
    }
  }
}

function triangleCount(group: THREE.Object3D): number {
  let tris = 0
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const g = mesh.geometry
    const count = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)
    tris += Math.floor(count / 3)
  })
  return tris
}

/** Every distinct material hanging off a tree, multi-material meshes included. */
function materialsOf(group: THREE.Object3D): THREE.Material[] {
  const seen = new Set<THREE.Material>()
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m) seen.add(m)
    }
  })
  return [...seen]
}

/**
 * The MTL an OBJ asks for, if it asks for one and it is there. A missing MTL is
 * not an error — the OBJ is simply painted the manifest colour instead, which is
 * what an OBJ exported without materials wants anyway.
 */
async function objMaterials(text: string): Promise<MTLLoader.MaterialCreator | null> {
  const named = /^\s*mtllib\s+(.+)$/m.exec(text)?.[1]?.trim()
  if (!named) return null
  try {
    const res = await fetch(`${CARS_DIR}${encodeURIComponent(named)}`)
    if (!res.ok) return null
    const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js')
    // The path is where the MTL's own texture references are resolved from.
    const materials = new MTLLoader().setResourcePath(CARS_DIR).parse(await res.text(), CARS_DIR)
    materials.preload()
    return materials
  } catch {
    return null
  }
}

/**
 * Read the file into a tree of meshes, and say whether it brought its own
 * colour. Each reader is fetched only when a car of that kind is actually
 * loaded, so a project with no models pays for none of them.
 */
/**
 * Bytes waiting to be read, however they arrived. A `Response` already looks
 * like this, so a shipped model needs no wrapping; one picked off disk gets
 * the same shape put around it.
 */
interface CarBytes {
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

const bytesOf = (buffer: ArrayBuffer): CarBytes => ({
  arrayBuffer: async () => buffer,
  text: async () => new TextDecoder().decode(buffer),
})

async function parseCar(spec: CarModelSpec, res: CarBytes): Promise<{ root: THREE.Object3D; colored: boolean }> {
  switch (spec.format) {
    case 'stl': {
      // STL is triangles and nothing else, so it always takes the manifest colour.
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
      return { root: new THREE.Mesh(new STLLoader().parse(await res.arrayBuffer())), colored: false }
    }
    case 'obj': {
      const text = await res.text()
      const materials = await objMaterials(text)
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
      const loader = new OBJLoader()
      if (materials) loader.setMaterials(materials)
      return { root: loader.parse(text), colored: !!materials }
    }
    case 'glb':
    case 'gltf': {
      // A .gltf can point at a .bin and at textures beside it, so the folder is
      // handed over as the base for those.
      const data = spec.format === 'glb' ? await res.arrayBuffer() : await res.text()
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const gltf = await new GLTFLoader().parseAsync(data, CARS_DIR)
      return { root: gltf.scene, colored: true }
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js')
      return { root: new ThreeMFLoader().parse(await res.arrayBuffer()), colored: true }
    }
    default:
      throw new Error(`${spec.file} cannot be read`)
  }
}

/** The file's bytes, from the cars folder or from this browser's own store. */
async function carBytes(spec: CarModelSpec): Promise<CarBytes> {
  if (spec.source === 'stored') {
    const held = sessionBytes.get(spec.id)
    return bytesOf(held ?? (await readStoredCar(spec.id)))
  }
  const res = await fetch(spec.url)
  if (!res.ok) {
    throw new Error(res.status === 404 ? `${spec.file} is not in the cars folder` : `${spec.file} returned ${res.status}`)
  }
  return res
}

async function readCar(spec: CarModelSpec): Promise<LoadedCar> {
  const { root, colored } = await parseCar(spec, await carBytes(spec))

  // A file that carries no colour is given one material of ours, so the
  // manifest's colour can be changed later without re-reading the file.
  const painted: THREE.MeshStandardMaterial[] = []
  if (!colored) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color),
      metalness: 0.35,
      roughness: 0.35,
    })
    painted.push(material)
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) mesh.material = material
    })
  }

  // An entry that named its units is taken at its word. One that did not gets
  // the units read off the model, since a car is only ever a few metres long
  // and the candidates are orders of magnitude apart. Failing that the file's
  // numbers are treated as millimetres, as they always have been — the car will
  // be the wrong size, but it is a size, and it can be typed over.
  const stated = spec.mmPerUnit !== null
  const guessed = stated ? null : guessMmPerUnit(largestExtent(root))
  const mmPerUnit = spec.mmPerUnit ?? guessed ?? 1

  const object = seatVehicleObject(root, spec.forward, spec.up, mmPerUnit)
  const triangles = triangleCount(object)
  if (!triangles) throw new Error(`${spec.file} holds no geometry`)
  return {
    object,
    natural: vehicleObjectSize(object),
    triangles,
    parts: object.children.length,
    clumps: vehicleClumps(object),
    ownColors: colored,
    materials: materialsOf(object).length,
    mmPerUnit,
    realFromFile: stated || guessed !== null,
    painted,
  }
}

/** The longest side of a tree's box, which on a vehicle is its length. */
function largestExtent(root: THREE.Object3D): number {
  root.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  return Math.max(size.x, size.y, size.z)
}

/**
 * What a load is filed under. A stored car has no URL of its own, so its id is
 * what tells one apart from another. Which way round it faces is part of the
 * key because seating bakes the rotation into the geometry — turning a car
 * around is a different mesh, not a different transform on the same one.
 */
const loadKey = (spec: CarModelSpec): string =>
  `${spec.source === 'stored' ? `stored:${spec.id}` : spec.url}|${spec.forward}|${spec.up}`

/** One load per file, however many places ask for it. */
const loads = new Map<string, Promise<LoadedCar>>()

export function loadCarModel(spec: CarModelSpec): Promise<LoadedCar> {
  const key = loadKey(spec)
  const hit = loads.get(key)
  if (hit) return hit
  // A failed load is forgotten, so fixing the file and reloading the library retries it.
  const load = readCar(spec).catch((err) => {
    loads.delete(key)
    throw err
  })
  loads.set(key, load)
  return load
}

/** Release a loaded model's geometry, materials and any textures they hold. */
function disposeCar(car: LoadedCar): void {
  car.object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
  })
  for (const material of materialsOf(car.object)) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) value.dispose()
    }
    material.dispose()
  }
}

/** Drop every cached model, so Reload picks up a file that changed on disk. */
export function forgetCarModels(): void {
  for (const load of loads.values()) load.then(disposeCar).catch(() => {})
  loads.clear()
}

/**
 * Drop one car's mesh. Turning a car around re-seats it, which means a new mesh;
 * this releases the one facing the old way rather than leaving it in the cache.
 */
export function forgetCarModel(spec: CarModelSpec): void {
  const key = loadKey(spec)
  loads.get(key)?.then(disposeCar).catch(() => {})
  loads.delete(key)
}

/**
 * Remember which way a stored model faces, so the correction outlives the
 * project it was made in. Only its record is touched — the bytes stay put.
 */
export async function saveStoredCarFacing(id: string, facing: VehicleFacing | null): Promise<void> {
  const held = sessionOnly.get(id)
  if (held) {
    const fallback = facing ?? defaultFacingOf(held.format)
    sessionOnly.set(id, { ...held, forward: fallback.forward, up: fallback.up })
  }
  try {
    await patchStoredCar(id, { facing: facing ?? undefined })
  } catch {
    // A browser that will not store still turns the car around for this session.
  }
}

/**
 * Models picked this session, held in memory as well as in the browser's store.
 *
 * This is what makes a browser that refuses storage still usable: the file was
 * read, so it can be driven now even though it will be gone on reload. It also
 * saves reading a just-added model straight back out of the store.
 */
const sessionBytes = new Map<string, ArrayBuffer>()
const sessionOnly = new Map<string, CarModelSpec>()

/** Formats that arrive as one self-contained file, which is all a picker gives. */
export const PICKABLE_FORMATS: CarFormat[] = ['glb', '3mf', 'stl', 'obj']

export interface StoredCarResult {
  spec: CarModelSpec
  /** Set when the model is only good for this session, and why. */
  temporary: string | null
}

/**
 * Take a file the user picked and make a car of it.
 *
 * The file is read before it is stored, so one that cannot be parsed is refused
 * rather than filling the browser's store with something that will never drive.
 * Reading it also settles its units, which is what a scale is measured against.
 */
export async function storeCarFile(file: File, taken: Set<string>): Promise<StoredCarResult> {
  const format = formatOf(file.name)
  if (!format) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    throw new Error(
      `A .${ext} file cannot be read. Pick a ${PICKABLE_FORMATS.map((f) => `.${f}`).join(', ')} file.`,
    )
  }
  if (format === 'gltf') {
    throw new Error('A .gltf comes with a .bin and its textures beside it, which a picker cannot take. Export .glb instead — it is the same thing in one file.')
  }

  const buffer = await file.arrayBuffer()
  const id = freeCarId(file.name, taken)
  const spec: CarModelSpec = {
    id,
    name: nameFromFile(file.name),
    file: file.name,
    url: '',
    format,
    size: null,
    forward: FORMATS[format].forward,
    up: FORMATS[format].up,
    defaultFacing: defaultFacingOf(format),
    mmPerUnit: null,
    color: BUILT_IN_CAR.color,
    source: 'stored',
    bytes: buffer.byteLength,
  }

  // Read it now: a file that will not parse should never reach the store, and
  // the units fall out of the same read.
  const { root } = await parseCar(spec, bytesOf(buffer))
  const mmPerUnit = guessMmPerUnit(largestExtent(root))
  spec.mmPerUnit = mmPerUnit

  sessionBytes.set(id, buffer)
  try {
    await putStoredCar({
      id,
      name: spec.name,
      file: spec.file,
      bytes: buffer,
      mmPerUnit: mmPerUnit ?? 1,
      realFromFile: mmPerUnit !== null,
      addedAt: Date.now(),
    })
    return { spec, temporary: null }
  } catch (err) {
    // Out of room, or a browser that will not store at all. The model still
    // drives — it just will not be here after a reload.
    sessionOnly.set(id, spec)
    return { spec, temporary: err instanceof Error ? err.message : 'this browser would not keep it' }
  }
}

/** Forget a picked model, from the browser's store and from this session. */
export async function removeStoredCar(id: string): Promise<void> {
  loads.get(`stored:${id}`)?.then(disposeCar).catch(() => {})
  loads.delete(`stored:${id}`)
  sessionBytes.delete(id)
  sessionOnly.delete(id)
  try {
    await deleteStoredCar(id)
  } catch {
    // Nothing to remove is the same as removed.
  }
}

export interface CarLoadState {
  car: LoadedCar | null
  loading: boolean
  error: string | null
}

/**
 * The mesh for a spec, loaded once and shared. The built-in car resolves to no
 * mesh and no error — its caller draws the procedural shape instead.
 */
export function useLoadedCar(spec: CarModelSpec | null): CarLoadState {
  const [state, setState] = useState<CarLoadState>({ car: null, loading: false, error: null })
  const key = spec ? loadKey(spec) : ''

  useEffect(() => {
    if (!spec || isBuiltIn(spec)) {
      setState({ car: null, loading: false, error: null })
      return
    }
    let live = true
    setState({ car: null, loading: true, error: null })
    loadCarModel(spec)
      .then((car) => live && setState({ car, loading: false, error: null }))
      .catch((err: unknown) =>
        live &&
        setState({
          car: null,
          loading: false,
          error: err instanceof Error ? err.message : 'that model could not be read',
        }),
      )
    return () => {
      live = false
    }
    // The key is the identity of a load; the rest of the spec cannot change without it.
  }, [key])

  return state
}
