import * as THREE from 'three'
import { connectorInset, type Dimensions } from './dimensions'
import type { Piece, PortId, VehicleSize } from '../types'
import {
  arcFramesBetween,
  arcLength,
  ensureOutwardWinding,
  mergeGeometries,
  signedArea,
  straightFramesBetween,
  sweepSections,
  type Frame,
} from './sweep'
import { slotCentres, slotMetrics, trackProfile } from './trackProfile'
import { at, capGeometryAt, ribbon, type Tri } from './section'
import { buildTransitionGeometry } from './transition'
import { buildJunctionGeometry, type JunctionSpec } from './junction'
import { seatVehicleGeometry } from './vehicle'

export { mergeGeometries }

/** What a junction piece asks the geometry for. Its size follows from its lanes. */
export function junctionSpecOf(piece: Pick<Piece, 'lanes' | 'openLeft' | 'openRight'>): JunctionSpec {
  return { lanes: piece.lanes, openLeft: piece.openLeft, openRight: piece.openRight }
}

/** Geometry for a track piece, in its local frame (port `a` at the origin, +X down the centreline). */
export function buildTrackGeometry(piece: Piece, d: Dimensions): THREE.BufferGeometry {
  if (piece.kind === 'transition') {
    return buildTransitionGeometry(d, {
      lanesA: piece.lanes,
      lanesB: piece.lanesB,
      length: Math.max(1, piece.length),
      cornerRadius: piece.cornerRadius,
      flatEnd: piece.flatEnd,
    })
  }
  if (piece.kind === 'junction') return buildJunctionGeometry(d, junctionSpecOf(piece))
  return buildPlainGeometry(d, piece)
}

/** A straight or a curve, as the distance along its centreline from end to end. */
export function plainLength(piece: Pick<Piece, 'kind' | 'length' | 'radius' | 'angleDeg'>): number {
  return piece.kind === 'curve'
    ? arcLength(Math.max(1, piece.radius), piece.angleDeg)
    : Math.max(1, piece.length)
}

/** Stations along the part of a plain piece's centreline between two distances. */
function plainFrames(
  piece: Pick<Piece, 'kind' | 'radius' | 'angleDeg'>,
  s0: number,
  s1: number,
): Frame[] {
  return piece.kind === 'curve'
    ? arcFramesBetween(Math.max(1, piece.radius), piece.angleDeg, s0, s1)
    : straightFramesBetween(s0, s1)
}

/** A solid middle shorter than this is not worth keeping, mm. */
const MIN_SOLID_MIDDLE = 0.5

/**
 * The zones a plain straight or curve is built from.
 *
 * The connector slot is a pocket at each end rather than a channel running the
 * whole way — the clip only ever reaches `connectorInset` in, and a slot cut
 * past that is a hole in the underside that holds nothing and weakens the piece.
 * So the section carries its slots for the first and last inset and is solid
 * slab in between, with a wall stitched across each pocket where it stops.
 *
 * Exported so the geometry audit can integrate the section area along the length
 * independently of the triangulation.
 */
export function plainZones(
  d: Dimensions,
  piece: Pick<Piece, 'kind' | 'lanes' | 'length' | 'radius' | 'angleDeg'>,
) {
  const length = plainLength(piece)
  const inset = connectorInset(d, length)
  const slotted = trackProfile(d, piece.lanes, true)
  const solid = trackProfile(d, piece.lanes, false)
  // Two pockets that meet leave no solid middle, so the slot runs the whole way
  // and the piece is a single sweep again — which is all a piece that short has
  // room for anyway.
  const through = length - 2 * inset <= MIN_SOLID_MIDDLE
  const zones = through
    ? [{ s0: 0, s1: length, section: slotted }]
    : [
        { s0: 0, s1: inset, section: slotted },
        { s0: inset, s1: length - inset, section: solid },
        { s0: length - inset, s1: length, section: slotted },
      ]
  return { length, inset, through, slotted, solid, zones }
}

/**
 * The wall that closes a pocket off where it stops short of the middle. Only the
 * slot cross-sections are filled — the rest of that plane is solid on both sides.
 *
 * The mouth is narrower than the undercut, so each slot is two stacked bands
 * rather than one rectangle, and the ledge between them is an edge the swept
 * sides share.
 */
function pocketWall(d: Dimensions, lanes: number): Tri[] {
  const { slotH, mouthH, outerHalf, mouthHalf } = slotMetrics(d)
  const tris: Tri[] = []
  for (const c of slotCentres(d, lanes)) {
    // The mouth, bottom face up to where the undercut ledges out.
    ribbon([at(c - mouthHalf, 0), at(c + mouthHalf, 0)], [at(c - mouthHalf, mouthH), at(c + mouthHalf, mouthH)], tris)
    // The undercut above it. Its lower edge is split at the mouth so it meets
    // the ledge either side without leaving an edge split down one face.
    ribbon(
      [at(c - outerHalf, mouthH), at(c - mouthHalf, mouthH), at(c + mouthHalf, mouthH), at(c + outerHalf, mouthH)],
      [at(c - outerHalf, slotH), at(c + outerHalf, slotH)],
      tris,
    )
  }
  return tris
}

/** Geometry for a straight or a curve, port `a` at the origin and +X down the centreline. */
function buildPlainGeometry(d: Dimensions, piece: Piece): THREE.BufferGeometry {
  const z = plainZones(d, piece)
  const last = z.zones.length - 1

  // Each zone is capped only where it meets the outside world; the two pocket
  // walls between them are built below, so the winding is settled once for the
  // whole assembled solid.
  const parts = z.zones.map((zone, i) => {
    const frames = plainFrames(piece, zone.s0, zone.s1)
    return sweepSections(
      frames.map(() => zone.section),
      frames,
      i === 0,
      i === last,
      false,
    )
  })

  if (!z.through) {
    const wall = pocketWall(d, piece.lanes)
    // The `a` pocket is behind its wall and the `b` pocket ahead of its own, so
    // the two faces look opposite ways.
    parts.push(capGeometryAt(wall, plainFrames(piece, z.inset, z.inset)[0], true))
    parts.push(
      capGeometryAt(wall, plainFrames(piece, z.length - z.inset, z.length - z.inset)[0], false),
    )
  }

  const geom = mergeGeometries(parts.filter((g) => (g.getIndex()?.count ?? 0) > 0))
  ensureOutwardWinding(geom)
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  for (const p of parts) p.dispose()
  return geom
}

/**
 * The volume a plain piece comes out to: each zone's section area times its own
 * run along the centreline.
 *
 * Exact for a straight. For a curve it is the true revolve — the section is
 * symmetric about the centreline, so by Pappus the centroid travels exactly the
 * centreline distance — and the built mesh chords that revolve, so it comes out
 * a little under. A straight's must be exact.
 */
export function plainVolume(d: Dimensions, piece: Piece): number {
  return plainZones(d, piece).zones.reduce(
    (sum, zone) => sum + Math.abs(signedArea(zone.section)) * (zone.s1 - zone.s0),
    0,
  )
}

/**
 * Width in lanes at one way onto a piece. Only a transition differs end to end —
 * a junction is the same width on all four of its sides.
 */
export function lanesAt(piece: Pick<Piece, 'kind' | 'lanes' | 'lanesB'>, port: PortId): number {
  const second = piece.kind === 'transition' && port === 'b'
  return Math.max(1, Math.round(second ? piece.lanesB : piece.lanes))
}

/** Lateral offsets of each lane's T-slot centre at one end, in the piece's local frame. */
export function laneOffsets(piece: Piece, d: Dimensions, port: PortId = 'a'): number[] {
  const pitch = d.track.channelTopWidth + 2 * d.track.wallThickness
  const lanes = lanesAt(piece, port)
  const half = (pitch * lanes) / 2
  return Array.from({ length: lanes }, (_, i) => -half + pitch * (i + 0.5))
}

/**
 * Lateral offsets of the clips fitted at one port.
 *
 * The underside keeps a T-slot on every lane centre, but a joint only ever gets
 * two clips: the outermost lanes. Three or more clips add print time and
 * assembly fiddle without holding the joint any straighter.
 */
export function connectorOffsets(piece: Piece, d: Dimensions, port: PortId = 'a'): number[] {
  const offsets = laneOffsets(piece, d, port)
  if (offsets.length <= 2) return offsets
  return [offsets[0], offsets[offsets.length - 1]]
}

/** A simple die-cast-style car for the gravity preview. Sized to the channel width. */
export function buildCarGeometry(d: Dimensions): THREE.BufferGeometry {
  const w = d.track.channelTopWidth * 0.78
  const l = w * 1.9
  const bodyH = w * 0.42
  const cabinH = w * 0.34

  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.BoxGeometry(l, bodyH, w)
  body.translate(0, bodyH / 2, 0)
  parts.push(body)

  const cabin = new THREE.BoxGeometry(l * 0.46, cabinH, w * 0.82)
  cabin.translate(-l * 0.04, bodyH + cabinH / 2, 0)
  parts.push(cabin)

  const wheelR = bodyH * 0.55
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(wheelR, wheelR, w * 0.14, 16)
      wheel.rotateX(Math.PI / 2)
      wheel.translate(sx * l * 0.32, wheelR * 0.6, (sz * w) / 2)
      parts.push(wheel)
    }
  }
  // Seated the same way a loaded model is — on the road, centred across it, nose
  // down +X — so both can be scaled to a typed size by the same rule.
  const car = mergeGeometries(parts)
  seatVehicleGeometry(car)
  return car
}

/**
 * The placeholder: a plain box the size of a real vehicle, seated the same way.
 *
 * It is built at full size rather than at any particular scale, so its own size
 * is a real vehicle's size and a scale divides straight into it — which is the
 * whole point of it. What rides the track is this box scaled down.
 */
export function buildBlockGeometry(real: VehicleSize): THREE.BufferGeometry {
  const block = new THREE.BoxGeometry(real.length, real.height, real.width)
  seatVehicleGeometry(block)
  return block
}

