export type Vec3 = [number, number, number]

/** Which family of parts the project is building. */
export type TrackType = 'car' | 'train'

/** Which vehicle rides the track in the preview. */
export type VehicleType = 'diecast' | 'rc48'

/** The two ends of every piece. `a` is the local origin end, `b` the far end. */
export type PortId = 'a' | 'b'

export type PieceKind = 'straight' | 'curve'

export interface PortLink {
  pieceId: string
  port: PortId
}

export interface Piece {
  id: string
  name: string
  kind: PieceKind
  /** Track width in lanes. 1 = single, 2 = double width with the middle walls removed, etc. */
  lanes: number
  /** Straight pieces only — centreline length in mm. */
  length: number
  /** Curve pieces only — centreline radius in mm. */
  radius: number
  /** Curve pieces only — sweep in degrees. Positive turns left. */
  angleDeg: number
  /** World transform of the piece's `a` port. */
  position: Vec3
  /** World rotation as an XYZ Euler in radians. */
  rotation: Vec3
  color: string
  /** Connectors fitted to this piece, keyed by port. */
  connectors: Record<PortId, boolean>
  connectorColor: string
  /** Neighbour attached at each port, or null when free. */
  links: Record<PortId, PortLink | null>
  visible: boolean
  locked: boolean
}

/**
 * The recipe for a new piece, as the Parts Library hands it to the store. Kept
 * apart from `Piece` because it carries no identity, placement or joints — it is
 * what "add another one of those" needs to know.
 */
export interface PartSpec {
  kind: PieceKind
  lanes: number
  length: number
  radius: number
  angleDeg: number
  name: string
}

export type ToolId = 'select' | 'move' | 'rotate' | 'connect' | 'disconnect'

/** Which part of a selected piece the transform gizmo is anchored to. */
export type GizmoAnchor = 'a' | 'middle' | 'b'

export interface PrinterPreset {
  id: string
  name: string
  /** Build volume in mm. */
  size: Vec3
}

export interface CarState {
  /** Piece the car is currently riding. */
  pieceId: string | null
  /** Arc-length position along that piece's centreline, in mm. */
  s: number
  /** Speed along the centreline, mm/s. Positive runs a -> b. */
  v: number
  running: boolean
}
