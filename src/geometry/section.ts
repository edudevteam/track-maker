import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import type { Pt2 } from './sweep'
import { slotMetrics, wallMetrics } from './trackProfile'

/**
 * The track's cross-section, and the faces that close it off.
 *
 * A part whose section changes along its length — a transition's taper, a
 * junction's missing wall — cannot be one sweep, so it is built as zones with a
 * hand-made face stitched between them. Everything both parts need to do that
 * lives here: the section itself, the bands that fill an end face, and the
 * mapping that lifts a profile-space triangle onto a plane across the piece.
 *
 * Profile space is the same one the sweep uses: `x` runs across the track with 0
 * on the centreline, `y` is up from the bottom face. Its +x side is the driver's
 * left with port `b` ahead, which is why the open sides below are named that way.
 */

/** A T-slot, as the two bottom vertices that bound its mouth, as fractions of the half-width. */
export interface Slot {
  uLeft: number
  uRight: number
}

export type Tri = [Pt2, Pt2, Pt2]

/** Which of the two outer walls a section has had taken out of it. */
export interface OpenSides {
  /** The +x side of the section — the driver's left with port `b` ahead. */
  left?: boolean
  right?: boolean
}

export const at = (x: number, y: number): Pt2 => ({ x, y })

/**
 * Triangles filling the region between two left-to-right polylines, joined by a
 * straight edge at each end. Both polylines keep every vertex they were given,
 * so the face meets its neighbours without leaving an edge split down one side.
 */
export function ribbon(lower: Pt2[], upper: Pt2[], out: Tri[]): void {
  if (lower.length < 2 || upper.length < 2) return
  let i = 0
  let j = 0
  while (i < lower.length - 1 || j < upper.length - 1) {
    const ti = i / (lower.length - 1)
    const tj = j / (upper.length - 1)
    if (j >= upper.length - 1 || (i < lower.length - 1 && ti <= tj)) {
      out.push([lower[i], lower[i + 1], upper[j]])
      i++
    } else {
      out.push([lower[i], upper[j + 1], upper[j]])
      j++
    }
  }
}

/** Heights the outer wall is split at, low to high, with anything degenerate dropped. */
export function wallHeights(
  mouthH: number,
  slotH: number,
  floorY: number,
  rampTopY: number,
  H: number,
): number[] {
  const out: number[] = []
  for (const y of [mouthH, slotH, floorY, rampTopY]) {
    if (y <= 1e-6 || y >= H - 1e-6) continue
    if (out.length && y - out[out.length - 1] <= 1e-6) continue
    out.push(y)
  }
  return out
}

/**
 * The cross-section of a piece at one station.
 *
 * `bottom` lists the bottom-face vertices as fractions of the half-width, and
 * `slots` says which neighbouring pairs of them open into a T-slot. The outer
 * walls carry an extra vertex at every height a face changes, so the end cap
 * built band by band lines up with the swept sides exactly.
 *
 * An `open` side has its wall taken away and the channel floor run out to the
 * outer face in its place — the opening a junction lets a branch join through.
 * The vertices below the floor are untouched by that, which is what lets the
 * open and closed sections be stitched to each other.
 */
export function trackSection(
  d: Dimensions,
  halfW: number,
  bottom: number[],
  slots: Slot[],
  open: OpenSides = {},
): Pt2[] {
  const t = d.track
  const { floorY, innerX, rampBottomX, rampTopY } = wallMetrics(t, halfW)
  const { slotH, mouthH, outerHalf } = slotMetrics(d)
  const H = t.totalHeight
  const wallYs = wallHeights(mouthH, slotH, floorY, rampTopY, H)
  const topLeft = open.left ? floorY : H
  const topRight = open.right ? floorY : H

  // Across the top, right to left: up over the right wall, down its ramp, across
  // the channel floor and up the far side. An open side skips its wall, and the
  // floor simply carries on to the outer face.
  const pts: Pt2[] = [{ x: -halfW, y: topRight }]
  if (!open.right) pts.push({ x: -innerX, y: H }, { x: -innerX, y: rampTopY })
  pts.push({ x: -rampBottomX, y: floorY }, { x: rampBottomX, y: floorY })
  if (!open.left) pts.push({ x: innerX, y: rampTopY }, { x: innerX, y: H })
  pts.push({ x: halfW, y: topLeft })

  // Down the left-hand outer wall.
  for (let i = wallYs.length - 1; i >= 0; i--) {
    if (wallYs[i] < topLeft - 1e-6) pts.push({ x: halfW, y: wallYs[i] })
  }

  // Bottom face, left to right, detouring up and over each T-slot.
  const byRight = new Map(slots.map((s) => [s.uRight, s]))
  for (let i = bottom.length - 1; i >= 0; i--) {
    const u = bottom[i]
    pts.push({ x: u * halfW, y: 0 })
    const slot = byRight.get(u)
    if (!slot) continue
    const c = ((slot.uLeft + slot.uRight) / 2) * halfW
    pts.push({ x: slot.uRight * halfW, y: mouthH })
    pts.push({ x: c + outerHalf, y: mouthH })
    pts.push({ x: c + outerHalf, y: slotH })
    pts.push({ x: c - outerHalf, y: slotH })
    pts.push({ x: c - outerHalf, y: mouthH })
    pts.push({ x: slot.uLeft * halfW, y: mouthH })
  }

  // Up the right-hand outer wall, back to the start of the top surface.
  for (const y of wallYs) {
    if (y < topRight - 1e-6) pts.push({ x: -halfW, y })
  }

  return pts
}

/**
 * The full end face of a piece, built as horizontal bands rather than by
 * ear-clipping: a section carrying a vertex at every height its outer face
 * changes has long runs of collinear points, which general triangulation is
 * entitled to drop — and a dropped one leaves the cap split against the swept
 * side beside it.
 */
export function sectionCap(d: Dimensions, halfW: number, bottom: number[], slots: Slot[]): Tri[] {
  const t = d.track
  const { floorY, rampBottomX } = wallMetrics(t, halfW)
  const { slotH, mouthH, outerHalf } = slotMetrics(d)

  const mouths = slots
    .map((s) => {
      const c = ((s.uLeft + s.uRight) / 2) * halfW
      return { left: s.uLeft * halfW, right: s.uRight * halfW, outL: c - outerHalf, outR: c + outerHalf }
    })
    .sort((a, b) => a.left - b.left)

  const tris: Tri[] = []
  const xs = bottom.map((u) => u * halfW)

  // Band 1: bottom face up to the slot mouths, in the spans between them.
  for (let k = 0; k <= mouths.length; k++) {
    const xl = k === 0 ? -halfW : mouths[k - 1].right
    const xr = k === mouths.length ? halfW : mouths[k].left
    if (xr - xl <= 1e-9) continue
    const lower = xs.filter((x) => x >= xl - 1e-9 && x <= xr + 1e-9).map((x) => at(x, 0))
    // The undercut ledges start part-way along, so the top of this band is split
    // where the band above it begins.
    const upper = [xl, ...(k > 0 ? [mouths[k - 1].outR] : []), ...(k < mouths.length ? [mouths[k].outL] : []), xr]
    ribbon(lower, upper.map((x) => at(x, mouthH)), tris)
  }

  // Band 2: past the ledges, in the spans between the undercuts.
  for (let k = 0; k <= mouths.length; k++) {
    const xl = k === 0 ? -halfW : mouths[k - 1].outR
    const xr = k === mouths.length ? halfW : mouths[k].outL
    if (xr - xl <= 1e-9) continue
    ribbon([at(xl, mouthH), at(xr, mouthH)], [at(xl, slotH), at(xr, slotH)], tris)
  }

  // Band 3: solid slab from the slot ceilings up to the channel floor.
  const slabLower = [-halfW]
  for (const m of mouths) slabLower.push(m.outL, m.outR)
  slabLower.push(halfW)
  ribbon(
    slabLower.map((x) => at(x, slotH)),
    [-halfW, -rampBottomX, rampBottomX, halfW].map((x) => at(x, floorY)),
    tris,
  )

  // Bands 4 and 5: the two walls, up the ramp and then straight to the top.
  for (const side of ['right', 'left'] as const) tris.push(...wallCap(d, halfW, side))

  return tris
}

/**
 * One outer wall's cross-section — the ramp band and the straight band above it.
 *
 * It is both part of an end face and, on its own, the face that closes a wall off
 * where a junction's opening starts. Every vertex the swept sides carry is kept,
 * including the one part-way up the outer face where the ramp tops out, so the
 * face meets the section either side of it without splitting an edge.
 */
export function wallCap(d: Dimensions, halfW: number, side: 'left' | 'right'): Tri[] {
  const t = d.track
  const { floorY, innerX, rampBottomX, rampTopY } = wallMetrics(t, halfW)
  const H = t.totalHeight
  // Both bands are listed left to right in profile x, which is what `ribbon`
  // needs to wind them the same way as the rest of the cap.
  const [outer, ramp, inner] = side === 'left' ? [halfW, rampBottomX, innerX] : [-halfW, -rampBottomX, -innerX]
  const order = (a: Pt2, b: Pt2): Pt2[] => (a.x <= b.x ? [a, b] : [b, a])

  const tris: Tri[] = []
  if (rampTopY > floorY + 1e-6) {
    ribbon(order(at(outer, floorY), at(ramp, floorY)), order(at(outer, rampTopY), at(inner, rampTopY)), tris)
  }
  if (H > rampTopY + 1e-6) {
    ribbon(order(at(outer, rampTopY), at(inner, rampTopY)), order(at(outer, H), at(inner, H)), tris)
  }
  return tris
}

/**
 * Lifts profile-space triangles onto the plane at `x`, using the same mapping
 * the sweep uses so shared vertices land on exactly the same coordinates.
 * `flip` reverses the winding for a face whose outside points back along -X.
 */
export function capGeometry(tris: Tri[], x: number, flip: boolean): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (const tri of tris) {
    const base = positions.length / 3
    const ordered = flip ? [tri[0], tri[2], tri[1]] : tri
    for (const p of ordered) positions.push(x, p.y, -p.x)
    indices.push(base, base + 1, base + 2)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  return geom
}

/**
 * The bottom-face vertices and T-slots of a piece that is one width the whole
 * way along. Every vertex is either an end of the section or the edge of a slot
 * mouth, so nothing falls inside a slot and the two lists are the same.
 */
export function constantWidthBottom(d: Dimensions, halfW: number, lanes: number) {
  const { pitch, mouthHalf } = slotMetrics(d)
  const n = Math.max(1, Math.round(lanes))
  const slots: Slot[] = Array.from({ length: n }, (_, i) => {
    const u = (-halfW + pitch * (i + 0.5)) / halfW
    return { uLeft: u - mouthHalf / halfW, uRight: u + mouthHalf / halfW }
  }).filter((s) => s.uRight > s.uLeft && s.uLeft > -1 && s.uRight < 1)
  const us = [-1, ...slots.flatMap((s) => [s.uLeft, s.uRight]), 1]
  return { us, slots }
}
