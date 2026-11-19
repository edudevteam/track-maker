import * as THREE from 'three'
import type { Dimensions } from '../geometry/dimensions'
import type { Piece, PortId } from '../types'
import { transformToMate, worldPortFrame, type PieceShape } from './ports'
import { gentleRollLength, splitRoll } from '../geometry/bend'

/** Below this, in degrees, an end counts as level. */
const LEVEL = 0.05

/**
 * How far a Roll clipped onto `host`'s `port` must lean to bring the road back
 * level, degrees, in the Roll's own sense: positive leans left.
 *
 * The Roll's side A takes on whatever lean the end it joins has, so its own
 * frame is leaning by that much. Turning about the direction of travel by the
 * angle that puts the world's up back square to the road levels it. Nothing
 * else about the Roll moves its side A, so any Roll will do to measure with.
 */
export function levelOutRoll(host: Piece, port: PortId, d: Dimensions, roll: PieceShape): number {
  const seat = transformToMate(roll, 'a', worldPortFrame(host, port, d), d)
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(...seat.rotation, 'XYZ'))
  // The world's up, seen from inside the Roll.
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(turn.invert())
  // A Roll's far end turns about +X by minus its lean.
  return -THREE.MathUtils.radToDeg(Math.atan2(up.z, up.y))
}

/** How far `host`'s `port` leans to one side, degrees — 0 for an end that is level across. */
export function portLean(host: Piece, port: PortId, d: Dimensions, roll: PieceShape): number {
  const lean = levelOutRoll(host, port, d, roll)
  return Math.abs(lean) < LEVEL ? 0 : lean
}

/** What sizes a roll: the speed a car must hold, the gravity it feels, the print bed it must fit. */
export interface RollSizing {
  speed: number
  gravity: number
  /** Longest piece the print bed takes, mm. */
  bed: number
}

/** The longest piece a print bed `size` takes, mm — its longer side, less a margin. */
export function bedLength(size: readonly number[]): number {
  return Math.max(size[0], size[1]) - 10
}

/**
 * The Rolls that lead into a banked curve from `host`'s `port`: from however
 * far that end leans to however far the curve does — into the turn by its bank
 * angle. Long enough that the outside edge climbs gently and a car at the
 * sizing's speed stays down, and split into as many as fit the print bed, each
 * its share of one smooth curve. Empty when the end already leans to match, so
 * the curve clips straight on.
 *
 * Starting level on the floor, they take a solid base, so the low edge stays on
 * the floor and the bank after them stands on it too.
 */
export function rollIntoBank(
  host: Piece,
  port: PortId,
  curve: Pick<Piece, 'lanes' | 'angleDeg' | 'bankAngle' | 'color'>,
  d: Dimensions,
  sizing: RollSizing,
): Partial<Piece>[] {
  const probe: PieceShape = {
    kind: 'bend', bendMode: 'roll', rollDeg: 0, rollStart: 0, easeFrom: 0, easeTo: 1, lanes: curve.lanes, lanesB: curve.lanes,
    length: 150, slope: 0, base: 'none', radius: 150, angleDeg: 15, openLeft: false, openRight: false, bankAngle: 0,
    bankBase: false,
  }
  const now = -portLean(host, port, d, probe)
  const want = (curve.angleDeg < 0 ? -1 : 1) * Math.abs(curve.bankAngle)
  const change = want - now
  if (Math.abs(change) < LEVEL) return []
  const onFloor = Math.abs(now) < LEVEL && Math.abs(worldPortFrame(host, port, d).position.y) < 0.5
  const total = gentleRollLength(d, curve.lanes, now, want, sizing.speed, sizing.gravity)
  const parts = splitRoll(d, { lanes: curve.lanes, fromDeg: now, changeDeg: change, total, based: onFloor }, sizing.bed)
  return parts.map((part, k) => ({
    kind: 'bend',
    bendMode: 'roll',
    ...part,
    color: curve.color,
    name: `Roll into bank ${Math.round(Math.abs(want))}°${parts.length > 1 ? ` (${k + 1}/${parts.length})` : ''}`,
  }))
}
