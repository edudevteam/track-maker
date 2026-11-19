import * as THREE from 'three'
import type { Piece, PortId } from '../types'
import type { Dimensions } from '../geometry/dimensions'
import { clipSeatY, MAX_SUPPORT_PITCH, minSupportFloor } from '../geometry/snapClip'
import { localPortFrame, pieceMatrix, worldPortFrame } from './ports'
import { effectiveBase } from '../geometry/bend'

const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
/** How close to the workplane counts as standing on it, mm. */
const ON_FLOOR = 0.5


/**
 * Where the clip at a joint sits, in the piece's own frame: centred on the port
 * so half of it reaches into the neighbour, square to the end it is in, and
 * pushed up off the slot's floor against the undercut ceiling. On a sloped end
 * "up" is square to the road, not straight up.
 *
 * `origin` is the clip's `a` end on its underside; offset it along `lateral` for
 * each lane that takes one.
 */
export function clipPlacement(piece: Piece, port: PortId, length: number, d: Dimensions) {
  const frame = localPortFrame(piece, port, d)
  const outward = X_AXIS.clone().applyQuaternion(frame.quaternion)
  const lateral = Z_AXIS.clone().applyQuaternion(frame.quaternion)
  const up = Y_AXIS.clone().applyQuaternion(frame.quaternion)
  const origin = frame.position.clone().addScaledVector(outward, -length / 2).addScaledVector(up, clipSeatY(d))
  return { origin, quaternion: frame.quaternion, lateral }
}

/**
 * Whether this end of a piece is the angled top of a bend whose solid base
 * stands on the workplane — in which case the base holds the joint up itself.
 */
function heldByRamp(piece: Piece | undefined, port: PortId | undefined, d: Dimensions): boolean {
  if (!piece || piece.kind !== 'bend' || !port) return false
  const base = effectiveBase(piece)
  if (base === 'none' || port === base) return false
  return Math.abs(worldPortFrame(piece, base, d).position.y) < ON_FLOOR
}

/** What a support clip's leg has to reach: the floor below its origin, and its tilt. */
export interface SupportLeg {
  /** How far the workplane is below the clip's origin, mm. */
  floor: number
  /** How far the clip is tipped nose-up along its length, degrees. */
  pitchDeg: number
}

/**
 * The leg the clip at this joint needs, or null when an ordinary clip will do.
 *
 * A joint gets a support clip when it sits higher than Settings ▸ Dimensions ▸
 * Ramps and supports says is worth one, the track there is not rolled sideways
 * or steeper than a support is made for, and it is not the top of a ramp that is
 * already standing on the floor. A sloped joint gets a clip tipped to match,
 * with its leg still plumb and its foot flat.
 */
export function supportLeg(
  piece: Piece,
  port: PortId,
  neighbour: Piece | undefined,
  length: number,
  d: Dimensions,
): SupportLeg | null {
  const joint = worldPortFrame(piece, port, d)
  if (joint.position.y < d.elevation.supportMinHeight) return null
  if (heldByRamp(piece, port, d)) return null
  const link = piece.links[port]
  if (neighbour && link && heldByRamp(neighbour, link.port, d)) return null

  const place = clipPlacement(piece, port, length, d)
  const world = pieceMatrix(piece)
  const turn = new THREE.Quaternion().setFromRotationMatrix(world).multiply(place.quaternion)
  // Rolled sideways, a plumb leg would come out of the clip at a slant across it.
  if (Math.abs(Z_AXIS.clone().applyQuaternion(turn).y) > 1e-4) return null
  if (Y_AXIS.clone().applyQuaternion(turn).y <= 0) return null
  const pitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(X_AXIS.clone().applyQuaternion(turn).y, -1, 1)))
  if (Math.abs(pitchDeg) > MAX_SUPPORT_PITCH) return null

  const floor = place.origin.clone().applyMatrix4(world).y
  if (floor < minSupportFloor(d, length, pitchDeg)) return null
  return { floor, pitchDeg }
}
