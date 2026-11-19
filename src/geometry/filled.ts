import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import { framePoint, mergeGeometries, sweepSections, type Frame, type Pt2 } from './sweep'
import { pieceWidth, slotCentres, slotMetrics, topOutline, trackProfile } from './trackProfile'
import { capGeometryAt, type Tri } from './section'
import { pocketWall } from './parts'

/**
 * Track swept along any path, with or without a solid base under it.
 *
 * The Bend, its Roll and the Banked curve are all the ordinary track section
 * carried along a path whose frames tip it — nose up, or rolled over to one
 * side. Without a base that is simply the section swept. With one, the road is
 * filled down to a flat base plane so the piece prints flat and stands on its
 * own; an end that sits on the base is an ordinary pocket, and one raised off
 * it has an opening up through the fill to each slot, so a clip can be pushed
 * in from below.
 */

/** A path: the frame at distance `s` along it, and the stations to build at between two distances. */
export interface TrackPath {
  frameAt: (s: number) => Frame
  stations: (s0: number, s1: number) => number[]
  length: number
  /** How far each end's connector pocket reaches in. */
  inset: number
}

/** A flat base: the plane `p · normal = level`. */
export interface BasePlane {
  normal: THREE.Vector3
  level: number
}

/**
 * Half-width of the opening cut up under each slot at a raised end. Wider than
 * the mouth so the clip's body clears it, and narrow enough to leave a wall
 * between neighbouring lanes and at the outside.
 */
export function baseAccessHalf(d: Dimensions): number {
  const { pitch, mouthHalf } = slotMetrics(d)
  return THREE.MathUtils.clamp(d.elevation.rampAccessWidth / 2, mouthHalf + 0.1, pitch / 2 - 1)
}

/**
 * The bottom of the section with the opening's corners on it, so every station
 * can be stitched to every other edge for edge. Right to left, as the section
 * runs. `slotted` notches each lane with its T-slot.
 */
export function bottomPoints(d: Dimensions, lanes: number, slotted: boolean): Pt2[] {
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
export function baseSection(d: Dimensions, lanes: number, slotted: boolean): Pt2[] {
  return [...topOutline(d.track, pieceWidth(d, lanes) / 2), ...bottomPoints(d, lanes, slotted)]
}

/**
 * The plain section swept along a path: slotted for a connector pocket at each
 * end, solid between, with a wall closing each pocket off where it stops. One
 * slotted run when the path is too short for a solid middle.
 */
export function sweepOpen(d: Dimensions, lanes: number, path: TrackPath): THREE.BufferGeometry {
  const slotted = trackProfile(d, lanes, true)
  const solid = trackProfile(d, lanes, false)
  const through = path.length - 2 * path.inset <= 0.5
  const zones = through
    ? [{ s0: 0, s1: path.length, section: slotted }]
    : [
        { s0: 0, s1: path.inset, section: slotted },
        { s0: path.inset, s1: path.length - path.inset, section: solid },
        { s0: path.length - path.inset, s1: path.length, section: slotted },
      ]
  const parts = zones.map((z, i) => {
    const frames = path.stations(z.s0, z.s1).map(path.frameAt)
    return sweepSections(frames.map(() => z.section), frames, i === 0, i === zones.length - 1, false)
  })
  if (!through) {
    const wall = pocketWall(d, lanes)
    parts.push(capGeometryAt(wall, path.frameAt(path.inset), true))
    parts.push(capGeometryAt(wall, path.frameAt(path.length - path.inset), false))
  }
  const geom = mergeGeometries(parts.filter((g) => (g.getIndex()?.count ?? 0) > 0))
  for (const p of parts) p.dispose()
  return geom
}

type V3 = THREE.Vector3

/**
 * The section swept along a path and filled down to a base plane.
 *
 * Built as rings of points, one per station, joined strip by strip. On the fill
 * a ring is the road's top with its underside dropped straight onto the base;
 * at a raised end the road's own underside is kept as well, since the openings
 * meet it there; an end on the base is simply the slotted section.
 *
 * `startLow` and `endLow` say which ends sit on the base. Where a tilted road
 * touches the base along one edge the dropped points land on the road's own,
 * and the faces that would join them come to nothing — they are left out.
 */
export function sweepFilled(
  d: Dimensions,
  lanes: number,
  path: TrackPath,
  base: BasePlane,
  startLow: boolean,
  endLow: boolean,
): THREE.BufferGeometry {
  const halfW = pieceWidth(d, lanes) / 2
  const { slotH, mouthH, outerHalf, mouthHalf } = slotMetrics(d)
  const acc = baseAccessHalf(d)
  const centres = slotCentres(d, lanes)
  const top = topOutline(d.track, halfW)
  const tris: [V3, V3, V3][] = []
  const { length, inset } = path

  const onRoad = (f: Frame, p: Pt2) => framePoint(f, p)
  const onBase = (f: Frame, x: number) => {
    const v = framePoint(f, { x, y: 0 })
    return v.addScaledVector(base.normal, base.level - v.dot(base.normal))
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
        // Split along alternate diagonals station by station, so a twisting
        // strip's panels lean neither way on the whole — see `sweepSections`.
        if (i % 2) quad(r0[k], r1[k], r1[j], r0[j])
        else quad(r0[j], r0[k], r1[k], r1[j])
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

  const lowSection = baseSection(d, lanes, true)
  const lowRing = (f: Frame) => lowSection.map((p) => onRoad(f, p))
  const floorXs = bottomPoints(d, lanes, false).map((p) => p.x)
  // The road's two bottom corners stay in: on a leaning road the walls lean
  // too, so a wall's foot is not straight above the base under it.
  const fillRing = (f: Frame) => [
    ...top.map((p) => onRoad(f, p)),
    onRoad(f, { x: floorXs[0], y: 0 }),
    ...floorXs.map((x) => onBase(f, x)),
    onRoad(f, { x: floorXs[floorXs.length - 1], y: 0 }),
  ]
  const raisedRing = (f: Frame): V3[] => {
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

  /** Where the fill meets a raised pocket: the slot's end and the opening's back. */
  const raisedStitch = (f: Frame) => {
    face(f, pocketWall(d, lanes))
    for (const c of centres) {
      const xs = [c - acc, c - mouthHalf, c + mouthHalf, c + acc]
      const lower = xs.map((x) => onBase(f, x))
      const upper = xs.map((x) => onRoad(f, { x, y: 0 }))
      for (let i = 0; i < 3; i++) quad(lower[i], lower[i + 1], upper[i + 1], upper[i])
    }
  }
  /** A raised end: the road's section, and below it panels of fill between the openings. */
  const raisedEnd = (f: Frame) => {
    polygon(f, baseSection(d, lanes, true))
    const edges = [halfW, ...centres.slice().reverse().flatMap((c) => [c + acc, c - acc]), -halfW]
    for (let i = 0; i < edges.length; i += 2) {
      const [x0, x1] = [edges[i], edges[i + 1]]
      quad(onBase(f, x0), onBase(f, x1), onRoad(f, { x: x1, y: 0 }), onRoad(f, { x: x0, y: 0 }))
    }
  }

  const through = length - 2 * inset <= 0.5
  if (through) {
    // All pocket: only both ends raised or both low can share one ring.
    const frames = path.stations(0, length).map(path.frameAt)
    const raised = !startLow || !endLow
    loft(frames.map(raised ? raisedRing : lowRing))
    for (const f of [frames[0], frames[frames.length - 1]]) {
      if (raised) raisedEnd(f)
      else polygon(f, lowSection)
    }
  } else {
    // A connector section can be turning too — in the middle of a long roll —
    // so it takes as many stations as the path asks for, not just its ends.
    const startRun = path.stations(0, inset).map(path.frameAt)
    const endRun = path.stations(length - inset, length).map(path.frameAt)
    const startFrames = [startRun[0], startRun[startRun.length - 1]]
    const endFrames = [endRun[0], endRun[endRun.length - 1]]
    loft(startRun.map(startLow ? lowRing : raisedRing))
    loft(endRun.map(endLow ? lowRing : raisedRing))
    loft(path.stations(inset, length - inset).map((s) => fillRing(path.frameAt(s))))
    if (startLow) {
      polygon(startFrames[0], lowSection)
      face(startFrames[1], pocketWall(d, lanes))
    } else {
      raisedEnd(startFrames[0])
      raisedStitch(startFrames[1])
    }
    if (endLow) {
      polygon(endFrames[1], lowSection)
      face(endFrames[0], pocketWall(d, lanes))
    } else {
      raisedEnd(endFrames[1])
      raisedStitch(endFrames[0])
    }
  }

  const geom = trianglesToGeometry(tris)
  orientConsistently(geom)
  return geom
}

/**
 * Triangles to geometry, leaving out any that have come to nothing — two of
 * their corners on the same spot, where a tilted road touches its base.
 */
function trianglesToGeometry(tris: [V3, V3, V3][]): THREE.BufferGeometry {
  const positions: number[] = []
  const same = (a: V3, b: V3) => a.distanceToSquared(b) < 1e-12
  for (const t of tris) {
    if (same(t[0], t[1]) || same(t[1], t[2]) || same(t[0], t[2])) continue
    for (const v of t) positions.push(v.x, v.y, v.z)
  }
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
export function orientConsistently(geom: THREE.BufferGeometry): void {
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
