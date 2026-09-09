import * as THREE from 'three'
import type { Pt2 } from './sweep'
import { ensureOutwardWinding, toCCW } from './sweep'

/**
 * A horizontal slice of a lofted prism.
 *
 * `outline` is a closed polygon in plan view — u runs along the part's length
 * (mapped to world +X), v runs across it (world +Z) — and `holeRadius` is the
 * radius of every vertical hole at this height. Varying the radius between
 * levels is what produces a conical countersink rather than a stepped bore.
 */
export interface LoftLevel {
  y: number
  outline: Pt2[]
  holeRadius: number
}

const HOLE_SEGMENTS = 32

function circle(cx: number, cy: number, r: number, reverse: boolean): Pt2[] {
  const pts: Pt2[] = []
  for (let i = 0; i < HOLE_SEGMENTS; i++) {
    const a = (i / HOLE_SEGMENTS) * Math.PI * 2
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return reverse ? pts.reverse() : pts
}

/**
 * Lofts a stack of plan-view outlines into a solid, driving a vertical hole
 * through every entry in `holeCentres` (given as `u` positions along the length,
 * on the v = 0 centreline).
 *
 * Every level must supply the same number of outline points so corresponding
 * vertices can be connected; consecutive levels sharing a `y` produce a vertical
 * step, which is how the wings ledge out from the body.
 */
export function loftPrism(levels: LoftLevel[], holeCentres: number[]): THREE.BufferGeometry {
  if (levels.length < 2) return new THREE.BufferGeometry()
  const n = levels[0].outline.length
  const outlines = levels.map((l) => toCCW(l.outline))

  const positions: number[] = []
  const indices: number[] = []
  const push = (u: number, y: number, v: number) => {
    positions.push(u, y, v)
    return positions.length / 3 - 1
  }

  // Outer side walls. A pair of levels identical in both height and outline
  // would only contribute degenerate triangles, so skip it.
  for (let i = 0; i < levels.length - 1; i++) {
    const lo = outlines[i]
    const hi = outlines[i + 1]
    if (levels[i].y === levels[i + 1].y && lo.every((p, k) => p.x === hi[k].x && p.y === hi[k].y)) continue
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n
      const a = push(lo[j].x, levels[i].y, lo[j].y)
      const b = push(lo[j2].x, levels[i].y, lo[j2].y)
      const c = push(hi[j2].x, levels[i + 1].y, hi[j2].y)
      const dI = push(hi[j].x, levels[i + 1].y, hi[j].y)
      indices.push(a, b, c, a, c, dI)
    }
  }

  // Hole walls, wound the other way so they face into the bore.
  for (const cu of holeCentres) {
    for (let i = 0; i < levels.length - 1; i++) {
      const rLo = levels[i].holeRadius
      const rHi = levels[i + 1].holeRadius
      if (rLo <= 0 && rHi <= 0) continue
      // A ledge between two levels at the same height has no bore wall to build;
      // emitting one leaves zero-area triangles and non-manifold edges behind.
      if (levels[i].y === levels[i + 1].y && rLo === rHi) continue
      for (let j = 0; j < HOLE_SEGMENTS; j++) {
        const a1 = (j / HOLE_SEGMENTS) * Math.PI * 2
        const a2 = ((j + 1) / HOLE_SEGMENTS) * Math.PI * 2
        const p0 = push(cu + rLo * Math.cos(a1), levels[i].y, rLo * Math.sin(a1))
        const p1 = push(cu + rLo * Math.cos(a2), levels[i].y, rLo * Math.sin(a2))
        const p2 = push(cu + rHi * Math.cos(a2), levels[i + 1].y, rHi * Math.sin(a2))
        const p3 = push(cu + rHi * Math.cos(a1), levels[i + 1].y, rHi * Math.sin(a1))
        indices.push(p0, p2, p1, p0, p3, p2)
      }
    }
  }

  // Caps: the outline minus a circle per hole.
  const cap = (levelIndex: number, flip: boolean) => {
    const lvl = levels[levelIndex]
    const outline = outlines[levelIndex]
    const holes =
      lvl.holeRadius > 0 ? holeCentres.map((cu) => circle(cu, 0, lvl.holeRadius, true)) : []
    const contour = outline.map((p) => new THREE.Vector2(p.x, p.y))
    const holeVecs = holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y)))
    const tris = THREE.ShapeUtils.triangulateShape(contour, holeVecs)
    const all = [...outline, ...holes.flat()]
    const base = positions.length / 3
    for (const p of all) push(p.x, lvl.y, p.y)
    for (const t of tris) {
      if (flip) indices.push(base + t[0], base + t[2], base + t[1])
      else indices.push(base + t[0], base + t[1], base + t[2])
    }
  }

  cap(0, true)
  cap(levels.length - 1, false)

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  ensureOutwardWinding(geom)
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  return geom
}

/** Plan-view outline of a rectangle of `length` × `width` with chamfered ends. */
export function chamferedPlan(length: number, width: number, chamfer: number): Pt2[] {
  const h = width / 2
  const c = Math.min(chamfer, length / 2 - 0.01, h - 0.01)
  if (c <= 0) {
    return [
      { x: 0, y: -h },
      { x: length, y: -h },
      { x: length, y: h },
      { x: 0, y: h },
    ]
  }
  return [
    { x: c, y: -h },
    { x: length - c, y: -h },
    { x: length, y: -h + c },
    { x: length, y: h - c },
    { x: length - c, y: h },
    { x: c, y: h },
    { x: 0, y: h - c },
    { x: 0, y: -h + c },
  ]
}
