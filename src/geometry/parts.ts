import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import type { Piece } from '../types'
import { arcFrames, straightFrames, sweepProfile } from './sweep'
import { trackProfile } from './trackProfile'
import { chamferedPlan, loftPrism, type LoftLevel } from './loft'

/** Geometry for a track piece, in its local frame (port `a` at the origin, +X down the centreline). */
export function buildTrackGeometry(piece: Piece, d: Dimensions): THREE.BufferGeometry {
  const profile = trackProfile(d, piece.lanes)
  const frames =
    piece.kind === 'straight'
      ? straightFrames(Math.max(1, piece.length))
      : arcFrames(Math.max(1, piece.radius), piece.angleDeg)
  return sweepProfile(profile, frames)
}

/**
 * Geometry for the connector clip, lofted so the countersinks are true cones
 * (drawing 14) rather than stepped bores. Local origin is the clip's `a` end,
 * length along +X, width across +Z, y = 0 at its underside.
 */
export function buildConnectorGeometry(d: Dimensions, length = d.connector.length): THREE.BufferGeometry {
  const c = d.connector
  const L = Math.max(4, length)
  const wingBaseY = Math.max(0.2, c.bodyHeight - c.wingThickness)
  const holeR = c.holeDia / 2
  const csR = Math.max(holeR + 0.2, c.counterSinkDia / 2)
  // Keep the cone inside the wing plate and above the straight inner ring.
  const csDepth = Math.min(c.counterSinkDepth, c.bodyHeight - wingBaseY - 0.01, c.bodyHeight - c.innerRingHeight)
  const coneStartY = c.bodyHeight - Math.max(0.05, csDepth)

  const body = chamferedPlan(L, c.bodyWidth, Math.min(c.endChamfer, c.bodyWidth / 2 - 0.01))
  const wing = chamferedPlan(L, c.wingSpan, Math.min(c.endChamfer, c.wingSpan / 2 - 0.01))

  // Chamfer on the wing's top outer edge (drawing 09, 135°), so the clip leads
  // into the track's undercut instead of catching on a square corner.
  const wingRise = Math.min(
    c.wingChamfer * Math.tan(THREE.MathUtils.degToRad(180 - c.wingAngleDeg)),
    c.wingThickness * 0.8,
  )
  const chamferTopWidth = Math.max(c.bodyWidth, c.wingSpan - 2 * c.wingChamfer)
  const wingTop = chamferedPlan(L, chamferTopWidth, Math.min(c.endChamfer, chamferTopWidth / 2 - 0.01))

  const coneY = Math.max(wingBaseY, Math.min(coneStartY, c.bodyHeight - wingRise))
  const chamferY = Math.max(coneY, c.bodyHeight - wingRise)
  // The bore is already opening out where the wing chamfer starts, so interpolate.
  const span = c.bodyHeight - coneY
  const rAtChamfer = span > 1e-6 ? holeR + (csR - holeR) * ((chamferY - coneY) / span) : csR

  const levels: LoftLevel[] = [
    { y: 0, outline: body, holeRadius: holeR },
    { y: wingBaseY, outline: body, holeRadius: holeR },
    { y: wingBaseY, outline: wing, holeRadius: holeR },
    { y: coneY, outline: wing, holeRadius: holeR },
    { y: chamferY, outline: wing, holeRadius: rAtChamfer },
    { y: c.bodyHeight, outline: wingTop, holeRadius: csR },
  ]

  return loftPrism(levels, holeCentres(d, L, csR))
}

/**
 * Countersink centres along the clip.
 *
 * The span is clamped so a countersink can never reach the clip's end edge —
 * tangency there makes the cap triangulation produce overlapping triangles and
 * a non-manifold mesh. `connectorHoleSpan` reports what was actually used.
 */
export function holeCentres(d: Dimensions, length: number, csRadius: number): number[] {
  const count = Math.max(0, Math.round(d.connector.holeCount))
  if (count === 0) return []
  if (count === 1) return [length / 2]
  const span = connectorHoleSpan(d, length, csRadius)
  const start = (length - span) / 2
  return Array.from({ length: count }, (_, i) => start + (span * i) / (count - 1))
}

/** Hole span after clamping, so callers can warn when the drawing value doesn't fit. */
export function connectorHoleSpan(d: Dimensions, length: number, csRadius: number): number {
  return Math.max(0, Math.min(d.connector.holeSpan, length - 2 * (csRadius + CS_EDGE_MARGIN)))
}

/** Material left between a countersink and the end of the clip. */
export const CS_EDGE_MARGIN = 1.0

/** Radius the countersink opens out to, after guarding against a too-small hole. */
export function counterSinkRadius(d: Dimensions): number {
  return Math.max(d.connector.holeDia / 2 + 0.2, d.connector.counterSinkDia / 2)
}

/** Lateral offsets of each lane's T-slot centre, in the piece's local frame. */
export function laneOffsets(piece: Piece, d: Dimensions): number[] {
  const pitch = d.track.channelTopWidth + 2 * d.track.wallThickness
  const lanes = Math.max(1, Math.round(piece.lanes))
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
export function connectorOffsets(piece: Piece, d: Dimensions): number[] {
  const offsets = laneOffsets(piece, d)
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
  return mergeGeometries(parts)
}

/** Minimal position-only merge — enough for the parts we build here. */
export function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  let offset = 0
  for (const g of geoms) {
    const src = g.index ? g.toNonIndexed() : g
    const pos = src.getAttribute('position')
    const nor = src.getAttribute('normal')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i))
      indices.push(offset + i)
    }
    offset += pos.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setIndex(indices)
  if (normals.length === positions.length) {
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  } else {
    out.computeVertexNormals()
  }
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}
