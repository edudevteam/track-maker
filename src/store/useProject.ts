import { create } from 'zustand'
import * as THREE from 'three'
import type {
  CarState,
  GizmoAnchor,
  PartSpec,
  Piece,
  PieceKind,
  PortId,
  PrinterPreset,
  ToolId,
  TrackType,
  Unit,
  Vec3,
  VehicleType,
} from '../types'
import {
  DEFAULT_CONNECTOR_COLOR,
  DEFAULT_DIMENSIONS,
  DEFAULT_TRACK_COLOR,
  type Dimensions,
} from '../geometry/dimensions'
import { transformToMate, worldPortFrame } from '../lib/ports'
import { loadUnits, saveUnits } from '../lib/units'
import type { ProjectDocument } from '../export/project'

export const PRINTER_PRESETS: PrinterPreset[] = [
  { id: 'bambu-256', name: 'Bambu P1/X1 · 256³', size: [256, 256, 256] },
  { id: 'prusa-mk4', name: 'Prusa MK4 · 250×210×220', size: [250, 220, 210] },
  { id: 'ender3', name: 'Ender 3 · 220×220×250', size: [220, 250, 220] },
  { id: 'a1-mini', name: 'Bambu A1 mini · 180³', size: [180, 180, 180] },
  { id: 'custom', name: 'Custom', size: [256, 256, 256] },
]

/** The Settings ▸ Track menu. Only the car track is built out so far. */
export const TRACK_TYPES: { value: TrackType; label: string; enabled: boolean }[] = [
  { value: 'car', label: 'Car', enabled: true },
  { value: 'train', label: 'Train', enabled: false },
]

/** The Settings ▸ Vehicle menu — what rides the track in the preview. */
export const VEHICLE_TYPES: { value: VehicleType; label: string; enabled: boolean }[] = [
  { value: 'diecast', label: 'Die Cast', enabled: true },
  { value: 'rc48', label: '1/48" RC', enabled: false },
]

export const vehicleLabel = (v: VehicleType) =>
  VEHICLE_TYPES.find((x) => x.value === v)?.label ?? 'Vehicle'

export type BackgroundMode = 'theme' | 'sky' | 'solid'

/** A cool daylight gradient — enough contrast for orange track without competing with it. */
export const DEFAULT_SKY_TOP = '#5b9bd5'
export const DEFAULT_SKY_BOTTOM = '#dce8f2'

let counter = 0
const nextId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`

export interface Selection {
  pieceIds: string[]
  anchor: GizmoAnchor
}

export interface AddOptions {
  /**
   * End to join the new piece onto, overriding the Placement toggle and the
   * highlighted end. `null` forces the piece to land loose.
   */
  attachTo?: { pieceId: string; port: PortId } | null
}

export interface ProjectState {
  projectName: string
  trackType: TrackType
  /** Which vehicle the preview rides — picked in Settings ▸ Vehicle. */
  vehicle: VehicleType
  /**
   * The unit every length is shown and typed in — picked in Settings ▸ Units.
   * Display only: the build itself is millimetres throughout.
   */
  units: Unit
  dims: Dimensions

  pieces: Piece[]
  selection: Selection
  tool: ToolId
  /** When on, a new piece snaps onto the highlighted free port instead of landing loose. */
  snapToPort: boolean
  /** Free port a new piece will attach to. */
  activePort: { pieceId: string; port: PortId } | null
  /** The last part added, so the repeat tool can lay another one down. */
  lastPart: PartSpec | null

  showGrid: boolean
  showPrintVolume: boolean
  showPorts: boolean
  /** Viewport backdrop. `theme` follows light/dark; `sky` draws a gradient dome. */
  background: BackgroundMode
  skyTop: string
  skyBottom: string
  solidColor: string
  printer: PrinterPreset
  customPrinterSize: Vec3

  car: CarState
  /** Whether the vehicle is drawn on the track. Hiding it parks it where it stands. */
  showVehicle: boolean
  gravity: number
  friction: number

  history: Piece[][]
  future: Piece[][]
}

export interface ProjectActions {
  setProjectName: (n: string) => void
  setTrackType: (t: TrackType) => void
  setVehicle: (v: VehicleType) => void
  setUnits: (u: Unit) => void
  setDims: (patch: Partial<Dimensions>) => void
  setDimValue: (group: keyof Dimensions, field: string, value: number) => void
  resetDims: () => void

  addPiece: (init?: Partial<Piece>, opts?: AddOptions) => string
  /** Another of the last part added, joined onto the open end of the build. */
  repeatLastPart: () => string | null
  updatePiece: (id: string, patch: Partial<Piece>) => void
  removeSelected: () => void
  duplicateSelected: () => void

  select: (ids: string[], additive?: boolean) => void
  setAnchor: (a: GizmoAnchor) => void
  setTool: (t: ToolId) => void
  setSnapToPort: (v: boolean) => void
  setActivePort: (p: { pieceId: string; port: PortId } | null) => void

  connectPorts: (a: { pieceId: string; port: PortId }, b: { pieceId: string; port: PortId }) => void
  disconnectPort: (p: { pieceId: string; port: PortId }) => void

  toggleGrid: () => void
  togglePrintVolume: () => void
  togglePorts: () => void
  setBackground: (mode: BackgroundMode) => void
  setSkyColors: (top: string, bottom: string) => void
  setSolidColor: (c: string) => void
  setPrinter: (id: string) => void
  setCustomPrinterSize: (s: Vec3) => void

  setCar: (patch: Partial<CarState>) => void
  dropCar: () => void
  /** Show or hide the vehicle, dropping it on the track the first time it is shown. */
  toggleVehicle: () => void
  setGravity: (g: number) => void
  setFriction: (f: number) => void

  commit: () => void
  undo: () => void
  redo: () => void
  /** Start over: an empty workplane under a fresh title. Workshop setup is kept. */
  newProject: () => void
  loadPieces: (pieces: Piece[]) => void
  /** Replace the whole build with a project read from a `.track.json` file. */
  loadProject: (doc: ProjectDocument) => void
}

function makePiece(dims: Dimensions, init: Partial<Piece> = {}): Piece {
  const kind: PieceKind = init.kind ?? 'straight'
  return {
    id: nextId(),
    name: init.name ?? (kind === 'straight' ? 'Straight' : 'Curve'),
    kind,
    lanes: init.lanes ?? 1,
    length: init.length ?? dims.assembly.defaultStraightLength,
    radius: init.radius ?? 120,
    angleDeg: init.angleDeg ?? 45,
    position: init.position ?? [0, 0, 0],
    rotation: init.rotation ?? [0, 0, 0],
    color: init.color ?? DEFAULT_TRACK_COLOR,
    // A loose piece carries no clips. They are fitted when a joint is made.
    connectors: init.connectors ?? { a: false, b: false },
    connectorColor: init.connectorColor ?? DEFAULT_CONNECTOR_COLOR,
    links: init.links ?? { a: null, b: null },
    visible: init.visible ?? true,
    locked: init.locked ?? false,
  }
}

/** What the repeat tool needs to lay down another of the same part. */
function specOf(p: Piece): PartSpec {
  const { kind, lanes, length, radius, angleDeg, name } = p
  return { kind, lanes, length, radius, angleDeg, name }
}

/** The given end, or null when it is missing or already joined. */
function freePort(pieces: Piece[], at: { pieceId: string; port: PortId } | null) {
  if (!at) return null
  const piece = pieces.find((p) => p.id === at.pieceId)
  return piece && !piece.links[at.port] ? at : null
}

/** The open end of the most recently added piece — `b` first, since builds run a → b. */
function newestFreePort(pieces: Piece[]) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i]
    for (const port of ['b', 'a'] as PortId[]) if (!p.links[port]) return { pieceId: p.id, port }
  }
  return null
}

/** Somewhere clear of existing geometry, so an unsnapped piece lands where you can see it. */
function freeSpot(pieces: Piece[]): Vec3 {
  const row = pieces.length
  return [0, 0, -60 - row * 55]
}

export const useProject = create<ProjectState & ProjectActions>((set, get) => ({
  projectName: 'Untitled Track',
  trackType: 'car',
  vehicle: 'diecast',
  units: loadUnits(),
  dims: DEFAULT_DIMENSIONS,

  pieces: [],
  selection: { pieceIds: [], anchor: 'middle' },
  tool: 'select',
  snapToPort: true,
  activePort: null,
  lastPart: null,

  showGrid: true,
  showPrintVolume: false,
  showPorts: true,
  background: 'theme',
  skyTop: DEFAULT_SKY_TOP,
  skyBottom: DEFAULT_SKY_BOTTOM,
  solidColor: '#5b6570',
  printer: PRINTER_PRESETS[0],
  customPrinterSize: [256, 256, 256],

  car: { pieceId: null, s: 0, v: 0, running: false },
  showVehicle: false,
  gravity: 9810,
  friction: 0.35,

  history: [],
  future: [],

  setProjectName: (projectName) => set({ projectName }),
  setTrackType: (trackType) => set({ trackType }),
  setVehicle: (vehicle) => set({ vehicle }),
  setUnits: (units) => {
    saveUnits(units)
    set({ units })
  },
  setDims: (patch) => set((s) => ({ dims: { ...s.dims, ...patch } })),
  setDimValue: (group, field, value) =>
    set((s) => ({
      dims: { ...s.dims, [group]: { ...(s.dims[group] as object), [field]: value } } as Dimensions,
    })),
  resetDims: () => set({ dims: DEFAULT_DIMENSIONS }),

  addPiece: (init = {}, opts = {}) => {
    const state = get()
    state.commit()
    const piece = makePiece(state.dims, init)
    const lastPart = specOf(piece)

    const target = opts.attachTo !== undefined ? opts.attachTo : state.snapToPort ? state.activePort : null
    if (target) {
      const host = state.pieces.find((p) => p.id === target.pieceId)
      if (host && !host.links[target.port]) {
        const frame = worldPortFrame(host, target.port)
        const t = transformToMate(piece, 'a', frame)
        piece.position = t.position
        piece.rotation = t.rotation
        piece.links = { a: { pieceId: host.id, port: target.port }, b: null }
        piece.connectors = { ...piece.connectors, a: true }
        set((s) => ({
          pieces: [
            ...s.pieces.map((p) =>
              p.id === host.id
                ? {
                    ...p,
                    links: { ...p.links, [target.port]: { pieceId: piece.id, port: 'a' as PortId } },
                    connectors: { ...p.connectors, [target.port]: true },
                  }
                : p,
            ),
            piece,
          ],
          selection: { pieceIds: [piece.id], anchor: 'middle' },
          activePort: { pieceId: piece.id, port: 'b' },
          lastPart,
        }))
        return piece.id
      }
    }

    piece.position = init.position ?? freeSpot(state.pieces)
    set((s) => ({
      pieces: [...s.pieces, piece],
      selection: { pieceIds: [piece.id], anchor: 'middle' },
      activePort: { pieceId: piece.id, port: 'b' },
      lastPart,
    }))
    return piece.id
  },

  repeatLastPart: () => {
    const { lastPart, pieces, activePort, addPiece } = get()
    if (!lastPart) return null
    // The highlighted end wins when it is still free; otherwise take the newest
    // open end, which is where the build was last growing.
    const target = freePort(pieces, activePort) ?? newestFreePort(pieces)
    return addPiece({ ...lastPart }, { attachTo: target })
  },

  updatePiece: (id, patch) =>
    set((s) => ({ pieces: s.pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  removeSelected: () => {
    const { selection, pieces, commit } = get()
    if (!selection.pieceIds.length) return
    commit()
    const gone = new Set(selection.pieceIds)
    set({
      pieces: pieces
        .filter((p) => !gone.has(p.id))
        .map((p) => {
          const orphaned = (port: PortId) => !!p.links[port] && gone.has(p.links[port]!.pieceId)
          return {
            ...p,
            links: {
              a: orphaned('a') ? null : p.links.a,
              b: orphaned('b') ? null : p.links.b,
            },
            connectors: {
              a: orphaned('a') ? false : p.connectors.a,
              b: orphaned('b') ? false : p.connectors.b,
            },
          }
        }),
      selection: { pieceIds: [], anchor: 'middle' },
      activePort: null,
    })
  },

  duplicateSelected: () => {
    const { selection, pieces, dims, commit } = get()
    if (!selection.pieceIds.length) return
    commit()
    const copies = pieces
      .filter((p) => selection.pieceIds.includes(p.id))
      .map((p) =>
        makePiece(dims, {
          ...p,
          name: `${p.name} copy`,
          position: [p.position[0], p.position[1], p.position[2] + 60],
          links: { a: null, b: null },
          connectors: { a: false, b: false },
        }),
      )
    set({ pieces: [...pieces, ...copies], selection: { pieceIds: copies.map((c) => c.id), anchor: 'middle' } })
  },

  select: (ids, additive = false) =>
    set((s) => ({
      selection: {
        pieceIds: additive ? Array.from(new Set([...s.selection.pieceIds, ...ids])) : ids,
        anchor: s.selection.anchor,
      },
    })),
  setAnchor: (anchor) => set((s) => ({ selection: { ...s.selection, anchor } })),
  setTool: (tool) => set({ tool }),
  setSnapToPort: (snapToPort) => set({ snapToPort }),
  setActivePort: (activePort) => set({ activePort }),

  connectPorts: (a, b) => {
    const { pieces, commit } = get()
    const pieceA = pieces.find((p) => p.id === a.pieceId)
    const pieceB = pieces.find((p) => p.id === b.pieceId)
    if (!pieceA || !pieceB || pieceA.id === pieceB.id) return
    if (pieceA.links[a.port] || pieceB.links[b.port]) return
    commit()
    // Move B's subtree onto A's port. A stays put.
    const frame = worldPortFrame(pieceA, a.port)
    const t = transformToMate(pieceB, b.port, frame)
    const before = new THREE.Matrix4().compose(
      new THREE.Vector3(...pieceB.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...pieceB.rotation, 'XYZ')),
      new THREE.Vector3(1, 1, 1),
    )
    const after = new THREE.Matrix4().compose(
      new THREE.Vector3(...t.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation, 'XYZ')),
      new THREE.Vector3(1, 1, 1),
    )
    const delta = after.multiply(before.invert())

    const group = collectGroup(pieces, pieceB.id)
    set({
      pieces: pieces.map((p) => {
        let next = p
        if (group.has(p.id)) next = { ...p, ...applyMatrix(p, delta) }
        if (p.id === a.pieceId)
          next = {
            ...next,
            links: { ...next.links, [a.port]: b },
            connectors: { ...next.connectors, [a.port]: true },
          }
        if (p.id === b.pieceId)
          next = {
            ...next,
            links: { ...next.links, [b.port]: a },
            connectors: { ...next.connectors, [b.port]: true },
          }
        return next
      }),
      activePort: null,
    })
  },

  disconnectPort: (p) => {
    const { pieces, commit } = get()
    const piece = pieces.find((x) => x.id === p.pieceId)
    const link = piece?.links[p.port]
    if (!piece || !link) return
    commit()
    set({
      pieces: pieces.map((x) => {
        // The joint is gone, so the clip goes with it.
        if (x.id === p.pieceId)
          return { ...x, links: { ...x.links, [p.port]: null }, connectors: { ...x.connectors, [p.port]: false } }
        if (x.id === link.pieceId)
          return {
            ...x,
            links: { ...x.links, [link.port]: null },
            connectors: { ...x.connectors, [link.port]: false },
          }
        return x
      }),
    })
  },

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  togglePrintVolume: () => set((s) => ({ showPrintVolume: !s.showPrintVolume })),
  togglePorts: () => set((s) => ({ showPorts: !s.showPorts })),
  setBackground: (background) => set({ background }),
  setSkyColors: (skyTop, skyBottom) => set({ skyTop, skyBottom }),
  setSolidColor: (solidColor) => set({ solidColor }),
  setPrinter: (id) => {
    const preset = PRINTER_PRESETS.find((p) => p.id === id) ?? PRINTER_PRESETS[0]
    set((s) => ({ printer: id === 'custom' ? { ...preset, size: s.customPrinterSize } : preset }))
  },
  setCustomPrinterSize: (size) =>
    set((s) => ({
      customPrinterSize: size,
      printer: s.printer.id === 'custom' ? { ...s.printer, size } : s.printer,
    })),

  setCar: (patch) => set((s) => ({ car: { ...s.car, ...patch } })),
  dropCar: () => {
    const { pieces } = get()
    const first = pieces.find((p) => !p.links.a) ?? pieces[0]
    set({ car: { pieceId: first?.id ?? null, s: 2, v: 0, running: true } })
  },
  toggleVehicle: () => {
    const { showVehicle, car, pieces, dropCar } = get()
    if (showVehicle) {
      // Hiding parks it: it keeps its place on the track and picks up from there.
      set({ showVehicle: false, car: { ...car, running: false } })
      return
    }
    const parked = car.pieceId && pieces.some((p) => p.id === car.pieceId)
    if (parked) set({ showVehicle: true, car: { ...car, running: true } })
    else {
      dropCar()
      set({ showVehicle: true })
    }
  },
  setGravity: (gravity) => set({ gravity }),
  setFriction: (friction) => set({ friction }),

  commit: () => set((s) => ({ history: [...s.history.slice(-49), s.pieces], future: [] })),
  undo: () =>
    set((s) => {
      if (!s.history.length) return s
      const prev = s.history[s.history.length - 1]
      return { pieces: prev, history: s.history.slice(0, -1), future: [s.pieces, ...s.future] }
    }),
  redo: () =>
    set((s) => {
      if (!s.future.length) return s
      return { pieces: s.future[0], history: [...s.history, s.pieces], future: s.future.slice(1) }
    }),
  loadPieces: (pieces) => set({ pieces, selection: { pieceIds: [], anchor: 'middle' }, history: [], future: [] }),

  newProject: () =>
    set({
      projectName: 'Untitled Track',
      pieces: [],
      selection: { pieceIds: [], anchor: 'middle' },
      activePort: null,
      lastPart: null,
      tool: 'select',
      car: { pieceId: null, s: 0, v: 0, running: false },
      showVehicle: false,
      // Dimensions, printer, the chosen vehicle and view settings are workshop
      // setup, not part of the build, so a new project keeps them.
      history: [],
      future: [],
    }),

  loadProject: (doc) => {
    const preset = PRINTER_PRESETS.find((p) => p.id === doc.printerId) ?? PRINTER_PRESETS[0]
    set({
      projectName: doc.name,
      trackType: doc.trackType,
      vehicle: doc.vehicle,
      dims: doc.dims,
      pieces: doc.pieces,
      printer: preset.id === 'custom' ? { ...preset, size: doc.customPrinterSize } : preset,
      customPrinterSize: doc.customPrinterSize,
      gravity: doc.gravity,
      friction: doc.friction,
      // An opened file starts a fresh session: nothing selected, nothing to undo past.
      selection: { pieceIds: [], anchor: 'middle' },
      activePort: null,
      lastPart: null,
      tool: 'select',
      car: { pieceId: null, s: 0, v: 0, running: false },
      showVehicle: false,
      history: [],
      future: [],
    })
  },
}))

/** Every piece reachable through links from `startId` — a connected assembly. */
export function collectGroup(pieces: Piece[], startId: string): Set<string> {
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const stack = [startId]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const p = byId.get(id)
    if (!p) continue
    for (const port of ['a', 'b'] as PortId[]) {
      const l = p.links[port]
      if (l && !seen.has(l.pieceId)) stack.push(l.pieceId)
    }
  }
  return seen
}

function applyMatrix(p: Piece, m: THREE.Matrix4): Pick<Piece, 'position' | 'rotation'> {
  const cur = new THREE.Matrix4().compose(
    new THREE.Vector3(...p.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  )
  const next = m.clone().multiply(cur)
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  next.decompose(pos, quat, scl)
  const e = new THREE.Euler().setFromQuaternion(quat, 'XYZ')
  return { position: [pos.x, pos.y, pos.z], rotation: [e.x, e.y, e.z] }
}
