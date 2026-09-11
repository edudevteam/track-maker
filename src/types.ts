export type Vec3 = [number, number, number]

/** Which family of parts the project is building. */
export type TrackType = 'car' | 'train'

/**
 * Which vehicle rides the track in the preview — `diecast` for the built-in
 * shape, otherwise the `id` of an entry in `public/cars/cars.json`. A free
 * string, since the ids come from that file rather than from the code.
 */
export type VehicleType = string

/** How big a vehicle is drawn, mm. Length runs down the track, width across it. */
export interface VehicleSize {
  length: number
  width: number
  height: number
}

/**
 * The unit lengths are shown and typed in. Only a display choice — every stored
 * dimension, position and geometry value stays in millimetres.
 */
export type Unit = 'mm' | 'in'

/**
 * Every way onto a piece. `a` is the local origin end and `b` the far end; a
 * junction adds `l` and `r`, the openings in its left and right walls, which are
 * left and right as the driver sees them with port `b` ahead.
 */
export const PORT_IDS = ['a', 'b', 'l', 'r'] as const
export type PortId = (typeof PORT_IDS)[number]

/** The two side openings, in the order they are offered. */
export const SIDE_PORTS = ['l', 'r'] as const satisfies readonly PortId[]

export type PieceKind = 'straight' | 'curve' | 'transition' | 'junction'

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
  /**
   * The second width, in lanes. A transition uses it for port `b`; a junction
   * uses it for how wide its side openings are, and so for the branch they take.
   * A straight or a curve is `lanes` wide throughout and ignores it.
   */
  lanesB: number
  /** Straight, transition and junction pieces only — centreline length in mm. */
  length: number
  /**
   * Junction pieces only — whether the wall is opened on that side, leaving a
   * port a branch can join. Left and right are the driver's, with port `b` ahead.
   */
  openLeft: boolean
  openRight: boolean
  /**
   * Transition pieces only — radius the two taper corners are rounded to, mm.
   * 0 leaves them square. Clamped to whatever the taper has room for.
   */
  cornerRadius: number
  /**
   * Transition pieces only — how much of each end stays full width before the
   * taper starts, mm. Shorter ends make a slower taper.
   */
  flatEnd: number
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
  lanesB: number
  length: number
  cornerRadius: number
  flatEnd: number
  radius: number
  angleDeg: number
  openLeft: boolean
  openRight: boolean
  name: string
}

export type ToolId = 'select' | 'move' | 'rotate' | 'connect' | 'disconnect' | 'close'

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
  /** Speed along the nose, mm/s. Positive drives forward, negative reverses. */
  v: number
  /** Which way the nose points on that piece: 1 towards port `b`, -1 towards `a`. */
  dir: 1 | -1
  /**
   * How far the car sits from the centreline, mm, measured across the piece with
   * port `b` ahead. Held inside the channel walls by the width of the track.
   */
  offset: number
  /** How far the wheels are turned, radians. Positive is to the car's right. */
  steer: number
  /**
   * How far the nose has come off the track's own direction, radians. It follows
   * the wheels rather than matching them, so it has to be carried frame to frame.
   */
  yaw: number
  running: boolean
}
