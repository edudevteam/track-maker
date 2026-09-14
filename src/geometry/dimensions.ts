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
 * The connector's wings snap into the undercut; its body passes through the
 * mouth. So bodyWidth < mouthWidth < outerWidth < wingSpan — the wings are wider
 * than the undercut on purpose, and the clip's relief slots let them flex in.
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
  /**
   * Height of the T-slot mouth — the narrow run up from the bottom face before
   * the undercut opens out. (Single-Track-V2.stl: 3.211)
   *
   * The track's own number, not worked out from the clip: the track is printed
   * and fixed, and a clip is tuned to fit it rather than the other way round.
   */
  slotMouthDepth: number
  /**
   * Material left above the T-slot. The slot is the slab less this, so it is what
   * sets the slot's total depth. (Single-Track-V2.stl: 6.400 − 5.111)
   */
  slotCeiling: number
}

/**
 * The connector clip — the only one. The snap design measured off
 * `_models/SR2_Single_230116.stl`, printed and confirmed to fit. It grips across
 * its width rather than its height: the wings are wider than the undercut and
 * relief slots let the outer arms flex.
 *
 * The group keeps the name `snapClip` so a project saved with the old clip's
 * `connector` dimensions cannot read them into this one.
 */
export interface SnapClipDims {
  /** Overall length. The printed part is 70; the snap clip starts at 40. */
  length: number
  /** Overall height. (SR2: 4.647) */
  height: number
  /** Width of the body under the wings, the part that passes the slot mouth. (SR2: 19.593) */
  bodyWidth: number
  /** Height of the flat ledge the wings step out on. (SR2: 3.211) */
  wingStep: number
  /** Straight run of the wing tip above the ledge, before the top chamfer. (SR2: 0.636) */
  wingTip: number
  /** Top chamfer on the wings, in across and down alike. (SR2: 0.800) */
  wingChamfer: number
  /** Width across the wings — wider than the undercut, which is the snap. (SR2: 26.611) */
  wingSpan: number
  /** Lead-in chamfer at each end, on the wings only; the body stays square. (SR2: 3.407) */
  endChamfer: number
  /** Width of each relief slot, cut through the full height. (SR2: 3.099) */
  slotWidth: number
  /** Solid strip down the middle carrying the holes, between the two slots. (SR2: 10.193) */
  centreStripWidth: number
  /** Solid length left at each end where the slots stop and the arms join. (SR2: 3.000) */
  endBridge: number
  /** Screw holes along the clip. (SR2: 3 on 70mm; 2 on a 40mm clip, one per piece) */
  holeCount: number
  /** Distance of the first and last hole from the ends. (SR2: 10.845) */
  holeInset: number
  /** Through-hole diameter. (SR2: Ø4.000) */
  holeDia: number
  /** Countersink and counterbore diameter. (SR2: Ø8.500) */
  counterSinkDia: number
  /** Straight bore up from the underside before the cone. (SR2: 1.646) */
  boreHeight: number
  /** Height of the countersink cone; the counterbore runs from its top to the top of the clip. (SR2: 1.000) */
  coneHeight: number
}

export interface AssemblyDims {
  /**
   * Length of the connector pocket at each end of a piece. (04: 40mm, "extruded
   * on both ends of track") — a 40mm clip reaches 20mm into each of two pieces.
   */
  connectorInset: number
  /** Nominal length of a standard straight piece. (05: 100mm) */
  defaultStraightLength: number
  /**
   * The radius a new transition piece rounds its two taper corners to. 0 leaves
   * them square. Each piece carries its own, so this is only the starting value.
   */
  transitionCornerRadius: number
  /**
   * How much of each end of a new transition stays full width before the taper
   * starts. Shorter ends spread the taper over more of the piece; it can never
   * go below `transitionMinFlatEnd`.
   */
  transitionFlatEnd: number
  /**
   * The shortest full-width run a transition may keep at each end. A clip reaches
   * half its length in, so this must be at least that. It is 35 — half the 70mm
   * clip the track was designed round — so no transition changed shape when the
   * 40mm clip replaced it.
   */
  transitionMinFlatEnd: number
}

export interface Dimensions {
  track: TrackProfileDims
  assembly: AssemblyDims
  snapClip: SnapClipDims
}

/**
 * Measured off the Fusion export `Single-Track-V2.stl` and the printed clip
 * `SR2_Single_230116.stl` (kept locally in `_models/`, which is not tracked) rather than read off the 2D
 * drawings — so these are what the printed parts actually are, and the audit
 * checks the built geometry back against them.
 *
 * Two readings the drawings had led the old defaults astray:
 *
 * - `channelTopWidth` was 32.561, which is the **channel floor** width. Adding
 *   the wall thickness to it as though it were the width between the inner wall
 *   faces made every piece exactly one ramp-run too narrow — a 37.465mm lane
 *   pitch instead of the 40.013mm the part measures.
 * - The slab is 6.400 and the bottom of the slot pocket hangs 2.011 below what
 *   used to be the bottom face, which is what gives the clip the 3.211 of mouth
 *   its body needs.
 */
export const DEFAULT_DIMENSIONS: Dimensions = {
  track: {
    totalHeight: 16.389,
    wallThickness: 2.453,
    // 2 × 17.554, the inner wall faces. Lane pitch comes out at 40.013.
    channelTopWidth: 35.107,
    slabThickness: 6.4,
    rampHeight: 3.5,
    wallAngleDeg: 110,
    slotOuterWidth: 26.232,
    slotMouthWidth: 21.094,
    slotMouthDepth: 3.211,
    // Leaves a 5.111 slot in the 6.400 slab.
    slotCeiling: 1.289,
  },
  assembly: {
    connectorInset: 40,
    defaultStraightLength: 135,
    transitionCornerRadius: 0,
    transitionFlatEnd: 40,
    // Half the 70mm clip the track was designed round, held so no transition
    // changes shape. The 40mm clip only needs 20.
    transitionMinFlatEnd: 35,
  },
  // The one clip. Every value off SR2_Single_230116.stl, printed and confirmed
  // to fit, except the length and hole count, which make the 40mm version of it.
  snapClip: {
    length: 40,
    height: 4.647,
    bodyWidth: 19.593,
    wingStep: 3.211,
    wingTip: 0.636,
    wingChamfer: 0.8,
    wingSpan: 26.611,
    endChamfer: 3.407,
    slotWidth: 3.099,
    centreStripWidth: 10.193,
    endBridge: 3,
    holeCount: 2,
    holeInset: 10.845,
    holeDia: 4,
    counterSinkDia: 8.5,
    boreHeight: 1.646,
    coneHeight: 1,
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
 * Total depth of the underside T-slot: the slab less the material left above it.
 *
 * Taken from the track alone. It used to be the clip's height plus a clearance,
 * which meant tuning the clip reshaped every piece of track — and the track is
 * the part that is printed and known to be right.
 */
export function slotDepth(d: Dimensions): number {
  return Math.max(0.4, d.track.slabThickness - Math.max(0.2, d.track.slotCeiling))
}

/** Depth of the slot mouth, i.e. the run before the undercut opens out. */
export function slotMouthDepth(d: Dimensions): number {
  return Math.max(0.2, Math.min(d.track.slotMouthDepth, slotDepth(d) - 0.1))
}

/**
 * How far the pocket reaches in from one end of a piece, clamped so it can never
 * take more than half the piece. At exactly half, the two pockets meet and the
 * slot runs the whole way through — which is all a piece that short has room for.
 */
export function connectorInset(d: Dimensions, length: number): number {
  return Math.min(Math.max(d.assembly.connectorInset, 0.5), Math.max(0.5, length / 2))
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
  const sc = d.snapClip
  const slab = t.slabThickness
  if (t.slotMouthDepth >= slab - t.slotCeiling) {
    w.push({
      field: 'slotMouthDepth',
      message: `The slot mouth (${fmt(t.slotMouthDepth)}) is as deep as the whole slot (${fmt(
        slab - t.slotCeiling,
      )}), leaving no undercut for the wings.`,
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
  if (t.slotOuterWidth >= laneWidth(t)) {
    w.push({
      field: 'slotOuterWidth',
      message: `Slot (${fmt(t.slotOuterWidth)}) is wider than the lane pitch (${fmt(laneWidth(t))}).`,
    })
  }
  const junctionRoom = 2 * (laneWidth(t) - t.slotOuterWidth / 2 - 1)
  if (sc.length > junctionRoom) {
    w.push({
      field: 'snap.length',
      message: `A junction takes a clip in from all four sides, and two of its slots would meet past ${fmt(
        junctionRoom,
      )}. Clips on a junction are being shortened to that.`,
    })
  }
  if (d.assembly.connectorInset < sc.length / 2) {
    w.push({
      field: 'connectorInset',
      message: `A ${fmt(sc.length)} clip reaches ${fmt(
        sc.length / 2,
      )} into each piece, but the pocket is only ${fmt(
        d.assembly.connectorInset,
      )} long. The clip will not seat.`,
    })
  }
  if (d.assembly.transitionMinFlatEnd < sc.length / 2) {
    w.push({
      field: 'transitionMinFlatEnd',
      message: `A ${fmt(sc.length)} clip reaches ${fmt(
        sc.length / 2,
      )} into a transition, but its flat ends may be as short as ${fmt(
        d.assembly.transitionMinFlatEnd,
      )}. The clip could run out of slot.`,
    })
  }
  if (sc.wingSpan <= t.slotOuterWidth) {
    w.push({
      field: 'snap.wingSpan',
      message: `Snap clip wings (${fmt(sc.wingSpan)}) are no wider than the undercut (${fmt(
        t.slotOuterWidth,
      )}), so its arms have nothing to snap against.`,
    })
  }
  if (sc.bodyWidth >= t.slotMouthWidth) {
    w.push({
      field: 'snap.bodyWidth',
      message: `Snap clip body (${fmt(sc.bodyWidth)}) will not pass the slot mouth (${fmt(t.slotMouthWidth)}).`,
    })
  }
  if (sc.height > slotDepth(d) + 1e-6) {
    w.push({
      field: 'snap.height',
      message: `Snap clip (${fmt(sc.height)}) is taller than the ${fmt(slotDepth(d))} slot.`,
    })
  }
  if (sc.centreStripWidth / 2 + sc.slotWidth > sc.bodyWidth / 2 - 0.2) {
    w.push({
      field: 'snap.slotWidth',
      message: `${fmt(sc.slotWidth)} relief slots either side of a ${fmt(
        sc.centreStripWidth,
      )} centre strip leave no arm under a ${fmt(sc.bodyWidth)} body. The slots are being narrowed.`,
    })
  }
  if (sc.counterSinkDia > sc.centreStripWidth - 0.4) {
    w.push({
      field: 'snap.counterSinkDia',
      message: `A ${fmt(sc.counterSinkDia)} countersink would break into the relief slots beside the ${fmt(
        sc.centreStripWidth,
      )} centre strip. It is being made smaller.`,
    })
  }
  if (sc.endChamfer > (sc.wingSpan - sc.bodyWidth) / 2 - 0.02) {
    w.push({
      field: 'snap.endChamfer',
      message: `A ${fmt(sc.endChamfer)} end chamfer would cut into the snap clip's body. It is being reduced to ${fmt(
        (sc.wingSpan - sc.bodyWidth) / 2 - 0.02,
      )}.`,
    })
  }
  if (sc.wingStep + sc.wingTip >= sc.height) {
    w.push({
      field: 'snap.wingTip',
      message: `Snap clip ledge (${fmt(sc.wingStep)}) and wing tip (${fmt(sc.wingTip)}) leave no room for the top chamfer in a ${fmt(
        sc.height,
      )} clip.`,
    })
  }
  if (sc.counterSinkDia <= sc.holeDia) {
    w.push({ field: 'snap.holeDia', message: 'Countersink must be wider than the through-hole.' })
  }
  return w
}

/** Default colours, matching the reference renders (06/07/08). */
export const DEFAULT_TRACK_COLOR = '#e2622a'
export const DEFAULT_CONNECTOR_COLOR = '#2f7fd1'
