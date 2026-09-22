import * as THREE from 'three'
import type { PartSpec, Piece, PieceKind, PortId } from '../types'
import { laneWidth, type Dimensions } from '../geometry/dimensions'
import { lanesAt } from '../geometry/parts'
import { defaultTransitionLength, maxFlatEnd, minFlatEnd, minTransitionLength } from '../geometry/transition'
import {
  collectGroup,
  localPortFrame,
  pieceQuaternion,
  portOutward,
  portsOf,
  worldPortFrame,
  type PieceShape,
} from './ports'

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
export function measureGap(pieces: Piece[], a: PortRef, b: PortRef, d: Dimensions): Gap | null {
  const pieceA = pieces.find((p) => p.id === a.pieceId)
  const pieceB = pieces.find((p) => p.id === b.pieceId)
  if (!pieceA || !pieceB) return null
  if (pieceA.id === pieceB.id && a.port === b.port) return null

  const from = worldPortFrame(pieceA, a.port, d)
  const to = worldPortFrame(pieceB, b.port, d)
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
export function fitOf(spec: PartSpec, gap: Gap, d: Dimensions): Fit {
  const far = localPortFrame(spec, 'b', d)
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
    openLeft: false,
    openRight: false,
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
    if (fitOf(short, gap, d).exact) return short
    const long = arc(gap.turnDeg > 0 ? gap.turnDeg - 360 : gap.turnDeg + 360)
    return fitOf(long, gap, d).exact ? long : short
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

// ---------------------------------------------------------------------------
// Closing a loop by adjusting the track already on it
// ---------------------------------------------------------------------------

/** One piece the loop is closed by resizing, with its sizes before and after. */
export interface Adjustment {
  pieceId: string
  before: Pick<Piece, 'length' | 'radius' | 'angleDeg'>
  after: Pick<Piece, 'length' | 'radius' | 'angleDeg'>
}

/** What resizing the run can do for a gap: the pieces to change, or why nothing can. */
export type AdjustPlan = { ok: true; changes: Adjustment[] } | { ok: false; reason: string }

/** The most pieces the solver will resize to close one gap. */
const MAX_ADJUSTED = 3

/**
 * A position and heading on the workplane: `h` turns about +Y, so heading `h`
 * points along (cos h, −sin h) in x and z — the same way a port frame's +X does.
 */
interface Pose {
  x: number
  z: number
  h: number
}

const compose = (a: Pose, b: Pose): Pose => {
  const c = Math.cos(a.h)
  const s = Math.sin(a.h)
  return { x: a.x + b.x * c + b.z * s, z: a.z - b.x * s + b.z * c, h: a.h + b.h }
}

const invert = (p: Pose): Pose => {
  const c = Math.cos(p.h)
  const s = Math.sin(p.h)
  return { x: -(p.x * c - p.z * s), z: -(p.x * s + p.z * c), h: -p.h }
}

const wrap = (h: number) => Math.atan2(Math.sin(h), Math.cos(h))

/** A piece-local port frame, flattened onto the workplane. */
function flatFrame(shape: PieceShape, port: PortId, d: Dimensions): Pose {
  const f = localPortFrame(shape, port, d)
  return { x: f.position.x, z: f.position.z, h: 2 * Math.atan2(f.quaternion.y, f.quaternion.w) }
}

/**
 * Driving through a piece — in at one port, out at another — as a move in the
 * frame of whoever drives in. The way in faces back along that port's outward
 * axis, so it is that frame turned half round.
 */
function traverse(shape: PieceShape, into: PortId, out: PortId, d: Dimensions): Pose {
  const entry = flatFrame(shape, into, d)
  return compose(invert({ ...entry, h: entry.h + Math.PI }), flatFrame(shape, out, d))
}

/** One piece on the way from the first end to the second. */
interface Step {
  piece: Piece
  into: PortId
  out: PortId
}

/** The pieces between two ends of one run, in the order a car would drive them. */
function pathBetween(pieces: Piece[], a: PortRef, b: PortRef): Step[] | null {
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const came = new Map<string, { into: PortId; from: { id: string; out: PortId } | null }>()
  came.set(a.pieceId, { into: a.port, from: null })
  const queue = [a.pieceId]
  while (queue.length) {
    const id = queue.shift()!
    if (id === b.pieceId) break
    const p = byId.get(id)!
    for (const port of portsOf(p)) {
      const link = p.links[port]
      if (port === came.get(id)!.into || !link || came.has(link.pieceId) || !byId.has(link.pieceId)) continue
      came.set(link.pieceId, { into: link.port, from: { id, out: port } })
      queue.push(link.pieceId)
    }
  }
  if (!came.has(b.pieceId)) return null

  const steps: Step[] = []
  let at: { id: string; out: PortId } | null = { id: b.pieceId, out: b.port }
  while (at) {
    const entry: { into: PortId; from: { id: string; out: PortId } | null } = came.get(at.id)!
    if (entry.into === at.out) return null
    steps.unshift({ piece: byId.get(at.id)!, into: entry.into, out: at.out })
    at = entry.from
  }
  return steps
}

/** One size on one piece that the solver may change, and how far. */
interface Knob {
  step: number
  key: 'length' | 'radius' | 'angleDeg'
  lo: number
  hi: number
  /** 0 a length, 1 a radius, 2 a sweep — the order they are reached for. */
  tier: 0 | 1 | 2
  /** What a unit of change costs against the others in its tier. */
  weight: number
}

function knobsOf(steps: Step[], d: Dimensions): Knob[] {
  const knobs: Knob[] = []
  steps.forEach(({ piece: p }, step) => {
    if (p.locked) return
    if (p.kind === 'straight') knobs.push({ step, key: 'length', lo: SPAN_LIMITS.min, hi: SPAN_LIMITS.max, tier: 0, weight: 1 })
    if (p.kind === 'transition')
      knobs.push({
        step,
        key: 'length',
        // Long enough to keep the flat ends it already has.
        lo: Math.max(minTransitionLength(d), p.flatEnd / 0.45),
        hi: SPAN_LIMITS.max,
        tier: 0,
        // A plain straight is the easier piece to reprint, so it goes first.
        weight: 1.25,
      })
    if (p.kind === 'curve') {
      // The inside wall has to stay a curve, not fold back on itself.
      const inside = (laneWidth(d.track) * p.lanes) / 2 + 20
      knobs.push({ step, key: 'radius', lo: Math.max(60, inside), hi: RADIUS_LIMITS.max, tier: 1, weight: 2 })
      knobs.push(
        p.angleDeg < 0
          ? { step, key: 'angleDeg', lo: -SWEEP_LIMITS.max, hi: -SWEEP_LIMITS.min, tier: 2, weight: 5 }
          : { step, key: 'angleDeg', lo: SWEEP_LIMITS.min, hi: SWEEP_LIMITS.max, tier: 2, weight: 5 },
      )
    }
  })
  return knobs
}

/** A millimetre of miss weighs the same as this many millimetres per radian of turn. */
const HEADING_SCALE = 100

/**
 * Close a loop by resizing what is already on it rather than adding a part.
 *
 * Both ends are on one run, so the track between them is a chain: drive it from
 * the first end and wherever you come out is set by every piece's length, radius
 * and sweep. The loop closes when you come out exactly on the first end, facing
 * back into it. That is three things to hit — two across the workplane and one
 * heading — so the solver looks for the fewest pieces whose sizes can hit them:
 *
 *  - **Lengths first.** A straight or transition only pushes the far end along
 *    its own axis, so two that run in different directions reach any point.
 *  - **Then radii**, which move a curve's far end without turning it.
 *  - **Sweeps only when the ends point different ways**, since only a sweep can
 *    turn the heading — and then as few of them as will do.
 *
 * Locked pieces are left alone, and every size stays inside what the parts
 * library could make.
 */
export function planAdjustment(pieces: Piece[], a: PortRef, b: PortRef, d: Dimensions): AdjustPlan {
  const gap = measureGap(pieces, a, b, d)
  if (!gap) return { ok: false, reason: 'Those two ends can no longer be measured.' }
  if (!gap.sameRun) return { ok: false, reason: 'The two ends are on separate runs.' }
  if (gap.lanesA !== gap.lanesB)
    return {
      ok: false,
      reason: `The ends are ${gap.lanesA}× and ${gap.lanesB}× wide, so joining them straight would step — a transition has to go between.`,
    }
  if (Math.abs(gap.rise) > FIT_GAP_TOLERANCE)
    return { ok: false, reason: 'One end sits higher than the other, and nothing on the loop can lift it.' }

  const steps = pathBetween(pieces, a, b)
  if (!steps) return { ok: false, reason: 'The track between those two ends could not be followed.' }
  const up = new THREE.Vector3(0, 1, 0)
  if (steps.some(({ piece }) => up.clone().applyQuaternion(pieceQuaternion(piece)).y < 0.9999))
    return { ok: false, reason: 'Part of the loop is tipped off the workplane.' }

  const base = steps.map((s) => traverse(s.piece, s.into, s.out, d))

  /** Drive the run with some sizes changed, and see how far out you come. */
  const miss = (knobs: Knob[], values: number[], heading: boolean): number[] => {
    const shapes = new Map<number, Piece>()
    knobs.forEach((k, i) => {
      const shape = shapes.get(k.step) ?? { ...steps[k.step].piece }
      shapes.set(k.step, { ...shape, [k.key]: values[i] })
    })
    let pose: Pose = { x: 0, z: 0, h: 0 }
    base.forEach((t, i) => {
      const shape = shapes.get(i)
      pose = compose(pose, shape ? traverse(shape, steps[i].into, steps[i].out, d) : t)
    })
    return heading ? [pose.x, pose.z, wrap(pose.h) * HEADING_SCALE] : [pose.x, pose.z]
  }

  const start = (k: Knob) => steps[k.step].piece[k.key]
  const closed = (r: number[]) =>
    Math.hypot(r[0], r[1]) <= FIT_GAP_TOLERANCE / 10 &&
    (r.length < 3 || Math.abs(r[2] / HEADING_SCALE) <= THREE.MathUtils.degToRad(FIT_ANGLE_TOLERANCE) / 10)

  /** Damped Newton on the chosen sizes, held inside their limits. */
  const solve = (knobs: Knob[], heading: boolean): number[] | null => {
    let v = knobs.map(start)
    let r = miss(knobs, v, heading)
    for (let iter = 0; iter < 40; iter++) {
      if (closed(r)) return v
      const J = knobs.map((k, j) => {
        const h = k.key === 'angleDeg' ? 1e-4 : 1e-3
        const w = v.slice()
        w[j] += h
        return miss(knobs, w, heading).map((x, i) => (x - r[i]) / h)
      })
      // Normal equations, k × k with k at most three: (JᵀJ + λI) Δ = −Jᵀr.
      const n = knobs.length
      const A = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => J[i].reduce((sum, x, m) => sum + x * J[j][m], 0) + (i === j ? 1e-9 : 0)),
      )
      const g = J.map((col) => -col.reduce((sum, x, m) => sum + x * r[m], 0))
      const delta = solveLinear(A, g)
      if (!delta) return null
      // Take the whole step if it helps, otherwise shorter ones until one does.
      let improved = false
      for (let t = 1; t > 1e-4; t /= 2) {
        const next = v.map((x, i) => clamp(x + t * delta[i], knobs[i].lo, knobs[i].hi))
        const rn = miss(knobs, next, heading)
        if (norm(rn) < norm(r)) {
          v = next
          r = rn
          improved = true
          break
        }
      }
      if (!improved) return null
    }
    return closed(r) ? v : null
  }

  const base0 = miss([], [], true)
  if (closed(base0)) return { ok: true, changes: [] }
  const headingOff = !closed([0, 0, base0[2]])

  const all = knobsOf(steps, d)
  // Where the ends already point the same way, lengths and radii alone can close
  // it and no heading needs solving. Otherwise a sweep has to be in every set —
  // one if that will do, with lengths making up the rest.
  const sweepless = [
    { tiers: [0], heading: false, sweeps: 0 },
    { tiers: [0, 1], heading: false, sweeps: 0 },
  ]
  const rounds: { tiers: number[]; heading: boolean; sweeps: number }[] = [
    ...(headingOff ? [] : sweepless),
    { tiers: [0, 2], heading: true, sweeps: 1 },
    { tiers: [0, 1, 2], heading: true, sweeps: 1 },
    { tiers: [0, 1, 2], heading: true, sweeps: MAX_ADJUSTED },
  ]

  for (const round of rounds) {
    const pool = all.filter((k) => round.tiers.includes(k.tier))
    for (let size = 1; size <= MAX_ADJUSTED; size++) {
      let best: { cost: number; knobs: Knob[]; values: number[] } | null = null
      for (const set of subsets(pool, size)) {
        const sweeps = set.filter((k) => k.key === 'angleDeg').length
        if (round.heading ? sweeps < 1 || sweeps > round.sweeps : sweeps > 0) continue
        const values = solve(set, round.heading)
        if (!values) continue
        // Rounded to a thousandth where that still makes the joint, as it nearly
        // always does — the figures land in the fields, so they should read cleanly.
        const tidied = values.map((x, i) => clamp(tidy(x), set[i].lo, set[i].hi))
        const chosen = closedLoosely(miss(set, tidied, true)) ? tidied : values
        const cost = set.reduce((sum, k, i) => sum + Math.abs(chosen[i] - start(k)) * k.weight, 0)
        if (!best || cost < best.cost) best = { cost, knobs: set, values: chosen }
      }
      if (best) return { ok: true, changes: toChanges(best.knobs, best.values, steps) }
    }
  }

  return {
    ok: false,
    reason: all.length
      ? `No ${MAX_ADJUSTED} pieces on the loop can be resized far enough to meet.`
      : 'Every piece between the two ends is locked or a junction, so nothing can be resized.',
  }
}

/** Within the tolerance a joint is made at — what the tool promises. */
const closedLoosely = (r: number[]) =>
  Math.hypot(r[0], r[1]) <= FIT_GAP_TOLERANCE && Math.abs(r[2] / HEADING_SCALE) <= THREE.MathUtils.degToRad(FIT_ANGLE_TOLERANCE)

const norm = (r: number[]) => Math.hypot(...r)

function toChanges(knobs: Knob[], values: number[], steps: Step[]): Adjustment[] {
  const byStep = new Map<number, Adjustment>()
  knobs.forEach((k, i) => {
    const p = steps[k.step].piece
    if (Math.abs(values[i] - p[k.key]) < 1e-9) return
    const change = byStep.get(k.step) ?? {
      pieceId: p.id,
      before: { length: p.length, radius: p.radius, angleDeg: p.angleDeg },
      after: { length: p.length, radius: p.radius, angleDeg: p.angleDeg },
    }
    change.after[k.key] = values[i]
    byStep.set(k.step, change)
  })
  return [...byStep.values()]
}

/** Every way of choosing `size` of the items, in order. */
function* subsets<T>(items: T[], size: number, from = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === size) {
    yield picked
    return
  }
  for (let i = from; i <= items.length - (size - picked.length); i++) yield* subsets(items, size, i + 1, [...picked, items[i]])
}

/** Gaussian elimination with partial pivoting. Null when the system is singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r
    if (Math.abs(M[pivot][c]) < 1e-12) return null
    ;[M[c], M[pivot]] = [M[pivot], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}
