import * as THREE from 'three'
import type { Dimensions } from '../geometry/dimensions'
import type { Piece, PortId } from '../types'
import { rollAt, rollLayout, type RollLayout } from '../geometry/bend'
import { bendSpecOf } from '../geometry/parts'
import { clipSeatY } from '../geometry/snapClip'

/**
 * A clip shaped for a joint whose road is turning through it.
 *
 * In the middle of a long roll the road keeps leaning over straight through
 * the joints between its pieces, so the T-slot turns along a clip's length —
 * a degree or two over 40mm, about the roll's low edge. A straight clip would
 * stand proud of the slot at its ends, out through the road on the outside
 * lanes. This works out how far the slot has turned at each point along the
 * clip, so the clip can be turned to match: printed with the same small twist,
 * it sits in the slot all the way along.
 */

const rollOf = (p: Piece | undefined, d: Dimensions): RollLayout | null =>
  p && p.kind === 'bend' && p.bendMode === 'roll' ? rollLayout(d, bendSpecOf(p)) : null

/** What a clip at a joint must turn by, or null where the road is not turning. */
export interface ClipTwist {
  /** Where the low edge the road turns about is, across the joint's port frame (its z). */
  pivotZ: number
  /** How far the slot has turned, about the port frame's x, at `x` along it from the joint. */
  turnAt: (x: number) => number
}

/**
 * How the slot turns through the joint at `owner`'s `port`, in that port's own
 * frame: x outward from the owner, y up off the road, z across.
 */
export function clipTwistAt(owner: Piece, port: PortId, neighbour: Piece | undefined, d: Dimensions): ClipTwist | null {
  if (port !== 'a' && port !== 'b') return null
  const mine = rollOf(owner, d)
  const link = owner.links[port]
  const theirs = rollOf(neighbour, d)
  if (!mine && !theirs) return null
  // A neighbour joined the other way round to how a run carries on is left
  // straight on its side — runs do not join that way.
  const carriesOn = link && ((port === 'b' && link.port === 'a') || (port === 'a' && link.port === 'b'))
  const other = carriesOn ? theirs : null

  /** The road's turn about the owner's direction of travel at `s` along it, past the joint. */
  const turn = (s: number): number => {
    if (port === 'b') {
      const here = mine ? rollAt(mine, Math.min(s, mine.length)) - rollAt(mine, mine.length) : 0
      const past = other && s > (mine?.length ?? owner.length) ? rollAt(other, s - (mine?.length ?? owner.length)) : 0
      return here + past
    }
    const here = mine ? rollAt(mine, Math.max(s, 0)) : 0
    const past = other && s < 0 ? rollAt(other, other.length + s) - rollAt(other, other.length) : 0
    return here + past
  }

  const roll = mine ?? other!
  const ownLength = mine?.length ?? owner.length
  const joint = port === 'b' ? ownLength : 0
  // Check the road really is turning through the joint before shaping anything.
  const span = 40
  const moving =
    Math.abs(turn(joint + span) - turn(joint)) > 1e-6 || Math.abs(turn(joint - span) - turn(joint)) > 1e-6
  if (!moving) return null

  // The port frame at side B points on along the piece; at side A it points
  // back, with the across axis flipped — a half turn about up.
  const b = port === 'b'
  return {
    pivotZ: b ? -roll.pivot : roll.pivot,
    turnAt: (x: number) => {
      const s = b ? joint + x : -x
      const delta = turn(s) - turn(joint)
      return b ? delta : -delta
    },
  }
}

/**
 * The clip `geometry`, in its own frame — its `a` end on its underside at the
 * origin, `length` along +x — turned to follow `twist` as it sits at lateral
 * offset `lane` in the port frame. Each point turns about the low edge by the
 * slot's turn where it is.
 */
export function twistClip(
  geometry: THREE.BufferGeometry,
  length: number,
  lane: number,
  twist: ClipTwist,
  d: Dimensions,
): THREE.BufferGeometry {
  const out = geometry.clone()
  const pos = out.getAttribute('position')
  const seat = clipSeatY(d)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // Into the port frame, turn about the pivot line, and back.
    const x = v.x - length / 2
    const y = v.y + seat
    const z = v.z + lane - twist.pivotZ
    const a = twist.turnAt(x)
    const c = Math.cos(a)
    const s = Math.sin(a)
    // A turn about +x: y' = y·cos − z·sin, z' = y·sin + z·cos.
    pos.setXYZ(i, v.x, y * c - z * s - seat, y * s + z * c + twist.pivotZ - lane)
  }
  pos.needsUpdate = true
  out.computeVertexNormals()
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}
