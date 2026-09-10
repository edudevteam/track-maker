/**
 * Parametric dimensions for the Track Maker parts.
 *
 * Values are millimetres / degrees, read off the Fusion sketches in `Plan/media/`.
 * The source drawing is cited per field. A few values could not be read directly
 * from the 2D views and are marked INFERRED — every field is editable at runtime
 * from the Dimensions panel so those can be corrected before printing.
 *
 * How the parts fit together (derived from drawings 03, 09 and 11):
 *
 *   track underside, per lane          connector cross-section
 *   ┌──────────────────────┐
 *   │        slab          │              ┌──────────────┐  <- wings, `wingSpan`
 *   │   ┌────────────┐     │  undercut    └──┐        ┌──┘
 *   └───┘            └─────┘  mouth          │  body  │     <- `bodyWidth`
 *        <- mouthW ->                        └────────┘
 *   <---- outerW ---->
 *
 * The connector's wings slide into the undercut; its body passes through the
 * mouth. So bodyWidth < mouthWidth < outerWidth = wingSpan.
 */

export interface TrackProfileDims {
  /** Outer height, bottom face to the top of the wall. (03: 14.378) */
  totalHeight: number
  /** Wall thickness. (03: 2.452) */
  wallThickness: number
  /** Clear width between the inner wall faces at the top. (03: 32.561) */
  channelTopWidth: number
  /**
   * Thickness of the slab under the channel — the channel floor sits at this
   * height above the bottom face, and the T-slot is cut up into it.
   *
   * INFERRED, and deliberately not the 4.389mm that drawing 03 implies
   * (14.378 − 6.489 − 3.50). A 4.696mm-tall clip (drawing 09) cannot fit inside
   * a 4.389mm slab, so one of those two readings is wrong. The default here is
   * sized so the clip actually fits: slot depth + clearance + slotCeiling.
   */
  slabThickness: number
  /** Vertical rise of the angled fillet where the wall meets the channel floor. (03: 3.50) */
  rampHeight: number
  /** Angle between the channel floor and the ramp face. (03: 110°) */
  wallAngleDeg: number

  /** Outer width of the underside T-slot undercut. (03: 26.231) */
  slotOuterWidth: number
  /** Clear width of the T-slot mouth at the bottom face. (03: 21.093) */
  slotMouthWidth: number
  /** Material left above the T-slot. INFERRED from 03 (1.20 skirt). */
  slotCeiling: number
}

export interface ConnectorDims {
  /** Overall length of the clip. (10: 70.00) */
  length: number
  /** Distance between the outer countersink centres. (10: 64.00) */
  holeSpan: number
  /** Number of countersunk holes along the clip. (10: 3 shown) */
  holeCount: number
  /** Through-hole diameter. (10: Ø4.002) */
  holeDia: number
  /** Countersink top diameter. (10: Ø8.402) */
  counterSinkDia: number
  /** Depth of the countersink cone. (14: two-distance chamfer 1.00 / 2.2) */
  counterSinkDepth: number
  /** Height of the small straight ring below the countersink. (12/13: 2mm) */
  innerRingHeight: number

  /** Width of the body that passes through the T-slot mouth. (09: 19.597) */
  bodyWidth: number
  /** Overall height of the clip. (09: 4.696) */
  bodyHeight: number
  /** Thickness of the wings that engage the T-slot undercut. (09: 1.136) */
  wingThickness: number
  /** Horizontal run of the chamfer on the wing. (09: 2.701) */
  wingChamfer: number
  /** Angle of the wing chamfer face. (09: 135°) */
  wingAngleDeg: number
  /** Total width across the wings — matches the track's slot outer width. (03/09: 26.231) */
  wingSpan: number
  /** Chamfer at each end of the clip so it leads into the slot. (10: 133.6°) */
  endChamfer: number
}

export interface AssemblyDims {
  /**
   * Length of the connector pocket at each end of a piece. (04: 40mm, "extruded
   * on both ends of track") — a 70mm clip spans 35mm into each of two pieces.
   */
  connectorInset: number
  /** Nominal length of a standard straight piece. (05: 100mm) */
  defaultStraightLength: number
  /** Clearance between the clip and the T-slot so the printed parts actually fit. */
  fitClearance: number
  /** Shorter clip for tight corners, per the plan. */
  cornerConnectorLength: number
  /**
   * The radius a new transition piece rounds its two taper corners to. 0 leaves
   * them square. Each piece carries its own, so this is only the starting value.
   */
  transitionCornerRadius: number
  /**
   * How much of each end of a new transition stays full width before the taper
   * starts. Shorter ends spread the taper over more of the piece; it can never
   * go below half a clip, or the clip would run out of slot.
   */
  transitionFlatEnd: number
}

export interface Dimensions {
  track: TrackProfileDims
  connector: ConnectorDims
  assembly: AssemblyDims
}

export const DEFAULT_DIMENSIONS: Dimensions = {
  track: {
    totalHeight: 14.378,
    wallThickness: 2.452,
    channelTopWidth: 32.561,
    slabThickness: 6.05,
    rampHeight: 3.5,
    wallAngleDeg: 110,
    slotOuterWidth: 26.231,
    slotMouthWidth: 21.093,
    slotCeiling: 1.2,
  },
  connector: {
    length: 70,
    holeSpan: 64,
    holeCount: 3,
    holeDia: 4.002,
    counterSinkDia: 8.402,
    counterSinkDepth: 2.2,
    innerRingHeight: 2,
    bodyWidth: 19.597,
    bodyHeight: 4.696,
    wingThickness: 1.136,
    wingChamfer: 2.701,
    wingAngleDeg: 135,
    wingSpan: 26.231,
    endChamfer: 2.701,
  },
  assembly: {
    connectorInset: 40,
    defaultStraightLength: 100,
    fitClearance: 0.15,
    cornerConnectorLength: 40,
    transitionCornerRadius: 0,
    transitionFlatEnd: 35,
  },
}

/** Lane pitch — the outer width of a single-lane track. */
export function laneWidth(t: TrackProfileDims): number {
  return t.channelTopWidth + 2 * t.wallThickness
}

/** Height of the channel floor above the bottom face. */
export function floorTopY(t: TrackProfileDims): number {
  return t.slabThickness
}

/** Vertical run of the inner wall face above the ramp. Drawing 03 reads 6.489. */
export function wallStraightHeight(t: TrackProfileDims): number {
  return t.totalHeight - t.slabThickness - t.rampHeight
}

/**
 * Total depth of the underside T-slot. Sized from the connector plus clearance,
 * but never allowed to breach the channel floor — a hand-edited dimension must
 * not be able to produce a self-intersecting cross-section.
 */
export function slotDepth(d: Dimensions): number {
  const wanted = d.connector.bodyHeight + d.assembly.fitClearance
  const room = d.track.slabThickness - Math.max(0.2, d.track.slotCeiling)
  return Math.max(0.4, Math.min(wanted, room))
}

/** Depth of the slot mouth, i.e. the run before the undercut opens out. */
export function slotMouthDepth(d: Dimensions): number {
  const lip = d.connector.wingThickness + d.assembly.fitClearance
  return Math.max(0.2, Math.min(slotDepth(d) - lip, slotDepth(d) - 0.1))
}

export interface DimensionWarning {
  field: string
  message: string
}

/** How a length is written into a warning. Defaults to millimetres. */
export type LengthFormatter = (mm: number) => string

const asMillimetres: LengthFormatter = (mm) => `${mm.toFixed(2)}mm`

/**
 * Sanity checks surfaced in the Dimensions dialog rather than thrown. `fmt`
 * writes the lengths, so the warnings read in whichever unit the UI is showing.
 */
export function validateDimensions(d: Dimensions, fmt: LengthFormatter = asMillimetres): DimensionWarning[] {
  const w: DimensionWarning[] = []
  const t = d.track
  const c = d.connector
  const slab = t.slabThickness
  const wanted = c.bodyHeight + d.assembly.fitClearance

  if (wanted + t.slotCeiling > slab) {
    w.push({
      field: 'slabThickness',
      message: `A ${fmt(c.bodyHeight)} clip plus a ${fmt(t.slotCeiling)} ceiling needs a ${fmt(
        wanted + t.slotCeiling,
      )} slab, but the slab is ${fmt(slab)}. The slot is being clamped, so the clip will not seat fully.`,
    })
  }
  if (wallStraightHeight(t) < 1) {
    w.push({
      field: 'totalHeight',
      message: `Slab (${fmt(slab)}) and ramp (${fmt(
        t.rampHeight,
      )}) leave no straight wall inside a ${fmt(t.totalHeight)} profile.`,
    })
  }
  if (c.bodyWidth >= t.slotMouthWidth) {
    w.push({
      field: 'bodyWidth',
      message: `Connector body (${fmt(c.bodyWidth)}) will not pass the slot mouth (${fmt(
        t.slotMouthWidth,
      )}).`,
    })
  }
  if (c.wingSpan > t.slotOuterWidth) {
    w.push({
      field: 'wingSpan',
      message: `Wings (${fmt(c.wingSpan)}) are wider than the undercut (${fmt(t.slotOuterWidth)}).`,
    })
  }
  if (t.slotOuterWidth >= laneWidth(t)) {
    w.push({
      field: 'slotOuterWidth',
      message: `Slot (${fmt(t.slotOuterWidth)}) is wider than the lane pitch (${fmt(laneWidth(t))}).`,
    })
  }
  if (c.counterSinkDia <= c.holeDia) {
    w.push({ field: 'counterSinkDia', message: 'Countersink must be wider than the through-hole.' })
  }
  return w
}

/** Default colours, matching the reference renders (06/07/08). */
export const DEFAULT_TRACK_COLOR = '#e2622a'
export const DEFAULT_CONNECTOR_COLOR = '#2f7fd1'
