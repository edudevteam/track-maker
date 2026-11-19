import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import {
  ensureOutwardWinding,
  framePoint,
  mergeGeometries,
  signedArea,
  sweepSections,
  type Frame,
  type Pt2,
} from './sweep'
import { pieceWidth, slotCentres, slotMetrics, topOutline, trackProfile } from './trackProfile'
import { capGeometryAt, type Tri } from './section'
import { pocketWall } from './parts'

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

import type { BendBase } from '../types'
export type { BendBase }

export interface BendSpec {
  lanes: number
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

/** Whether a bend can carry a solid base: it has to curve up, and not past the vertical. */
export function canHaveBase(spec: Pick<BendSpec, 'angleDeg'>): boolean {
  return spec.angleDeg > 0 && spec.angleDeg < MAX_BEND_ANGLE
}

/** The base actually built — none on a bend that cannot carry one. */
export function effectiveBase(spec: Pick<BendSpec, 'angleDeg' | 'base'>): BendBase {
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

/**
 * Half-width of the opening cut up under each slot at a base's angled end.
 * Wider than the mouth so the clip's body clears it, and narrow enough to leave
 * a wall between neighbouring lanes and at the outside.
 */
export function baseAccessHalf(d: Dimensions): number {
  const { pitch, mouthHalf } = slotMetrics(d)
  return THREE.MathUtils.clamp(d.elevation.rampAccessWidth / 2, mouthHalf + 0.1, pitch / 2 - 1)
}

/** Geometry for a bend, port `a` at the origin heading +X. */
export function buildBendGeometry(d: Dimensions, spec: BendSpec): THREE.BufferGeometry {
  const l = bendLayout(d, spec)
  const geom = l.base === 'none' ? buildOpen(d, spec.lanes, l) : buildBased(d, spec.lanes, l)
  ensureOutwardWinding(geom)
  geom.deleteAttribute('normal')
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  return geom
}

/** A bend that follows the road: the plain section swept along it, pockets at each end. */
function buildOpen(d: Dimensions, lanes: number, l: BendLayout): THREE.BufferGeometry {
  const slotted = trackProfile(d, lanes, true)
  const solid = trackProfile(d, lanes, false)
  const zones = [
    { s0: 0, s1: l.inset, section: slotted },
    { s0: l.inset, s1: l.length - l.inset, section: solid },
    { s0: l.length - l.inset, s1: l.length, section: slotted },
  ]
  const parts = zones.map((z, i) => {
    const frames = stations(l, z.s0, z.s1).map((s) => bendFrameAt(l, s))
    return sweepSections(frames.map(() => z.section), frames, i === 0, i === zones.length - 1, false)
  })
  // The pockets stop a connector section in from each end; the walls closing
  // them face back into each pocket.
  const wall = pocketWall(d, lanes)
  parts.push(capGeometryAt(wall, bendFrameAt(l, l.inset), true))
  parts.push(capGeometryAt(wall, bendFrameAt(l, l.length - l.inset), false))
  const geom = mergeGeometries(parts.filter((g) => (g.getIndex()?.count ?? 0) > 0))
  for (const p of parts) p.dispose()
  return geom
}

/**
 * The bottom of the section with the opening's corners on it, so every station
 * can be stitched to every other edge for edge. Right to left, as the section
 * runs. `slotted` notches each lane with its T-slot.
 */
function bottomPoints(d: Dimensions, lanes: number, slotted: boolean): Pt2[] {
  const halfW = pieceWidth(d, lanes) / 2
  const { slotH, mouthH, outerHalf, mouthHalf } = slotMetrics(d)
  const acc = baseAccessHalf(d)
  const pts: Pt2[] = [{ x: halfW, y: 0 }]
  const centres = slotCentres(d, lanes)
  for (let i = centres.length - 1; i >= 0; i--) {
    const c = centres[i]
    pts.push({ x: c + acc, y: 0 }, { x: c + mouthHalf, y: 0 })
    if (slotted) {
      pts.push(
        { x: c + mouthHalf, y: mouthH },
        { x: c + outerHalf, y: mouthH },
        { x: c + outerHalf, y: slotH },
        { x: c - outerHalf, y: slotH },
        { x: c - outerHalf, y: mouthH },
        { x: c - mouthHalf, y: mouthH },
      )
    }
    pts.push({ x: c - mouthHalf, y: 0 }, { x: c - acc, y: 0 })
  }
  pts.push({ x: -halfW, y: 0 })
  return pts
}

/** The full section with the opening's corners on its bottom. */
function baseSection(d: Dimensions, lanes: number, slotted: boolean): Pt2[] {
  return [...topOutline(d.track, pieceWidth(d, lanes) / 2), ...bottomPoints(d, lanes, slotted)]
}

type V3 = THREE.Vector3

/**
 * A bend up with a solid base under side A: level pocket on the base, the arc
 * and the slope filled down to it, and the angled pocket at the far end with an
 * opening up through the fill to each slot. A base under side B is the same
 * solid turned end for end.
 *
 * Built as rings of points, one per station, joined strip by strip. On the fill
 * a ring is the pitched road section with its underside dropped straight down
 * onto the base; at the angled pocket the road's own underside is kept as well,
 * since the openings meet it there.
 */
function buildBased(d: Dimensions, lanes: number, l: BendLayout): THREE.BufferGeometry {
  // Build it as a ramp climbing away from side A, then turn it round if the
  // base is under side B.
  const up: BendLayout = { ...l, before: 0, after: l.slope, arcStart: l.inset, base: 'a' }
  const halfW = pieceWidth(d, lanes) / 2
  const { slotH, mouthH, outerHalf, mouthHalf } = slotMetrics(d)
  const acc = baseAccessHalf(d)
  const centres = slotCentres(d, lanes)
  const top = topOutline(d.track, halfW)
  const tris: [V3, V3, V3][] = []

  const onRoad = (f: Frame, p: Pt2) => framePoint(f, p)
  const onBase = (f: Frame, x: number) => {
    const v = framePoint(f, { x, y: 0 })
    v.y = 0
    return v
  }
  const quad = (a: V3, b: V3, c: V3, e: V3) => {
    tris.push([a, b, e], [b, c, e])
  }
  const loft = (rings: V3[][]) => {
    for (let i = 0; i < rings.length - 1; i++) {
      const r0 = rings[i]
      const r1 = rings[i + 1]
      for (let j = 0; j < r0.length; j++) {
        const k = (j + 1) % r0.length
        quad(r0[j], r0[k], r1[k], r1[j])
      }
    }
  }
  const face = (f: Frame, faceTris: Tri[]) => {
    for (const t of faceTris) tris.push([onRoad(f, t[0]), onRoad(f, t[1]), onRoad(f, t[2])])
  }
  const polygon = (f: Frame, poly: Pt2[]) => {
    const idx = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p.x, p.y)), [])
    face(f, idx.map((t) => [poly[t[0]], poly[t[1]], poly[t[2]]] as Tri))
  }

  // Level pocket on the base: the ordinary slotted section.
  const lowSection = baseSection(d, lanes, true)
  const lowFrames = [0, up.inset].map((s) => bendFrameAt(up, s))
  loft(lowFrames.map((f) => lowSection.map((p) => onRoad(f, p))))
  polygon(lowFrames[0], lowSection)
  face(lowFrames[1], pocketWall(d, lanes))

  // The fill: the road's top, dropped straight down to the base at each station.
  const floorXs = bottomPoints(d, lanes, false).map((p) => p.x)
  const fillRing = (f: Frame) => [...top.map((p) => onRoad(f, p)), ...floorXs.map((x) => onBase(f, x))]
  const pocketStart = up.length - up.inset
  const fillFrames = stations(up, up.inset, pocketStart).map((s) => bendFrameAt(up, s))
  loft(fillFrames.map(fillRing))

  // The angled pocket: the road's section with its underside kept, the base
  // below it, and the openings between.
  const pocketRing = (f: Frame): V3[] => {
    const ring: V3[] = top.map((p) => onRoad(f, p))
    ring.push(onRoad(f, { x: halfW, y: 0 }), onBase(f, halfW))
    for (let i = centres.length - 1; i >= 0; i--) {
      const c = centres[i]
      ring.push(onBase(f, c + acc))
      for (const p of [
        { x: c + acc, y: 0 },
        { x: c + mouthHalf, y: 0 },
        { x: c + mouthHalf, y: mouthH },
        { x: c + outerHalf, y: mouthH },
        { x: c + outerHalf, y: slotH },
        { x: c - outerHalf, y: slotH },
        { x: c - outerHalf, y: mouthH },
        { x: c - mouthHalf, y: mouthH },
        { x: c - mouthHalf, y: 0 },
        { x: c - acc, y: 0 },
      ])
        ring.push(onRoad(f, p))
      ring.push(onBase(f, c - acc))
    }
    ring.push(onBase(f, -halfW), onRoad(f, { x: -halfW, y: 0 }))
    return ring
  }
  const pocketFrames = [pocketStart, up.length].map((s) => bendFrameAt(up, s))
  loft(pocketFrames.map(pocketRing))

  // Where the fill meets the angled pocket: a sliver of side wall each side
  // down to the road's underside, and for each lane the back of the opening
  // (upright, from the base to the road's underside) and of the slot (square
  // to the road, like any pocket wall).
  const f0 = pocketFrames[0]
  for (const x of [halfW, -halfW]) {
    tris.push([onRoad(f0, { x, y: d.track.totalHeight }), onRoad(f0, { x, y: 0 }), onBase(f0, x)])
  }
  face(f0, pocketWall(d, lanes))
  for (const c of centres) {
    const xs = [c - acc, c - mouthHalf, c + mouthHalf, c + acc]
    const lower = xs.map((x) => onBase(f0, x))
    const upper = xs.map((x) => onRoad(f0, { x, y: 0 }))
    for (let i = 0; i < 3; i++) quad(lower[i], lower[i + 1], upper[i + 1], upper[i])
  }

  // The far end: the road's section square to the slope, and below it upright
  // panels of fill between the openings.
  const f1 = pocketFrames[1]
  polygon(f1, baseSection(d, lanes, true))
  const edges = [halfW, ...centres.slice().reverse().flatMap((c) => [c + acc, c - acc]), -halfW]
  for (let i = 0; i < edges.length; i += 2) {
    const [x0, x1] = [edges[i], edges[i + 1]]
    quad(onBase(f1, x0), onBase(f1, x1), onRoad(f1, { x: x1, y: 0 }), onRoad(f1, { x: x0, y: 0 }))
  }

  const geom = trianglesToGeometry(tris)
  orientConsistently(geom)
  if (l.base === 'b') {
    // Turned end for end: the level end becomes side B at its port, the
    // angled end side A at the origin.
    const end = bendFrameAt(l, l.length)
    const m = new THREE.Matrix4()
      .makeTranslation(end.position.x, end.position.y, end.position.z)
      .multiply(new THREE.Matrix4().makeRotationZ(l.sign * l.turn))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    geom.applyMatrix4(m)
  }
  return geom
}

function trianglesToGeometry(tris: [V3, V3, V3][]): THREE.BufferGeometry {
  const positions: number[] = []
  for (const t of tris) for (const v of t) positions.push(v.x, v.y, v.z)
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i))
  return geom
}

/**
 * Turn triangles so every shared edge is walked one way by one of them and the
 * other way by the other — a consistent winding — working out from the first.
 * The solid is built from strips, caps and stitches whose windings were never
 * agreed, so this settles them; the outside is then picked by signed volume.
 */
function orientConsistently(geom: THREE.BufferGeometry): void {
  const pos = geom.getAttribute('position')
  const index = geom.getIndex()!
  const arr = index.array as Uint32Array | Uint16Array
  const n = arr.length / 3
  const q = (v: number) => Math.round(v * 1e4)
  const key = (i: number) => `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`
  const keys = Array.from({ length: arr.length }, (_, i) => key(arr[i]))
  const byEdge = new Map<string, number[]>()
  for (let t = 0; t < n; t++) {
    for (let e = 0; e < 3; e++) {
      const a = keys[t * 3 + e]
      const b = keys[t * 3 + ((e + 1) % 3)]
      const id = a < b ? `${a}|${b}` : `${b}|${a}`
      const list = byEdge.get(id)
      if (list) list.push(t)
      else byEdge.set(id, [t])
    }
  }
  /** Whether triangle t walks from key a to key b. */
  const walks = (t: number, a: string, b: string) => {
    for (let e = 0; e < 3; e++) if (keys[t * 3 + e] === a && keys[t * 3 + ((e + 1) % 3)] === b) return true
    return false
  }
  const flip = (t: number) => {
    const i = t * 3
    ;[arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]]
    ;[keys[i + 1], keys[i + 2]] = [keys[i + 2], keys[i + 1]]
  }
  const done = new Uint8Array(n)
  for (let seed = 0; seed < n; seed++) {
    if (done[seed]) continue
    done[seed] = 1
    const queue = [seed]
    while (queue.length) {
      const t = queue.pop()!
      for (let e = 0; e < 3; e++) {
        const a = keys[t * 3 + e]
        const b = keys[t * 3 + ((e + 1) % 3)]
        if (a === b) continue
        const id = a < b ? `${a}|${b}` : `${b}|${a}`
        for (const u of byEdge.get(id) ?? []) {
          if (u === t || done[u]) continue
          if (walks(u, a, b)) flip(u)
          done[u] = 1
          queue.push(u)
        }
      }
    }
  }
  index.needsUpdate = true
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
