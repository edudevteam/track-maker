import type { Piece, PieceKind, PortId, PortLink, TrackType, Vec3, VehicleType } from '../types'
import {
  DEFAULT_CONNECTOR_COLOR,
  DEFAULT_DIMENSIONS,
  DEFAULT_TRACK_COLOR,
  type Dimensions,
} from '../geometry/dimensions'

/** Marker written into every `.track.json` so we can tell our files from any other JSON. */
export const PROJECT_FORMAT = 'track-maker'
/** Bumped only when the shape of a saved file changes in a way a reader must know about. */
export const PROJECT_FORMAT_VERSION = 1
export const PROJECT_FILE_EXT = '.track.json'

/** Everything a saved file restores. Transient state — selection, tool, undo history — is not saved. */
export interface ProjectDocument {
  format: typeof PROJECT_FORMAT
  formatVersion: number
  /** App version that wrote the file, for diagnosing a file that opens oddly. */
  app: string
  savedAt: string
  name: string
  trackType: TrackType
  vehicle: VehicleType
  dims: Dimensions
  pieces: Piece[]
  printerId: string
  customPrinterSize: Vec3
  gravity: number
  friction: number
}

export interface ProjectSnapshot {
  projectName: string
  trackType: TrackType
  vehicle: VehicleType
  dims: Dimensions
  pieces: Piece[]
  printer: { id: string }
  customPrinterSize: Vec3
  gravity: number
  friction: number
}

export function serializeProject(s: ProjectSnapshot): ProjectDocument {
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    app: __APP_VERSION__,
    savedAt: new Date().toISOString(),
    name: s.projectName,
    trackType: s.trackType,
    vehicle: s.vehicle,
    dims: s.dims,
    pieces: s.pieces,
    printerId: s.printer.id,
    customPrinterSize: s.customPrinterSize,
    gravity: s.gravity,
    friction: s.friction,
  }
}

export function projectToBlob(s: ProjectSnapshot): Blob {
  return new Blob([JSON.stringify(serializeProject(s), null, 2)], { type: 'application/json' })
}

/**
 * A project name turned into a filename stem. Shared by the save file and the
 * printing export so both land next to each other in the download folder.
 */
export function safeBaseName(name: string): string {
  return name.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-') || 'track'
}

export function projectFileName(name: string): string {
  return `${safeBaseName(name)}${PROJECT_FILE_EXT}`
}

/** Thrown for a file we can read but do not understand. The message is shown to the user. */
export class ProjectParseError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function vec3(v: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) return fallback
  const [x, y, z] = v
  if ([x, y, z].some((n) => typeof n !== 'number' || !Number.isFinite(n))) return fallback
  return [x as number, y as number, z as number]
}

/**
 * Dimensions are merged group by group onto the current defaults, so a file
 * written before a dimension existed still opens and picks up today's default
 * for the missing one instead of an undefined that reaches the geometry.
 */
function mergeDims(v: unknown): Dimensions {
  if (!isObj(v)) return DEFAULT_DIMENSIONS
  const out = {} as Dimensions
  for (const group of Object.keys(DEFAULT_DIMENSIONS) as (keyof Dimensions)[]) {
    const defaults = DEFAULT_DIMENSIONS[group] as unknown as Record<string, number>
    const saved = isObj(v[group]) ? (v[group] as Record<string, unknown>) : {}
    const merged: Record<string, number> = {}
    for (const [field, value] of Object.entries(defaults)) merged[field] = num(saved[field], value)
    out[group] = merged as never
  }
  return out
}

function readLink(v: unknown, ids: Set<string>): PortLink | null {
  if (!isObj(v)) return null
  const pieceId = typeof v.pieceId === 'string' ? v.pieceId : null
  const port = v.port === 'a' || v.port === 'b' ? (v.port as PortId) : null
  if (!pieceId || !port || !ids.has(pieceId)) return null
  return { pieceId, port }
}

function readPiece(v: unknown, index: number, ids: Set<string>): Piece | null {
  if (!isObj(v)) return null
  const id = typeof v.id === 'string' && v.id.length ? v.id : null
  if (!id) return null
  const kind: PieceKind = v.kind === 'curve' ? 'curve' : 'straight'
  return {
    id,
    name: str(v.name, kind === 'straight' ? 'Straight' : `Piece ${index + 1}`),
    kind,
    lanes: Math.max(1, Math.round(num(v.lanes, 1))),
    length: num(v.length, DEFAULT_DIMENSIONS.assembly.defaultStraightLength),
    radius: num(v.radius, 120),
    angleDeg: num(v.angleDeg, 45),
    position: vec3(v.position, [0, 0, 0]),
    rotation: vec3(v.rotation, [0, 0, 0]),
    color: str(v.color, DEFAULT_TRACK_COLOR),
    connectors: {
      a: bool(isObj(v.connectors) ? v.connectors.a : undefined, false),
      b: bool(isObj(v.connectors) ? v.connectors.b : undefined, false),
    },
    connectorColor: str(v.connectorColor, DEFAULT_CONNECTOR_COLOR),
    links: {
      a: readLink(isObj(v.links) ? v.links.a : undefined, ids),
      b: readLink(isObj(v.links) ? v.links.b : undefined, ids),
    },
    visible: bool(v.visible, true),
    locked: bool(v.locked, false),
  }
}

/** Drop any link the other end does not agree with, so a half-written joint cannot desync the build. */
function pruneOneSidedLinks(pieces: Piece[]): Piece[] {
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const mutual = (p: Piece, port: PortId) => {
    const link = p.links[port]
    if (!link) return false
    const other = byId.get(link.pieceId)?.links[link.port]
    return !!other && other.pieceId === p.id && other.port === port
  }
  return pieces.map((p) => {
    const a = mutual(p, 'a')
    const b = mutual(p, 'b')
    if (a && b) return p
    return { ...p, links: { a: a ? p.links.a : null, b: b ? p.links.b : null } }
  })
}

/**
 * Parse the text of a `.track.json` file. Unknown fields are ignored and missing
 * ones fall back to today's defaults, so a file from an older build still opens.
 */
export function parseProject(text: string): ProjectDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ProjectParseError('That file is not valid JSON.')
  }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) {
    throw new ProjectParseError(`That is not a Track Maker ${PROJECT_FILE_EXT} file.`)
  }
  const formatVersion = num(raw.formatVersion, 1)
  if (formatVersion > PROJECT_FORMAT_VERSION) {
    throw new ProjectParseError('That file was saved by a newer version of Track Maker.')
  }

  const rawPieces = Array.isArray(raw.pieces) ? raw.pieces : []
  const ids = new Set(
    rawPieces.map((p) => (isObj(p) && typeof p.id === 'string' ? p.id : '')).filter(Boolean) as string[],
  )
  const pieces = pruneOneSidedLinks(
    rawPieces.map((p, i) => readPiece(p, i, ids)).filter((p): p is Piece => p !== null),
  )

  return {
    format: PROJECT_FORMAT,
    formatVersion,
    app: str(raw.app, 'unknown'),
    savedAt: str(raw.savedAt, ''),
    name: str(raw.name, 'Untitled Track'),
    // Anything we do not recognise — including the old 'marble' track type —
    // opens as a car track with the die-cast vehicle.
    trackType: raw.trackType === 'train' ? 'train' : 'car',
    vehicle: raw.vehicle === 'rc48' ? 'rc48' : 'diecast',
    dims: mergeDims(raw.dims),
    pieces,
    printerId: str(raw.printerId, 'bambu-256'),
    customPrinterSize: vec3(raw.customPrinterSize, [256, 256, 256]),
    gravity: num(raw.gravity, 9810),
    friction: num(raw.friction, 0.35),
  }
}
