import * as THREE from 'three'
import type { Piece, PortId, Vec3 } from '../types'
import type { Dimensions } from '../geometry/dimensions'
import { junctionLayout } from '../geometry/junction'
import { bendFrameAt, bendLayout, rollEnd, rollFrameAt, rollLayout } from '../geometry/bend'
import { bankedFrameAt, bankedLayout, bankedPortA, bankedPortB } from '../geometry/banked'
import { bankedSpecOf, bendSpecOf } from '../geometry/parts'

/**
 * Every piece is authored in a local frame whose origin is port `a`, with the
 * centreline running along +X. Port `a` therefore sits at the origin facing -X
 * (outward), and port `b` sits at the far end facing along the exit tangent.
 * A junction's two side openings sit half way along, facing straight out of the
 * wall they replace — `l` towards -Z, which is the driver's left, and `r` the
 * other way.
 *
 * A port frame's +X axis always points *outward*, away from its own piece. Two
 * ports mate when their positions coincide and their outward axes oppose.
 */
export interface PortFrame {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

/** Whether a piece runs round a level arc — a curve, or a banked curve. */
export const isArc = (p: Pick<Piece, 'kind'>) => p.kind === 'curve' || p.kind === 'banked'

/**
 * The radius a level arc's port centreline runs on. A banked curve's is clamped
 * so its inside edge cannot cross the turn's centre, and ports, the car and the
 * geometry all have to agree on it.
 */
export function arcRadius(p: PieceShape, d: Dimensions): number {
  return p.kind === 'banked' ? bankedLayout(d, bankedSpecOf(p)).radius : p.radius
}

/**
 * The frame at `s` along a piece whose road is tipped or leant — a bend, in
 * pitch or roll, or a banked curve — in its local frame. Null for the rest,
 * whose road is level all the way.
 */
function tippedFrameAt(p: PieceShape, s: number, d: Dimensions) {
  if (p.kind === 'banked') return bankedFrameAt(bankedLayout(d, bankedSpecOf(p)), s)
  if (p.kind !== 'bend') return null
  if (p.bendMode === 'roll') return rollFrameAt(rollLayout(d, bendSpecOf(p)), s)
  return bendFrameAt(bendLayout(d, p), s)
}

/** How long a piece's centreline is, for the ones `tippedFrameAt` follows. */
function tippedLength(p: PieceShape, d: Dimensions): number | null {
  if (p.kind === 'banked') return bankedLayout(d, bankedSpecOf(p)).length
  if (p.kind !== 'bend') return null
  return p.bendMode === 'roll' ? rollLayout(d, bendSpecOf(p)).length : bendLayout(d, p).length
}

export function pieceMatrix(p: Piece): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...p.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  )
}

export function pieceQuaternion(p: Piece): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation, 'XYZ'))
}

/**
 * What a port frame is worked out from. Only the piece's shape matters, so a
 * part that has not been made yet — a recipe from the parts library, or the
 * candidate part for a gap — can be measured the same way a placed one is.
 */
export type PieceShape = Pick<
  Piece,
  | 'kind'
  | 'lanes'
  | 'lanesB'
  | 'length'
  | 'slope'
  | 'base'
  | 'radius'
  | 'angleDeg'
  | 'openLeft'
  | 'openRight'
  | 'bankAngle'
  | 'bankBase'
  | 'bendMode'
  | 'rollDeg'
  | 'rollStart'
  | 'easeFrom'
  | 'easeTo'
>

/**
 * The ways onto a piece, in the order they are offered. Only a junction has more
 * than two, and only for the walls it actually has open.
 */
export function portsOf(p: Pick<Piece, 'kind' | 'openLeft' | 'openRight'>): PortId[] {
  if (p.kind !== 'junction') return ['a', 'b']
  const out: PortId[] = ['a', 'b']
  if (p.openLeft) out.push('l')
  if (p.openRight) out.push('r')
  return out
}

/**
 * What a way onto a piece is called on screen. The two ends are sides A and B as
 * they always were; a junction's openings are named for the side of the road
 * they are on, which is the driver's left and right with port `b` ahead.
 */
export function portLabel(port: PortId): string {
  return port === 'a' ? 'side A' : port === 'b' ? 'side B' : port === 'l' ? 'the left' : 'the right'
}

/** Local (piece-space) frame of a port. */
export function localPortFrame(p: PieceShape, port: PortId, d: Dimensions): PortFrame {
  if (port === 'a') {
    // A banked curve leans at both its ends, so whatever joins on leans with it.
    if (p.kind === 'banked') {
      return { position: new THREE.Vector3(0, 0, 0), quaternion: bankedPortA(bankedLayout(d, bankedSpecOf(p))) }
    }
    return {
      position: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI),
    }
  }
  if (p.kind === 'banked') {
    const l = bankedLayout(d, bankedSpecOf(p))
    return { position: bankedFrameAt(l, l.length).position, quaternion: bankedPortB(l) }
  }
  // A roll's far end leans by its angle, so whatever joins there leans with it.
  if (p.kind === 'bend' && p.bendMode === 'roll') {
    const end = rollEnd(rollLayout(d, bendSpecOf(p)))
    return { position: end.position, quaternion: end.quaternion }
  }
  // A junction is a square whose side follows from its lanes, so all four of its
  // ports are read off that rather than off a length someone could have left
  // out of step with it.
  if (p.kind === 'junction') {
    const { half } = junctionLayout(d, { lanes: p.lanes, openLeft: p.openLeft, openRight: p.openRight })
    if (port === 'b') {
      return { position: new THREE.Vector3(half * 2, 0, 0), quaternion: new THREE.Quaternion() }
    }
    // Left is -Z, which is what `up × forward` comes to, and so which side of
    // the track the sweep puts the section's +x on.
    const side = port === 'l' ? -1 : 1
    return {
      position: new THREE.Vector3(half, 0, side * half),
      quaternion: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, (-side * Math.PI) / 2),
    }
  }
  // A bend's far end is pitched by its angle, so whatever joins there carries on at it.
  if (p.kind === 'bend') {
    const l = bendLayout(d, p)
    const end = bendFrameAt(l, l.length)
    return {
      position: end.position,
      quaternion: new THREE.Quaternion().setFromAxisAngle(Z_AXIS, l.sign * l.turn),
    }
  }
  if (!isArc(p)) {
    return { position: new THREE.Vector3(p.length, 0, 0), quaternion: new THREE.Quaternion() }
  }
  const r = arcRadius(p, d)
  const rad = THREE.MathUtils.degToRad(p.angleDeg)
  const sign = Math.sign(p.angleDeg) || 1
  const abs = Math.abs(rad)
  const cz = -sign * r
  return {
    position: new THREE.Vector3(r * Math.sin(abs), 0, cz + sign * r * Math.cos(abs)),
    quaternion: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, rad),
  }
}

/** World frame of a port. */
export function worldPortFrame(p: Piece, port: PortId, d: Dimensions): PortFrame {
  const local = localPortFrame(p, port, d)
  const q = pieceQuaternion(p)
  return {
    position: local.position.clone().applyQuaternion(q).add(new THREE.Vector3(...p.position)),
    quaternion: q.clone().multiply(local.quaternion),
  }
}

/** Unit vector pointing out of the port, away from its piece. */
export function portOutward(frame: PortFrame): THREE.Vector3 {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(frame.quaternion)
}

/** Centre of a piece's centreline, used to anchor the gizmo to the middle. */
export function pieceMidpoint(p: Piece, d: Dimensions): THREE.Vector3 {
  const q = pieceQuaternion(p)
  const origin = new THREE.Vector3(...p.position)
  const len = tippedLength(p, d)
  if (len !== null) return tippedFrameAt(p, len / 2, d)!.position.applyQuaternion(q).add(origin)
  if (!isArc(p)) {
    return new THREE.Vector3(p.length / 2, 0, 0).applyQuaternion(q).add(origin)
  }
  const r = arcRadius(p, d)
  const rad = THREE.MathUtils.degToRad(p.angleDeg) / 2
  const sign = Math.sign(p.angleDeg) || 1
  const abs = Math.abs(rad)
  const cz = -sign * r
  return new THREE.Vector3(r * Math.sin(abs), 0, cz + sign * r * Math.cos(abs))
    .applyQuaternion(q)
    .add(origin)
}

const FLIP = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI)

/**
 * Transform that places `piece` so that its `port` mates with `target`.
 * Returns the piece's world position and Euler rotation.
 */
export function transformToMate(
  piece: PieceShape,
  port: PortId,
  target: PortFrame,
  d: Dimensions,
): { position: Vec3; rotation: Vec3 } {
  // The mating port's world frame must face back down the target's outward axis.
  const desired = target.quaternion.clone().multiply(FLIP)
  const local = localPortFrame(piece, port, d)
  const q = desired.clone().multiply(local.quaternion.clone().invert())
  const offset = local.position.clone().applyQuaternion(q)
  const pos = target.position.clone().sub(offset)
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  return { position: [pos.x, pos.y, pos.z], rotation: [e.x, e.y, e.z] }
}

/** Centreline length of a piece in mm. A bend's is measured along the road. */
export function centrelineLength(p: Piece, d: Dimensions): number {
  const len = tippedLength(p, d)
  if (len !== null) return len
  return isArc(p) ? arcRadius(p, d) * Math.abs(THREE.MathUtils.degToRad(p.angleDeg)) : p.length
}

/**
 * Where a car coming in through `port` lands on a piece, and which way it is
 * then travelling. `overflow` is how far past the joint it had already gone.
 *
 * Coming in the side of a junction puts it half way along, facing port `b` — it
 * arrives across the run rather than along it, so there is no way it was already
 * heading to carry over.
 */
export function portEntry(
  p: Piece,
  port: PortId,
  d: Dimensions,
  overflow = 0,
): { s: number; dir: 1 | -1 } {
  const len = centrelineLength(p, d)
  if (port === 'a') return { s: overflow, dir: 1 }
  if (port === 'b') return { s: len - overflow, dir: -1 }
  return { s: len / 2, dir: 1 }
}

/**
 * Point, tangent and the road's up at arc-length `s` along a piece's
 * centreline, in world space. `s` runs from 0 at port `a` to
 * `centrelineLength` at port `b`. The up is square to the road: tipped on a
 * bend, leaning on a roll or a banked curve.
 */
export function sampleCentreline(
  p: Piece,
  s: number,
  d: Dimensions,
): { point: THREE.Vector3; tangent: THREE.Vector3; up: THREE.Vector3 } {
  const q = pieceQuaternion(p)
  const origin = new THREE.Vector3(...p.position)
  let local: THREE.Vector3
  let tan: THREE.Vector3
  let up = new THREE.Vector3(0, 1, 0)
  const tipped = tippedFrameAt(p, s, d)
  if (tipped) {
    local = tipped.position
    tan = tipped.tangent
    up = tipped.up
  } else if (!isArc(p)) {
    local = new THREE.Vector3(s, 0, 0)
    tan = new THREE.Vector3(1, 0, 0)
  } else {
    const r = arcRadius(p, d)
    const sign = Math.sign(p.angleDeg) || 1
    const t = s / r
    const cz = -sign * r
    local = new THREE.Vector3(r * Math.sin(t), 0, cz + sign * r * Math.cos(t))
    tan = new THREE.Vector3(Math.cos(t), 0, -sign * Math.sin(t))
  }
  return {
    point: local.applyQuaternion(q).add(origin),
    tangent: tan.applyQuaternion(q).normalize(),
    up: up.applyQuaternion(q).normalize(),
  }
}

/** Every piece reachable through links from `startId` — a connected assembly. */
export function collectGroup(pieces: Piece[], startId: string): Set<string> {
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const stack = [startId]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const p = byId.get(id)
    if (!p) continue
    for (const port of portsOf(p)) {
      const l = p.links[port]
      if (l && !seen.has(l.pieceId)) stack.push(l.pieceId)
    }
  }
  return seen
}

/**
 * Re-seat every piece joined to `rootId` so the joints still meet after its
 * shape changed. The edited piece keeps its place and the rest of the assembly
 * follows it, port by port — so lengthening a piece in the middle of a run
 * pushes the far side along instead of burying it.
 */
export function reflowFrom(pieces: Piece[], rootId: string, d: Dimensions): Piece[] {
  const seated = new Map(pieces.map((p) => [p.id, p]))
  if (!seated.has(rootId)) return pieces
  const placed = new Set([rootId])
  const queue = [rootId]

  while (queue.length) {
    const host = seated.get(queue.shift()!)!
    for (const port of portsOf(host)) {
      const link = host.links[port]
      const neighbour = link && seated.get(link.pieceId)
      if (!link || !neighbour || placed.has(neighbour.id)) continue
      const t = transformToMate(neighbour, link.port, worldPortFrame(host, port, d), d)
      seated.set(neighbour.id, { ...neighbour, position: t.position, rotation: t.rotation })
      placed.add(neighbour.id)
      queue.push(neighbour.id)
    }
  }
  return pieces.map((p) => seated.get(p.id)!)
}
