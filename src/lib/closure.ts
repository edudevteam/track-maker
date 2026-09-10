import * as THREE from 'three'
import type { PartSpec, Piece, PieceKind, PortId } from '../types'
import type { Dimensions } from '../geometry/dimensions'
import { lanesAt } from '../geometry/parts'
import { defaultTransitionLength, maxFlatEnd, minFlatEnd, minTransitionLength } from '../geometry/transition'
import { collectGroup, localPortFrame, portOutward, worldPortFrame } from './ports'

/** One end of one piece — what the closing tool is pointed at. */
export interface PortRef {
  pieceId: string
  port: PortId
}

/** How close the two ends have to come before the joint is treated as made, mm. */
export const FIT_GAP_TOLERANCE = 0.05
/** How well aligned they have to be, degrees. */
export const FIT_ANGLE_TOLERANCE = 0.1

/** What a closing part has room to be. Millimetres and degrees. */
export const SPAN_LIMITS = { min: 20, max: 2000 }
export const RADIUS_LIMITS = { min: 20, max: 5000 }
export const SWEEP_LIMITS = { min: 1, max: 350 }

/**
 * The hole between two open ends, measured in the frame the closing part will
 * be built in: port `a` of the new part sits at the first end, running along
 * +X, so `offset` is where its far end has to land and `tangent` the way that
 * end has to point when it gets there.
 */
export interface Gap {
  /** Straight-line distance between the two ends, mm. */
  distance: number
  /** Turn the part has to make between them, degrees. Positive turns left. */
  turnDeg: number
  /** How far the far end sits above the near one, mm. No part turns out of plane. */
  rise: number
  offset: THREE.Vector3
  tangent: THREE.Vector3
  /** Track width at each end, in lanes. */
  lanesA: number
  lanesB: number
  /**
   * Both ends belong to one run of track, so nothing can be swung round to meet
   * the part — it has to span the gap exactly or the loop stays open.
   */
  sameRun: boolean
}

const X_AXIS = new THREE.Vector3(1, 0, 0)

/** Measure the hole between two open ends. Null when either end has gone. */
export function measureGap(pieces: Piece[], a: PortRef, b: PortRef): Gap | null {
  const pieceA = pieces.find((p) => p.id === a.pieceId)
  const pieceB = pieces.find((p) => p.id === b.pieceId)
  if (!pieceA || !pieceB) return null
  if (pieceA.id === pieceB.id && a.port === b.port) return null

  const from = worldPortFrame(pieceA, a.port)
  const to = worldPortFrame(pieceB, b.port)
  const intoPart = from.quaternion.clone().invert()
  const offset = to.position.clone().sub(from.position).applyQuaternion(intoPart)
  // The part's far end has to face back down the other end's outward axis.
  const tangent = portOutward(to).applyQuaternion(intoPart).negate()

  return {
    distance: offset.length(),
    turnDeg: THREE.MathUtils.radToDeg(Math.atan2(-tangent.z, tangent.x)),
    rise: offset.y,
    offset,
    tangent,
    lanesA: lanesAt(pieceA, a.port),
    lanesB: lanesAt(pieceB, b.port),
    sameRun: collectGroup(pieces, a.pieceId).has(b.pieceId),
  }
}

/** How well a candidate part spans the gap. */
export interface Fit {
  /** Distance left between the part's far end and the end it should meet, mm. */
  gap: number
  /** Angle left between them, degrees. */
  angleDeg: number
  /** Close enough on both counts for the joint to be made. */
  exact: boolean
}

/**
 * Seat the part on the first end and see where its far end lands. Everything is
 * in the part's own frame, so nothing has to be placed on the workplane to
 * answer the question.
 */
export function fitOf(spec: PartSpec, gap: Gap): Fit {
  const far = localPortFrame(spec, 'b')
  const distance = far.position.distanceTo(gap.offset)
  const angle = THREE.MathUtils.radToDeg(
    X_AXIS.clone().applyQuaternion(far.quaternion).angleTo(gap.tangent),
  )
  return {
    gap: distance,
    angleDeg: angle,
    exact: distance <= FIT_GAP_TOLERANCE && angle <= FIT_ANGLE_TOLERANCE,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** How badly a fit misses, as one number — a millimetre and a degree count alike. */
export const score = (fit: Fit) => fit.gap + fit.angleDeg

/**
 * A solved size, cut back to a figure worth printing. A thousandth of a
 * millimetre is far inside what closes a joint, and it keeps the arithmetic's
 * last few binary digits out of the fields.
 */
const tidy = (v: number) => Math.round(v * 1000) / 1000

/**
 * The part of this kind that comes closest to spanning the gap.
 *
 *  - A **straight** runs from one end to the other, so its length is however far
 *    down its own axis the far end sits.
 *  - A **curve** turns by whatever the two headings differ by, on the radius
 *    that puts its far end the right distance away: the chord of an arc is
 *    `2R·sin(θ/2)`, so the radius follows from the turn and the distance.
 *  - A **transition** is a straight that changes width, so it is sized the same
 *    way and takes a width from each end.
 *
 * None of them is guaranteed to close the gap — `fitOf` says whether it did.
 */
export function suggestPart(kind: PieceKind, gap: Gap, d: Dimensions): PartSpec {
  const base: PartSpec = {
    kind,
    lanes: gap.lanesA,
    lanesB: gap.lanesB,
    // How far down its own axis the far end sits — or, when that end is off to
    // one side or behind, simply how far away it is, which at least starts the
    // part at the size of the hole it is filling.
    length: tidy(
      clamp(gap.offset.x > SPAN_LIMITS.min ? gap.offset.x : gap.distance, SPAN_LIMITS.min, SPAN_LIMITS.max),
    ),
    cornerRadius: d.assembly.transitionCornerRadius,
    flatEnd: d.assembly.transitionFlatEnd,
    radius: 120,
    angleDeg: 45,
    name: '',
  }

  if (kind === 'curve') {
    const chord = Math.hypot(gap.offset.x, gap.offset.z)
    // Two headings differing by 37° are also 323° apart the other way round, and
    // a hairpin that comes back on itself is the long way. Both are tried and
    // whichever lands nearer the far end is the one offered.
    const arc = (turn: number) => {
      const sweep = clamp(Math.abs(turn), SWEEP_LIMITS.min, SWEEP_LIMITS.max)
      const half = THREE.MathUtils.degToRad(sweep) / 2
      return {
        ...base,
        lanesB: gap.lanesA,
        radius: tidy(clamp(chord / (2 * Math.sin(half)), RADIUS_LIMITS.min, RADIUS_LIMITS.max)),
        angleDeg: tidy(turn < 0 ? -sweep : sweep),
      }
    }
    // The short way round is the one to show — except where only the long way
    // closes the gap, which is how a hairpin that comes back on itself is made.
    const short = arc(gap.turnDeg)
    if (fitOf(short, gap).exact) return short
    const long = arc(gap.turnDeg > 0 ? gap.turnDeg - 360 : gap.turnDeg + 360)
    return fitOf(long, gap).exact ? long : short
  }

  if (kind === 'transition') {
    const length = tidy(
      clamp(
        gap.offset.x > minTransitionLength(d) ? gap.offset.x : defaultTransitionLength(d, gap.lanesA, gap.lanesB),
        minTransitionLength(d),
        SPAN_LIMITS.max,
      ),
    )
    return {
      ...base,
      length,
      flatEnd: clamp(d.assembly.transitionFlatEnd, minFlatEnd(d), maxFlatEnd(length)),
    }
  }

  // A straight is one width end to end, so it takes the near end's.
  return { ...base, lanesB: gap.lanesA }
}

/**
 * Where a part meets an end of a different width, so the joint would step. Null
 * when both of its ends match what they are clipped to.
 */
export function widthNote(spec: PartSpec, gap: Gap): string | null {
  const a = lanesAt(spec, 'a')
  const b = lanesAt(spec, 'b')
  if (a !== gap.lanesA && b !== gap.lanesB)
    return `Meets ${gap.lanesA}× and ${gap.lanesB}× ends at ${a}× and ${b}× — both joints would step.`
  if (a !== gap.lanesA) return `Meets a ${gap.lanesA}× end at ${a}× — that joint would step.`
  if (b !== gap.lanesB) return `Meets a ${gap.lanesB}× end at ${b}× — that joint would step.`
  return null
}
