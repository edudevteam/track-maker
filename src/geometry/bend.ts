import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import { ensureOutwardWinding, signedArea, type Frame, type Pt2 } from './sweep'
import { pieceWidth, slotCentres, topOutline, trackProfile } from './trackProfile'
import { baseAccessHalf, sweepFilled, sweepOpen, type TrackPath } from './filled'

/**
 * The bend: a curve in the vertical plane, so the track changes angle going up
 * or down rather than turning left or right. With a solid base it is also the
 * ramp.
 *
 * Along it: a straight connector section at each end, the arc, and optionally a
 * straight run at the angle — the slope — on whichever side is angled. The
 * section is kept square to the road the whole way, pitched with it, so the
 * T-slot at an angled end is the full depth the clip needs and a straight
 * clipped on there simply carries on at that angle.
 *
 * Positive `angleDeg` bends up (a dip, concave side up), negative bends down
 * (a crest).
 *
 * Without a base it follows the road, the same thickness as any other piece.
 * With one, it is filled down to a flat base level with one end — side A for a
 * ramp that climbs away from the floor, side B for one that comes down onto
 * it — so it prints flat and stands on its own. Only a bend up has an underside
 * to fill. Under the angled pocket an opening runs from the base up to each
 * slot, so a clip can be pushed in from below: straight up, which slides it a
 * little along the tilted slot as it goes home.
 */

import type { BendBase, BendMode } from '../types'
export type { BendBase, BendMode }
export { baseAccessHalf }

export interface BendSpec {
  lanes: number
  /** Pitch tips the nose up or down; roll leans the road over to one side. */
  mode: BendMode
  /** Roll only — how far it leans, degrees. Positive leans left, dropping the driver's left side. */
  rollDeg: number
  /** Roll only — the run the twist takes between the two connector sections, mm. */
  length: number
  /** Roll only — how far the road already leans at side A, degrees. Positive leans left. */
  rollStart?: number
  /** Roll only — the stretch of one smooth curve this piece covers, when it is one of several. */
  easeFrom?: number
  easeTo?: number
  /** Radius of the arc, measured to the piece's underside. */
  radius: number
  /** How far the track's angle changes, degrees. Positive bends up. */
  angleDeg: number
  /** Straight run at the angle between the arc and the angled end, mm. */
  slope: number
  /** Which end the solid base is level with, if any. */
  base: BendBase
}

/** The most a single bend may turn. Twice the steepest slope, so one piece goes from climbing to falling. */
export const MAX_BEND_ANGLE = 90

/** The tightest radius a bend can take: the top of the walls still has room on the inside of a dip. */
export function minBendRadius(d: Dimensions): number {
  return Math.ceil(d.track.totalHeight + 10)
}

/**
 * Whether a bend can carry a solid base. A pitch has to curve up, and not past
 * the vertical; a roll always can — its low edge stays on the floor.
 */
export function canHaveBase(spec: Pick<BendSpec, 'angleDeg'> & Partial<Pick<BendSpec, 'mode'>>): boolean {
  if (spec.mode === 'roll') return true
  return spec.angleDeg > 0 && spec.angleDeg < MAX_BEND_ANGLE
}

/** The base actually built — none on a bend that cannot carry one. */
export function effectiveBase(spec: Pick<BendSpec, 'angleDeg' | 'base'> & Partial<Pick<BendSpec, 'mode'>>): BendBase {
  return canHaveBase(spec) ? spec.base : 'none'
}

/** A bend's numbers after clamping, shared by the ports, the car and the geometry. */
export function bendLayout(d: Dimensions, spec: Pick<BendSpec, 'radius' | 'angleDeg' | 'slope' | 'base'>) {
  const inset = Math.max(d.assembly.connectorInset, 0.5)
  const radius = Math.max(spec.radius, minBendRadius(d))
  const sign = spec.angleDeg < 0 ? -1 : 1
  const turn = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Math.abs(spec.angleDeg), 0.5, MAX_BEND_ANGLE))
  const arc = radius * turn
  const slope = Math.max(0, spec.slope || 0)
  const base = effectiveBase(spec)
  // The slope goes on the angled side: after the arc, unless the base is under
  // side B, in which case side A is the angled one.
  const before = base === 'b' ? slope : 0
  const after = base === 'b' ? 0 : slope
  const arcStart = inset + before
  const length = 2 * inset + before + arc + after
  return { inset, radius, sign, turn, arc, slope, before, after, arcStart, length, base }
}

export type BendLayout = ReturnType<typeof bendLayout>

/**
 * The station `s` along a bend's underside, in its local frame: where it is,
 * which way the road runs, and which way is square up off it.
 */
export function bendFrameAt(l: BendLayout, s: number): Frame & { up: THREE.Vector3 } {
  const { arcStart, radius: r, sign, arc } = l
  if (s <= arcStart) {
    return {
      position: new THREE.Vector3(s, 0, 0),
      tangent: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
    }
  }
  const t = Math.min(s - arcStart, arc) / r
  const position = new THREE.Vector3(arcStart + r * Math.sin(t), sign * r * (1 - Math.cos(t)), 0)
  const tangent = new THREE.Vector3(Math.cos(t), sign * Math.sin(t), 0)
  const up = new THREE.Vector3(-sign * Math.sin(t), Math.cos(t), 0)
  const past = s - arcStart - arc
  if (past > 0) position.addScaledVector(tangent, past)
  return { position, tangent, up }
}

/**
 * Stations from `s0` to `s1`: both ends, the arc's ends if they fall between,
 * and one every 2.5° round the arc, as a curve has. A straight needs only its ends.
 */
function stations(l: BendLayout, s0: number, s1: number): number[] {
  const a0 = l.arcStart
  const a1 = l.arcStart + l.arc
  const out = [s0]
  const lo = Math.max(s0, a0)
  const hi = Math.min(s1, a1)
  // A micron of arc is rounding where two zones meet, not arc to build.
  if (hi - lo > 1e-6) {
    if (lo > s0 + 1e-9) out.push(lo)
    const segs = Math.max(4, Math.ceil(THREE.MathUtils.radToDeg((hi - lo) / l.radius) / 2.5))
    for (let i = 1; i < segs; i++) out.push(lo + ((hi - lo) * i) / segs)
    if (hi < s1 - 1e-9) out.push(hi)
  }
  out.push(s1)
  return out
}

/** Geometry for a bend, port `a` at the origin heading +X. */
export function buildBendGeometry(d: Dimensions, spec: BendSpec): THREE.BufferGeometry {
  if (spec.mode === 'roll') return buildRollGeometry(d, spec)
  const l = bendLayout(d, spec)
  const geom = l.base === 'none' ? sweepOpen(d, spec.lanes, pitchPath(l)) : buildBased(d, spec.lanes, l)
  return finish(geom)
}

function finish(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  ensureOutwardWinding(geom)
  geom.deleteAttribute('normal')
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  return geom
}

/** A bend's path, for the sweeps to follow. */
function pitchPath(l: BendLayout): TrackPath {
  return {
    frameAt: (s) => bendFrameAt(l, s),
    stations: (s0, s1) => stations(l, s0, s1),
    length: l.length,
    inset: l.inset,
  }
}

/**
 * A bend up with a solid base under side A: level pocket on the base, the arc
 * and the slope filled down to it, and the angled pocket at the far end raised
 * off it. A base under side B is the same solid turned end for end.
 */
function buildBased(d: Dimensions, lanes: number, l: BendLayout): THREE.BufferGeometry {
  const up: BendLayout = { ...l, before: 0, after: l.slope, arcStart: l.inset, base: 'a' }
  const geom = sweepFilled(d, lanes, pitchPath(up), { normal: new THREE.Vector3(0, 1, 0), level: 0 }, true, false)
  if (l.base === 'b') {
    // Turned end for end: the level end becomes side B at its port, the
    // angled end side A at the origin.
    const end = bendFrameAt(l, l.length)
    geom.applyMatrix4(
      new THREE.Matrix4()
        .makeTranslation(end.position.x, end.position.y, end.position.z)
        .multiply(new THREE.Matrix4().makeRotationZ(l.sign * l.turn))
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI)),
    )
  }
  return geom
}

// ── Roll ────────────────────────────────────────────────────────────────────

/** The most a roll may lean the track over, degrees. */
export const MAX_ROLL = 60
/** The shortest twist between a roll's two connector sections, mm. */
export const MIN_TWIST = 20

/** Smootherstep: 0 to 1 with its rate, and its rate's rate, nothing at both ends. */
export const smootherstep = (u: number) => {
  const t = THREE.MathUtils.clamp(u, 0, 1)
  return t * t * t * (t * (6 * t - 15) + 10)
}

/** How much of a roll's twist its rate takes to build up, and again to die away. */
export const ROLL_EASE = 0.25

/**
 * How far through a roll's twist the lean is, 0 to 1, a share `x` of the way
 * along it. The rate the road leans over builds up smoothly over the first
 * `ROLL_EASE` of the run, holds steady through the middle — a steady roll, so
 * the outside edge climbs at one steady grade — and dies away smoothly over the
 * last. The rate's own change starts and stops at nothing, so there is no jolt.
 */
export function rollRamp(x: number, a = ROLL_EASE): number {
  const u = THREE.MathUtils.clamp(x, 0, 1)
  const c = 1 / (1 - a)
  // Smoothstep's running total from 0 to t.
  const rise = (t: number) => t * t * t - (t * t * t * t) / 2
  if (u < a) return c * a * rise(u / a)
  if (u > 1 - a) return 1 - c * a * rise((1 - u) / a)
  return c * (a / 2 + (u - a))
}

/**
 * A roll's numbers after clamping.
 *
 * A roll is a straight whose road leans over. `rollStart` is how far the road
 * already leans where side A joins — 0 off level track — and `rollDeg` how much
 * further it leans by side B; positive leans left. It turns about its low edge,
 * the side the road leans towards, so that edge stays where it is the whole way
 * and a run of rolls keeps it on the floor.
 *
 * A long roll is several pieces sharing one twist: `easeFrom` to `easeTo` is
 * the stretch of the whole run this piece is, 0 to 1 for a roll in one piece.
 * The run holds level for a connector section at its very start and at its
 * very end, where it meets ordinary track, and twists steadily everywhere
 * between — straight through the joints between its own pieces, so the road
 * never pauses there.
 */
export function rollLayout(
  d: Dimensions,
  spec: Pick<BendSpec, 'lanes' | 'rollDeg' | 'length' | 'base'> & Partial<Pick<BendSpec, 'rollStart' | 'easeFrom' | 'easeTo'>>,
) {
  const inset = Math.max(d.assembly.connectorInset, 0.5)
  const twist = Math.max(MIN_TWIST, spec.length || 0)
  const length = 2 * inset + twist
  const rad = THREE.MathUtils.degToRad
  const change = rad(THREE.MathUtils.clamp(spec.rollDeg, -2 * MAX_ROLL, 2 * MAX_ROLL))
  // A roll saved before rolls knew where they started: one levelling out to a
  // base under B started at minus its own lean.
  const startDeg = spec.rollStart ?? (spec.base === 'b' ? -spec.rollDeg : 0)
  const leanIn = rad(startDeg)
  const leanOut = leanIn + change
  const halfW = pieceWidth(d, spec.lanes) / 2
  // The low edge: the side the road leans to at whichever end leans most.
  const most = Math.abs(leanIn) >= Math.abs(leanOut) ? leanIn : leanOut
  const side = Math.sign(most) || Math.sign(change) || 1
  // Its place across the section, profile x: +x is the driver's left.
  const pivot = side * halfW
  const easeFrom = THREE.MathUtils.clamp(spec.easeFrom ?? 0, 0, 1)
  const easeTo = THREE.MathUtils.clamp(spec.easeTo ?? 1, Math.min(1, easeFrom + 1e-6), 1)
  // The whole run this piece is part of, and where along it the piece starts.
  const run = length / (easeTo - easeFrom)
  const offset = easeFrom * run
  return {
    inset, twist, length, change, leanIn, leanOut, halfW, pivot, easeFrom, easeTo, run, offset,
    based: spec.base !== 'none',
    /** Which ends sit level on the floor, rather than leaning off it. */
    startLow: Math.abs(leanIn) < 1e-6,
    endLow: Math.abs(leanOut) < 1e-6,
  }
}

export type RollLayout = ReturnType<typeof rollLayout>

/** How far through the whole run's lean it is at `sigma` along the run, 0 to 1. */
function runShare(l: RollLayout, sigma: number): number {
  const span = l.run - 2 * l.inset
  if (span <= 1e-9) return sigma > l.run / 2 ? 1 : 0
  return rollRamp((sigma - l.inset) / span)
}

/** How far through its own lean a piece is at `s` along it, 0 to 1. */
function rollShare(l: RollLayout, s: number): number {
  const a = runShare(l, l.offset)
  const b = runShare(l, l.offset + l.length)
  if (b - a < 1e-12) return 0
  return (runShare(l, l.offset + THREE.MathUtils.clamp(s, 0, l.length)) - a) / (b - a)
}

/** The roll at `s`, as the turn about the direction of travel from side A, radians. */
export function rollAt(l: RollLayout, s: number): number {
  // Leaning left drops the driver's left side: a turn about +X by a negative angle.
  return -l.change * rollShare(l, s)
}

/** How far the road leans at `s`, radians, against straight up. Positive leans left. */
export function rollLeanAt(l: RollLayout, s: number): number {
  return l.leanIn + l.change * rollShare(l, s)
}

/** The station `s` along a roll, in its local frame. */
export function rollFrameAt(l: RollLayout, s: number): Frame & { up: THREE.Vector3 } {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rollAt(l, s))
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(turn)
  const tangent = new THREE.Vector3(1, 0, 0)
  const lateral = up.clone().cross(tangent).normalize()
  // The pivot edge stays where it is; the bottom of the centreline swings about it.
  const pivot = new THREE.Vector3(s, 0, -l.pivot)
  return { position: pivot.addScaledVector(lateral, -l.pivot), tangent, up }
}

/** A roll's far end: where it is, and its turn about the direction of travel. */
export function rollEnd(l: RollLayout) {
  return {
    position: rollFrameAt(l, l.length).position,
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rollAt(l, l.length)),
  }
}

function rollPath(l: RollLayout): TrackPath {
  return {
    frameAt: (s) => rollFrameAt(l, s),
    stations: (s0, s1) => {
      // The road may be turning anywhere along a piece — through its connector
      // sections too, inside a long run — so stations go closely the whole way,
      // except where it is not turning at all.
      const turning = Math.abs(rollAt(l, s1) - rollAt(l, s0)) > 1e-9
      const segs = turning ? Math.max(8, Math.ceil((s1 - s0) / 4)) : 1
      return Array.from({ length: segs + 1 }, (_, i) => s0 + ((s1 - s0) * i) / segs)
    },
    length: l.length,
    inset: l.inset,
  }
}

/**
 * The floor under a roll, in its own frame: the side A frame leans by
 * `leanIn`, so straight up is turned back the other way — through the low
 * edge, which is on it.
 */
function rollFloor(l: RollLayout) {
  const normal = new THREE.Vector3(0, Math.cos(l.leanIn), Math.sin(l.leanIn))
  return { normal, level: normal.dot(new THREE.Vector3(0, 0, -l.pivot)) }
}

/** Geometry for a roll, port `a` at the origin heading +X. */
function buildRollGeometry(d: Dimensions, spec: BendSpec): THREE.BufferGeometry {
  const l = rollLayout(d, spec)
  const path = rollPath(l)
  if (!l.based) return finish(sweepOpen(d, spec.lanes, path))
  return finish(sweepFilled(d, spec.lanes, path, rollFloor(l), l.startLow, l.endLow))
}

/**
 * A roll's volume from its sections, independently of the mesh. Turning a
 * section about the direction of travel keeps its area, so without a base it
 * is each section's area times its run. With one, each station adds the
 * triangle of fill under the leaning road — its underside rises across its
 * width from the low edge at the sine of the lean — less, through a connector
 * section that leans, the opening under each slot.
 */
export function rollVolume(d: Dimensions, spec: BendSpec): number {
  const l = rollLayout(d, spec)
  const slotted = area(trackProfile(d, spec.lanes, true))
  const solid = area(trackProfile(d, spec.lanes, false))
  if (!l.based) return slotted * 2 * l.inset + solid * l.twist
  const W = 2 * l.halfW
  const fill = (lean: number) => 0.5 * W * W * Math.abs(Math.cos(lean) * Math.sin(lean))
  const acc = baseAccessHalf(d)
  const openings = (lean: number) =>
    slotCentres(d, spec.lanes).reduce(
      (sum, c) => sum + 2 * acc * Math.abs(Math.cos(lean)) * Math.abs(l.pivot - c) * Math.abs(Math.sin(lean)),
      0,
    )
  /** Simpson's rule over one stretch of the piece. */
  const over = (s0: number, s1: number, at: (lean: number) => number) => {
    const n = 200
    let sum = 0
    for (let k = 0; k <= n; k++) {
      const w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2
      sum += w * at(rollLeanAt(l, s0 + ((s1 - s0) * k) / n))
    }
    return (sum * (s1 - s0)) / (3 * n)
  }
  // An end that sits on the floor is an ordinary pocket; one that leans has
  // its openings — the mesh decides by the lean at the end itself.
  const pocket = (low: boolean) => (lean: number) => slotted + fill(lean) - (low ? 0 : openings(lean))
  return (
    over(0, l.inset, pocket(l.startLow)) +
    over(l.inset, l.length - l.inset, (lean) => solid + fill(lean)) +
    over(l.length - l.inset, l.length, pocket(l.endLow))
  )
}

/** The steepest an outside edge may climb on an automatic roll, as a grade. */
export const MAX_EDGE_GRADE = 0.15

/**
 * What a roll does to the outside edge of the road, which climbs as the road
 * leans over: how far it climbs, its steepest grade, and the fastest a car can
 * take it there without lifting off where the climb rounds over — where the
 * road falls away under it faster than gravity can bring it down, v²·κ = g.
 */
export function rollEdge(l: RollLayout, gravity: number) {
  const W = 2 * l.halfW
  const n = 600
  const h = Array.from({ length: n + 1 }, (_, k) => W * Math.abs(Math.sin(rollLeanAt(l, (l.length * k) / n))))
  const dx = l.length / n
  let grade = 0
  let bend = 0
  for (let k = 1; k < n; k++) {
    grade = Math.max(grade, Math.abs(h[k + 1] - h[k - 1]) / (2 * dx))
    bend = Math.max(bend, Math.abs(h[k + 1] - 2 * h[k] + h[k - 1]) / (dx * dx))
  }
  return {
    climb: Math.abs(h[n] - h[0]),
    grade,
    /** mm/s — as fast as a car can go before the rounding over lifts it. */
    liftSpeed: bend > 1e-12 ? Math.sqrt(gravity / bend) : Infinity,
  }
}

/**
 * How long a roll must be all told — both level connector sections included —
 * for the outside edge to climb no steeper than `MAX_EDGE_GRADE` and for a car
 * at `speed` to stay down where the climb rounds over, from leaning `fromDeg`
 * to `toDeg` on track `lanes` wide. The steady middle climbs at 1/(1 − ease)
 * of the average; the sharpest rounding over is 1.5/(ease·(1 − ease)) of the
 * climb over the twist squared.
 */
export function gentleRollLength(
  d: Dimensions,
  lanes: number,
  fromDeg: number,
  toDeg: number,
  speed: number,
  gravity: number,
) {
  const W = pieceWidth(d, lanes)
  const rad = THREE.MathUtils.degToRad
  const climb = W * Math.abs(Math.abs(Math.sin(rad(toDeg))) - Math.abs(Math.sin(rad(fromDeg))))
  const a = ROLL_EASE
  // A little under the limit: the outside edge climbs by the sine of the lean,
  // which is steepest where the lean is least.
  const byGrade = climb / ((1 - a) * MAX_EDGE_GRADE * 0.95)
  const bySpeed = Math.sqrt((1.5 * climb * speed * speed) / (a * (1 - a) * Math.max(1, gravity)))
  const inset = Math.max(d.assembly.connectorInset, 0.5)
  return Math.ceil((Math.max(150, byGrade, bySpeed) + 2 * inset) / 10) * 10
}

/**
 * A roll `total` long all told, split into as few pieces as fit a print bed
 * `bed` long, each the same length and each its stretch of one steady twist.
 */
export function splitRoll(
  d: Dimensions,
  roll: { lanes: number; fromDeg: number; changeDeg: number; total: number; based: boolean },
  bed: number,
): Pick<BendSpec, 'lanes' | 'rollDeg' | 'rollStart' | 'length' | 'easeFrom' | 'easeTo' | 'base'>[] {
  const inset = Math.max(d.assembly.connectorInset, 0.5)
  const total = Math.max(2 * inset + MIN_TWIST, roll.total)
  const count = Math.max(1, Math.ceil(total / Math.max(2 * inset + MIN_TWIST, bed) - 1e-9))
  const each = total / count
  const span = total - 2 * inset
  const share = (sigma: number) => (span <= 1e-9 ? 0 : rollRamp((sigma - inset) / span))
  return Array.from({ length: count }, (_, k) => {
    const s0 = each * k
    const s1 = each * (k + 1)
    return {
      lanes: roll.lanes,
      rollStart: roll.fromDeg + roll.changeDeg * share(s0),
      rollDeg: roll.changeDeg * (share(s1) - share(s0)),
      length: each - 2 * inset,
      easeFrom: k / count,
      easeTo: (k + 1) / count,
      base: roll.based ? 'a' : 'none',
    }
  })
}

/** How far a section's centroid sits above its underside. */
function centroidHeight(p: Pt2[]): number {
  let a = 0
  let cy = 0
  for (let i = 0; i < p.length; i++) {
    const u = p[i]
    const v = p[(i + 1) % p.length]
    const cross = u.x * v.y - v.x * u.y
    a += cross
    cy += (u.y + v.y) * cross
  }
  return cy / (3 * a)
}

const area = (p: Pt2[]) => Math.abs(signedArea(p))

/**
 * A bend's volume from its sections. Without a base: the two pockets and the
 * slope as straight runs, the arc by Pappus — the solid section times the
 * distance its centroid travels. The mesh chords that arc, so it comes out a
 * hair under, as a curve does.
 *
 * With a base, worked out independently of the mesh, from the side: for each
 * point across the track, the area under the path its top traces, down to the
 * base and out to the far end's face; summed across the width; less the slots
 * and the openings.
 */
export function bendVolume(d: Dimensions, spec: BendSpec, chorded = false): number {
  if (spec.mode === 'roll') return rollVolume(d, spec)
  const l = bendLayout(d, spec)
  const slotted = trackProfile(d, spec.lanes, true)
  const solid = trackProfile(d, spec.lanes, false)
  if (l.base === 'none') {
    return (
      area(slotted) * 2 * l.inset +
      area(solid) * (l.slope + l.turn * (l.radius - l.sign * centroidHeight(solid)))
    )
  }

  const up: BendLayout = { ...l, before: 0, after: l.slope, arcStart: l.inset, base: 'a' }
  const halfW = pieceWidth(d, spec.lanes) / 2
  const outline = topOutline(d.track, halfW)
  // Finely, for the true shape; or at the mesh's own stations, which straight
  // chords between should reproduce to the last digit.
  const at = chorded
    ? [...stations(up, 0, up.length - up.inset), up.length]
    : Array.from({ length: 4001 }, (_, i) => (up.length * i) / 4000)
  const path = at.map((s) => bendFrameAt(up, s))
  const end = path[path.length - 1]
  /** Side-on area under the path traced by a point `h` up off the road. */
  const sideArea = (h: number) => {
    const poly: Pt2[] = [{ x: 0, y: 0 }]
    for (const f of path) poly.push({ x: f.position.x + f.up.x * h, y: f.position.y + f.up.y * h })
    poly.push({ x: end.position.x, y: end.position.y }, { x: end.position.x, y: 0 })
    return area(poly)
  }
  // Across the width the top is a straight line between outline corners, so
  // integrate each run on its own with Simpson's rule.
  let sum = 0
  for (let i = 0; i < outline.length - 1; i++) {
    const p = outline[i]
    const q = outline[i + 1]
    const w = q.x - p.x
    if (Math.abs(w) < 1e-12) continue
    const steps = 16
    let s = 0
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const weight = k === 0 || k === steps ? 1 : k % 2 ? 4 : 2
      s += weight * sideArea(p.y + (q.y - p.y) * t)
    }
    sum += (w / (3 * steps)) * s
  }
  const slotArea = area(solid) - area(slotted)
  const pocketStart = bendFrameAt(up, up.length - up.inset).position
  const openings =
    slotCentres(d, spec.lanes).length *
    2 *
    baseAccessHalf(d) *
    (end.position.x - pocketStart.x) *
    ((pocketStart.y + end.position.y) / 2)
  return sum - 2 * slotArea * l.inset - openings
}
