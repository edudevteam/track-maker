import * as THREE from 'three'
import { connectorInset, laneWidth, type Dimensions } from './dimensions'
import { arcFramesBetween, ensureOutwardWinding, framePoint, signedArea, type Frame, type Pt2 } from './sweep'
import { pieceWidth, slotCentres, trackProfile } from './trackProfile'
import { baseAccessHalf, sweepFilled, sweepOpen, type TrackPath } from './filled'

/**
 * The banked curve: a level turn whose road leans in towards the inside, like
 * the banking on a speedway.
 *
 * It is the ordinary track section, rolled over by the bank angle and carried
 * round a level arc — the same lean the whole way, and the same at both ends.
 * So its ends are ordinary track, just leaning: a Roll brings the track up to
 * the lean and back down, another banked curve carries on round, and a plain
 * straight clipped on simply leans with it. Clips fit every joint as they do
 * anywhere else.
 *
 * It leans into the turn about its inside edge's foot. With a solid base it is
 * filled down to the floor under that edge, so it prints flat and holds itself
 * up, with an opening up through the fill to each slot at both ends.
 */

export interface BankedSpec {
  lanes: number
  /** How far the road leans in, degrees. */
  bankAngle: number
  /** Whether it is filled down to a flat base. */
  bankBase: boolean
  /** Centreline radius, mm. */
  radius: number
  /** Sweep, degrees. Positive turns left. */
  angleDeg: number
}

export const MIN_BANK_ANGLE = 1
export const MAX_BANK_ANGLE = 60

/** The tightest radius: the inside edge stays at least 20mm off the turn's centre. */
export function minBankedRadius(d: Dimensions, spec: Pick<BankedSpec, 'lanes'>): number {
  return Math.ceil((Math.max(1, Math.round(spec.lanes)) * laneWidth(d.track)) / 2 + 20)
}

/** A banked curve's numbers after clamping, shared by the ports, the car and the geometry. */
export function bankedLayout(d: Dimensions, spec: BankedSpec) {
  const lanes = Math.max(1, Math.round(spec.lanes))
  const radius = Math.max(spec.radius, minBankedRadius(d, spec))
  const sign = spec.angleDeg < 0 ? -1 : 1
  const sweep = Math.max(1e-3, Math.abs(spec.angleDeg || 1))
  const length = radius * THREE.MathUtils.degToRad(sweep)
  const bank = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(spec.bankAngle, MIN_BANK_ANGLE, MAX_BANK_ANGLE))
  // Leaning into a left turn drops the driver's left: a turn about the
  // direction of travel by a negative angle, as on a Roll.
  const roll = -sign * bank
  const halfW = pieceWidth(d, lanes) / 2
  // The inside edge, profile x — the driver's left on a left turn.
  const pivot = sign * halfW
  return {
    lanes, radius, sign, sweep, length, bank, roll, halfW, pivot,
    inset: connectorInset(d, length),
    base: spec.bankBase,
    /** How far the inside edge's foot sits below the centreline's: the base's level. */
    floor: -halfW * Math.sin(bank),
  }
}

export type BankedLayout = ReturnType<typeof bankedLayout>

/** The road's up, leaning by the bank about the direction of travel. */
function leaning(l: BankedLayout, tangent: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0).applyAxisAngle(tangent, l.roll)
}

/** The station `s` round the turn, in its local frame. */
export function bankedFrameAt(l: BankedLayout, s: number): Frame & { up: THREE.Vector3 } {
  const f = arcFramesBetween(l.radius, l.sign * l.sweep, s, s, 1)[0]
  return { position: f.position, tangent: f.tangent, up: leaning(l, f.tangent) }
}

/** Port `a`'s frame turn: facing back out of the piece, leaning by the bank. */
export function bankedPortA(l: BankedLayout): THREE.Quaternion {
  return new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), l.roll)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
}

/** Port `b`'s frame turn: round the sweep, leaning by the bank. */
export function bankedPortB(l: BankedLayout): THREE.Quaternion {
  return new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(l.sign * l.sweep))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), l.roll))
}

function bankedPath(l: BankedLayout): TrackPath {
  return {
    frameAt: (s) => bankedFrameAt(l, s),
    stations: (s0, s1) => {
      // One every 2.5° round the turn, as on a curve.
      const segs = Math.max(1, Math.ceil(THREE.MathUtils.radToDeg((s1 - s0) / l.radius) / 2.5))
      return Array.from({ length: segs + 1 }, (_, i) => s0 + ((s1 - s0) * i) / segs)
    },
    length: l.length,
    inset: l.inset,
  }
}

/** Geometry for a banked curve, port `a` at the origin heading +X. */
export function buildBankedGeometry(d: Dimensions, spec: BankedSpec): THREE.BufferGeometry {
  const l = bankedLayout(d, spec)
  const path = bankedPath(l)
  const geom = l.base
    ? sweepFilled(d, l.lanes, path, { normal: new THREE.Vector3(0, 1, 0), level: l.floor }, false, false)
    : sweepOpen(d, l.lanes, path)
  ensureOutwardWinding(geom)
  geom.deleteAttribute('normal')
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  return geom
}

/**
 * The volume, by Pappus and independently of the mesh: everything in the plane
 * across the turn at its start — the leaning section, the triangle of fill
 * under it, less the openings — each piece's area times how far round the
 * turn its centroid travels. The mesh chords the arc, so it comes out a hair
 * under, as a curve does.
 */
export function bankedVolume(d: Dimensions, spec: BankedSpec): number {
  const l = bankedLayout(d, spec)
  const f = bankedFrameAt(l, 0)
  // The turn's centre is off the driver's left on a left turn, the right on a right.
  const centre = new THREE.Vector3(0, 0, -l.sign * l.radius)
  const spin = THREE.MathUtils.degToRad(l.sweep)
  /** Area of a polygon lying in the start plane, and how far its centroid sits from the turn's axis. */
  const piece = (pts: THREE.Vector3[]) => {
    // Flatten into the start plane (x = 0): z across, y up.
    const flat: Pt2[] = pts.map((p) => ({ x: p.z, y: p.y }))
    let a = 0
    let cx = 0
    for (let i = 0; i < flat.length; i++) {
      const u = flat[i]
      const v = flat[(i + 1) % flat.length]
      const cross = u.x * v.y - v.x * u.y
      a += cross
      cx += (u.x + v.x) * cross
    }
    return { area: Math.abs(a / 2), reach: Math.abs(cx / (3 * a) - centre.z) }
  }
  const sweepOf = (pts: THREE.Vector3[]) => {
    const p = piece(pts)
    return p.area * p.reach * spin
  }
  const along = (pts: Pt2[]) => pts.map((p) => framePoint(f, p))
  const slottedRun = 2 * l.inset
  const solidRun = l.length - slottedRun
  // Each zone's section, by its share of the turn.
  const slotted = along(trackProfile(d, l.lanes, true))
  const solid = along(trackProfile(d, l.lanes, false))
  let v = (sweepOf(slotted) * slottedRun + sweepOf(solid) * solidRun) / l.length
  if (l.base) {
    const drop = (p: THREE.Vector3) => new THREE.Vector3(p.x, l.floor, p.z)
    const low = framePoint(f, { x: l.pivot, y: 0 })
    const high = framePoint(f, { x: -l.pivot, y: 0 })
    v += sweepOf([low, high, drop(high)])
    // The openings, under every slot, only through the two connector sections.
    const acc = baseAccessHalf(d)
    for (const c of slotCentres(d, l.lanes)) {
      const a = framePoint(f, { x: c - acc, y: 0 })
      const b = framePoint(f, { x: c + acc, y: 0 })
      v -= (sweepOf([a, b, drop(b), drop(a)]) * slottedRun) / l.length
    }
  }
  return v
}

/**
 * The speed at which a car on the bank needs no grip at all to hold its line —
 * gravity down the slope exactly balancing the turn: v = √(r·g·tan θ).
 */
export function balancedSpeed(l: BankedLayout, gravity: number): number {
  return Math.sqrt(Math.max(0, l.radius * gravity * Math.tan(l.bank)))
}

/** Signed area of a profile — re-exported for the audit. */
export const sectionArea = (p: Pt2[]) => Math.abs(signedArea(p))
