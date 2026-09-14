import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import { ensureOutwardWinding, type Pt2 } from './sweep'
import { slotMetrics } from './trackProfile'

/**
 * The connector clip — the only one every joint takes. The relief-slotted design
 * measured off `_models/SR2_Single_230116.stl`, printed and confirmed to fit.
 *
 * It grips across its width rather than its height. Its wings are wider than the
 * track's undercut, and two slots cut through its full height let the outer arms
 * flex in as it goes home and press back out against the slot. The wings step out
 * square from the body onto a flat ledge; their ends carry the lead-in chamfer
 * while the body stays square-ended; their tips run straight up before
 * chamfering in to the top.
 *
 * Built face by face rather than lofted. The square body and the chamfered wing
 * share their end planes, and a loft's corresponding-vertex walls cannot meet
 * there without leaving a crack, so the wing's end face is fanned down onto the
 * body's corners instead. Every triangle is emitted with a hint of which way is
 * out of the solid, so the winding is consistent wherever it came from.
 *
 * The local frame: the clip's `a` end at x = 0, length along
 * +X, width across Z centred on 0, y = 0 on the underside.
 */

/** Segments per hole. */
const HOLE_SEGMENTS = 32
/** Material kept between a countersink and the end of the clip, mm. */
const END_MARGIN = 1

type V3 = [number, number, number]

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * The snap clip's dimensions after clamping, so a hand-edited set can never fold
 * the solid back on itself. The audit and the volume check read the same numbers
 * the builder uses. `length` overrides the clip's own, for a joint that takes a
 * shorter one.
 */
export function snapClipShape(d: Dimensions, length = d.snapClip.length) {
  const s = d.snapClip
  const L = Math.max(8, length)
  const H = Math.max(0.6, s.height)
  const hw = Math.max(2, s.wingSpan / 2)
  const hb = clamp(s.bodyWidth / 2, 1, hw - 0.1)
  const stepY = clamp(s.wingStep, 0.2, H - 0.3)
  const tipY = clamp(stepY + s.wingTip, stepY + 0.05, H - 0.05)
  // The end chamfer has to leave the wing's end face wider than the body's, or
  // the ledge would pinch to nothing where the two meet.
  const endChamfer = clamp(s.endChamfer, 0.05, Math.min(hw - hb - 0.02, L / 2 - 0.05))

  const holeR = Math.max(0.2, s.holeDia / 2)
  const stripHalf = clamp(s.centreStripWidth / 2, holeR + 0.3, hb - 0.3)
  const slotWidth = clamp(s.slotWidth, 0, hb - 0.2 - stripHalf)
  const slotOuter = stripHalf + slotWidth
  const bridge = clamp(s.endBridge, 0.2, L / 2 - 1)
  const slots = slotWidth >= 0.05 && L - 2 * bridge >= 0.5
  const csR = clamp(s.counterSinkDia / 2, holeR + 0.1, stripHalf - 0.2)
  // The top chamfer must leave the corner cut a real edge and the top wider than the slots.
  const inset = clamp(s.wingChamfer, 0, Math.min(endChamfer - 0.02, hw - slotOuter - 0.3))

  const boreY = clamp(s.boreHeight, 0.05, H - 0.15)
  const coneTop = clamp(boreY + s.coneHeight, boreY + 0.05, H - 0.05)

  // Holes sit `holeInset` in from each end with the rest spread evenly between —
  // so a 70mm clip with three puts one on the joint, and a 40mm clip with two
  // puts one in each piece. As many as fit without two countersinks touching.
  const inHole = clamp(s.holeInset, csR + END_MARGIN, L / 2)
  const fits = Math.max(1, Math.floor((L - 2 * inHole) / (2 * csR + 0.4)) + 1)
  const n = Math.min(Math.max(0, Math.round(s.holeCount)), fits)
  const holes =
    n === 0 ? [] : n === 1 ? [L / 2] : Array.from({ length: n }, (_, k) => inHole + ((L - 2 * inHole) * k) / (n - 1))

  return {
    L, H, hw, hb, stepY, tipY, endChamfer, inset,
    holeR, csR, boreY, coneTop, holes,
    stripHalf, slotWidth, slotOuter, bridge, slots,
  }
}

/**
 * The wing outline in plan, its long sides pulled in by `inset`. At 0 it is the
 * wing itself; at the chamfer it is the top face, whose corner cuts stay on the
 * same 45° lines so the chamfer runs round the ends as well as the sides.
 */
function wingOutline(L: number, h: number, c: number, inset: number): Pt2[] {
  const e = c - inset
  const w = h - inset
  return [
    { x: e, y: -w },
    { x: L - e, y: -w },
    { x: L, y: -h + c },
    { x: L, y: h - c },
    { x: L - e, y: w },
    { x: e, y: w },
    { x: 0, y: h - c },
    { x: 0, y: -h + c },
  ]
}

function circle(cx: number, r: number): Pt2[] {
  return Array.from({ length: HOLE_SEGMENTS }, (_, i) => {
    const a = (i / HOLE_SEGMENTS) * Math.PI * 2
    return { x: cx + r * Math.cos(a), y: r * Math.sin(a) }
  })
}

export function buildSnapClipGeometry(d: Dimensions, length = d.snapClip.length): THREE.BufferGeometry {
  const s = snapClipShape(d, length)
  const { L, H, hw, hb, stepY, tipY, endChamfer: c } = s
  const positions: number[] = []

  /** One triangle, turned if need be so its normal agrees with `out`. */
  const emit = (a: V3, b: V3, p: V3, out: V3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = p[0] - a[0], vy = p[1] - a[1], vz = p[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const verts = nx * out[0] + ny * out[1] + nz * out[2] < 0 ? [a, p, b] : [a, b, p]
    for (const v of verts) positions.push(v[0], v[1], v[2])
  }
  const at = (p: Pt2, y: number): V3 => [p.x, y, p.y]

  /** A horizontal face: a plan contour less any loops inside it. */
  const flat = (contour: Pt2[], holes: Pt2[][], y: number, up: boolean) => {
    const tris = THREE.ShapeUtils.triangulateShape(
      contour.map((p) => new THREE.Vector2(p.x, p.y)),
      holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y))),
    )
    const all = [...contour, ...holes.flat()]
    const out: V3 = [0, up ? 1 : -1, 0]
    for (const t of tris) emit(at(all[t[0]], y), at(all[t[1]], y), at(all[t[2]], y), out)
  }

  /**
   * The walls joining one plan loop at `y0` to its counterpart at `y1`, vertex
   * for vertex. Loops run counter-clockwise; an `inner` loop bounds a void, so
   * its walls face in towards it. Edges listed in `skip` are built elsewhere.
   */
  const walls = (lo: Pt2[], y0: number, hi: Pt2[], y1: number, inner: boolean, skip: number[] = []) => {
    for (let j = 0; j < lo.length; j++) {
      if (skip.includes(j)) continue
      const k = (j + 1) % lo.length
      const dx = lo[k].x - lo[j].x
      const dy = lo[k].y - lo[j].y
      const out: V3 = inner ? [-dy, 0, dx] : [dy, 0, -dx]
      emit(at(lo[j], y0), at(lo[k], y0), at(hi[k], y1), out)
      emit(at(lo[j], y0), at(hi[k], y1), at(hi[j], y1), out)
    }
  }

  const body: Pt2[] = [
    { x: 0, y: -hb },
    { x: L, y: -hb },
    { x: L, y: hb },
    { x: 0, y: hb },
  ]
  const wing = wingOutline(L, hw, c, 0)
  const top = wingOutline(L, hw, c, s.inset)
  const slots: Pt2[][] = s.slots
    ? [
        [-s.slotOuter, -s.stripHalf],
        [s.stripHalf, s.slotOuter],
      ].map(([y0, y1]) => [
        { x: s.bridge, y: y0 },
        { x: L - s.bridge, y: y0 },
        { x: L - s.bridge, y: y1 },
        { x: s.bridge, y: y1 },
      ])
    : []

  // Underside and top, each less the slots and the holes at that height.
  flat(body, [...slots, ...s.holes.map((cx) => circle(cx, s.holeR))], 0, false)
  flat(top, [...slots, ...s.holes.map((cx) => circle(cx, s.csR))], H, true)

  // The body, underside up to the wing ledge.
  walls(body, 0, body, stepY, false)

  // The flat ledge under each wing, from the body's side out to the wing's edge.
  flat(
    [{ x: L, y: hb }, wing[3], wing[4], wing[5], wing[6], { x: 0, y: hb }],
    [],
    stepY,
    false,
  )
  flat(
    [{ x: 0, y: -hb }, wing[7], wing[0], wing[1], wing[2], { x: L, y: -hb }],
    [],
    stepY,
    false,
  )

  // The straight run of the wing tips. Its two end faces stand on the body's end
  // faces, so each is fanned down onto the body's corners rather than built as a
  // plain quad — that is what closes the seam where the two share a plane.
  walls(wing, stepY, wing, tipY, false, [2, 6])
  const endFace = (chain: Pt2[], out: V3) => {
    const t0 = at(chain[0], tipY)
    const t1 = at(chain[chain.length - 1], tipY)
    for (let i = 0; i < chain.length - 1; i++) emit(at(chain[i], stepY), at(chain[i + 1], stepY), t0, out)
    emit(at(chain[chain.length - 1], stepY), t1, t0, out)
  }
  endFace([wing[2], body[1], body[2], wing[3]], [1, 0, 0])
  endFace([wing[6], body[3], body[0], wing[7]], [-1, 0, 0])

  // The top chamfer, in from the wing tips to the top face.
  walls(wing, tipY, top, H, false)

  // Relief slots, straight through.
  for (const slot of slots) walls(slot, 0, slot, H, true)

  // Each hole: a straight bore, the countersink cone, then the counterbore.
  for (const cx of s.holes) {
    const bore = circle(cx, s.holeR)
    const sink = circle(cx, s.csR)
    walls(bore, 0, bore, s.boreY, true)
    walls(bore, s.boreY, sink, s.coneTop, true)
    walls(sink, s.coneTop, sink, H, true)
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i))
  ensureOutwardWinding(geom)
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  return geom
}

/**
 * The snap clip's volume worked out from its dimensions alone, for the audit to
 * hold the mesh against. The chamfer band is a prismatoid, so Simpson's rule is
 * exact for it; holes are taken as the 32-sided polygons the mesh actually cuts.
 */
export function snapClipVolume(d: Dimensions, length = d.snapClip.length): number {
  const s = snapClipShape(d, length)
  const { L, H, hw, hb, stepY, tipY, endChamfer: c, inset } = s
  const wingArea = (i: number) => 2 * L * (hw - i) - 2 * (c - i) ** 2
  const outer =
    2 * L * hb * stepY +
    wingArea(0) * (tipY - stepY) +
    ((H - tipY) / 6) * (wingArea(0) + 4 * wingArea(inset / 2) + wingArea(inset))
  const slots = s.slots ? 2 * (L - 2 * s.bridge) * s.slotWidth * H : 0
  const polygon = (r: number) => (HOLE_SEGMENTS / 2) * r * r * Math.sin((2 * Math.PI) / HOLE_SEGMENTS)
  const a1 = polygon(s.holeR)
  const a2 = polygon(s.csR)
  const hole =
    a1 * s.boreY + ((s.coneTop - s.boreY) / 3) * (a1 + Math.sqrt(a1 * a2) + a2) + a2 * (H - s.coneTop)
  return outer - slots - s.holes.length * hole
}

/**
 * Height of a fitted clip's underside above the track's bottom face. The clip
 * sits up against the slot ceiling, where its screws pull it, so what is left of
 * the slot's depth is left underneath.
 */
export function clipSeatY(d: Dimensions): number {
  return Math.max(0, slotMetrics(d).slotH - snapClipShape(d).H)
}
