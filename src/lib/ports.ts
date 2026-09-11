import * as THREE from 'three'
import type { Piece, PortId, Vec3 } from '../types'
import type { Dimensions } from '../geometry/dimensions'
import { junctionLayout } from '../geometry/junction'

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
  'kind' | 'lanes' | 'lanesB' | 'length' | 'radius' | 'angleDeg' | 'openLeft' | 'openRight'
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
    return {
      position: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI),
    }
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
  if (p.kind !== 'curve') {
    return { position: new THREE.Vector3(p.length, 0, 0), quaternion: new THREE.Quaternion() }
  }
  const rad = THREE.MathUtils.degToRad(p.angleDeg)
  const sign = Math.sign(p.angleDeg) || 1
  const abs = Math.abs(rad)
  const cz = -sign * p.radius
  return {
    position: new THREE.Vector3(p.radius * Math.sin(abs), 0, cz + sign * p.radius * Math.cos(abs)),
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
export function pieceMidpoint(p: Piece): THREE.Vector3 {
  const q = pieceQuaternion(p)
  const origin = new THREE.Vector3(...p.position)
  if (p.kind !== 'curve') {
    return new THREE.Vector3(p.length / 2, 0, 0).applyQuaternion(q).add(origin)
  }
  const rad = THREE.MathUtils.degToRad(p.angleDeg) / 2
  const sign = Math.sign(p.angleDeg) || 1
  const abs = Math.abs(rad)
  const cz = -sign * p.radius
  return new THREE.Vector3(p.radius * Math.sin(abs), 0, cz + sign * p.radius * Math.cos(abs))
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

/** Centreline length of a piece in mm. */
export function centrelineLength(p: Piece): number {
  return p.kind === 'curve' ? p.radius * Math.abs(THREE.MathUtils.degToRad(p.angleDeg)) : p.length
}

/**
 * Where a car coming in through `port` lands on a piece, and which way it is
 * then travelling. `overflow` is how far past the joint it had already gone.
 *
 * Coming in the side of a junction puts it half way along, facing port `b` — it
 * arrives across the run rather than along it, so there is no way it was already
 * heading to carry over.
 */
export function portEntry(p: Piece, port: PortId, overflow = 0): { s: number; dir: 1 | -1 } {
  const len = centrelineLength(p)
  if (port === 'a') return { s: overflow, dir: 1 }
  if (port === 'b') return { s: len - overflow, dir: -1 }
  return { s: len / 2, dir: 1 }
}

/**
 * Point and tangent at arc-length `s` along a piece's centreline, in world space.
 * `s` runs from 0 at port `a` to `centrelineLength` at port `b`.
 */
export function sampleCentreline(p: Piece, s: number): { point: THREE.Vector3; tangent: THREE.Vector3 } {
  const q = pieceQuaternion(p)
  const origin = new THREE.Vector3(...p.position)
  let local: THREE.Vector3
  let tan: THREE.Vector3
  if (p.kind !== 'curve') {
    local = new THREE.Vector3(s, 0, 0)
    tan = new THREE.Vector3(1, 0, 0)
  } else {
    const sign = Math.sign(p.angleDeg) || 1
    const t = s / p.radius
    const cz = -sign * p.radius
    local = new THREE.Vector3(p.radius * Math.sin(t), 0, cz + sign * p.radius * Math.cos(t))
    tan = new THREE.Vector3(Math.cos(t), 0, -sign * Math.sin(t))
  }
  return {
    point: local.applyQuaternion(q).add(origin),
    tangent: tan.applyQuaternion(q).normalize(),
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
