import * as THREE from 'three'
import { laneWidth, type Dimensions } from './dimensions'
import { slotMetrics, wallMetrics } from './trackProfile'

/**
 * A junction — a square tile with a way on and off it on every side.
 *
 * It is a box rather than a length of track, because all four of its sides have
 * to do the same job. Looking down on a crossroads:
 *
 *   ┌────────┬───────────┬────────┐
 *   │ corner │  opening  │ corner │   <- the `r` side
 *   ├────────┼───────────┼────────┤
 *   │opening │  channel  │opening │   <- `a` on the left, `b` on the right
 *   ├────────┼───────────┼────────┤
 *   │ corner │  opening  │ corner │   <- the `l` side
 *   └────────┴───────────┴────────┘
 *
 * Each side carries an opening the width of the track it takes, with the walls
 * carrying on round the four corners so a car is held through the crossing. The
 * underside carries a T-slot in from every side, so every joint takes a clip.
 *
 * **Why the tile is a lane pitch bigger than the track it carries.** A slot has
 * to reach far enough in to hold a clip, and the slots coming in from two
 * neighbouring sides must not run into each other. The nearest a side slot comes
 * to an end face is one lane pitch less half a slot, whatever the lane count —
 * so a tile of `(lanes + 1)` pitches leaves exactly the room needed, and one of
 * `lanes` pitches leaves none at all. That extra half a pitch at each end of
 * each side is what the corners are made of.
 *
 * **Why it is built as a stack of levels.** A slot running across the piece has
 * an undercut wider than its mouth, so a section taken across the length
 * anywhere inside that undercut has a closed hole in it — material all the way
 * round a void. No single swept outline can say that, however the length is
 * carved up. So the tile is built the way the connector clip is: as horizontal
 * bands. Every plan is rectilinear, so each band is a grid of cells that are
 * either solid or not, and the surface is whatever separates solid from empty.
 * That gives a watertight mesh by construction rather than by care.
 */
export interface JunctionSpec {
  /** Lanes across the track the tile carries — the same on all four sides. */
  lanes: number
  /** Whether the wall is opened on the driver's left, with port `b` ahead. */
  openLeft: boolean
  openRight: boolean
}

/** Cuts closer together than this along an axis are treated as one, mm. */
const WELD = 1e-4

/** Material kept between a slot coming in from one side and one from the next, mm. */
const SLOT_CLEARANCE = 1

/** The longest clip a junction can take without two of its slots running into each other. */
export function maxJunctionClipLength(d: Dimensions): number {
  return Math.max(8, 2 * (laneWidth(d.track) - d.track.slotOuterWidth / 2 - SLOT_CLEARANCE))
}

/**
 * The clip a junction's joints take, mm.
 *
 * Shorter than the standard one, which does not fit: a 70mm clip reaches 35mm
 * into the tile from each of four sides, and there is nowhere near that much
 * room before the slots meet.
 */
export function junctionClipLength(d: Dimensions): number {
  return Math.min(Math.max(8, d.assembly.junctionConnectorLength), maxJunctionClipLength(d))
}

/** The side of the square, mm — one lane pitch more than the track it carries. */
export function junctionSide(d: Dimensions, lanes: number): number {
  return laneWidth(d.track) * (Math.max(1, Math.round(lanes)) + 1)
}

/** Everything the tile's shape follows from, without building any of it. */
export function junctionLayout(d: Dimensions, spec: JunctionSpec) {
  const t = d.track
  const lanes = Math.max(1, Math.round(spec.lanes))
  const pitch = laneWidth(t)
  const side = junctionSide(d, lanes)
  // Half the opening on each side, which is half the width of the track it takes.
  const openHalf = (pitch * lanes) / 2
  // The walls round the corners are the same section a straight of that width
  // has, so the channel through the tile lines up with the channel either side.
  const { floorY, innerX: chanHalf, rampBottomX: rampInner, rampTopY } = wallMetrics(t, openHalf)
  const { slotH, mouthH, outerHalf, mouthHalf } = slotMetrics(d)
  return {
    lanes,
    pitch,
    side,
    half: side / 2,
    openHalf,
    chanHalf,
    rampInner,
    rampTopY,
    floorY,
    slotH,
    mouthH,
    outerHalf,
    mouthHalf,
    H: t.totalHeight,
    /** How far a slot reaches in from its side, mm. */
    reach: Math.min(junctionClipLength(d) / 2, pitch - outerHalf - SLOT_CLEARANCE),
    /** Lane centres across an opening, measured from the middle of the side. */
    centres: Array.from({ length: lanes }, (_, i) => -openHalf + pitch * (i + 0.5)),
    openLeft: !!spec.openLeft,
    openRight: !!spec.openRight,
  }
}

type Layout = ReturnType<typeof junctionLayout>

/** Whether a point on the underside falls inside a slot of half-width `h`. */
function inSlot(l: Layout, u: number, v: number, h: number): boolean {
  const near = -l.half + l.reach
  const far = l.half - l.reach
  for (const c of l.centres) {
    // In from the `a` and `b` ends, which are always open.
    if (Math.abs(v - c) < h && (u < near || u > far)) return true
    if (Math.abs(u - c) >= h) continue
    // And in from whichever sides are. Left is -Z, as the driver sees it.
    if (l.openLeft && v < near) return true
    if (l.openRight && v > far) return true
  }
  return false
}

/**
 * Whether a point stands above the channel floor — the four corners, plus the
 * whole of any side that is walled off rather than opened.
 */
function isWall(l: Layout, u: number, v: number): boolean {
  const t = l.rampInner
  if (Math.abs(v) < t) return false
  if (Math.abs(u) < t) {
    if (l.openLeft && v < -t) return false
    if (l.openRight && v > t) return false
  }
  return true
}

/**
 * One cut across the tile. `lo` is where it sits at the channel floor and `hi`
 * where it sits above the ramp — the same for every cut but the four the walls'
 * inner faces run along, which lean in over the ramp's rise.
 */
interface Cut {
  lo: number
  hi: number
}

/** Where the tile is cut across, low to high. Both axes are cut the same way. */
function axisCuts(l: Layout): Cut[] {
  const fixed = [-l.half, l.half, -l.half + l.reach, l.half - l.reach]
  for (const c of l.centres) fixed.push(c - l.outerHalf, c - l.mouthHalf, c + l.mouthHalf, c + l.outerHalf)

  const pairs: Cut[] = fixed.map((v) => ({ lo: v, hi: v }))
  pairs.push({ lo: -l.rampInner, hi: -l.chanHalf }, { lo: l.rampInner, hi: l.chanHalf })
  pairs.sort((a, b) => a.lo - b.lo)

  // Welded, and nudged apart where a hand-edited dimension would otherwise put
  // two cuts in the wrong order and fold a cell inside out.
  const out: Cut[] = []
  for (const p of pairs) {
    const last = out[out.length - 1]
    if (!last) {
      out.push(p)
      continue
    }
    if (p.lo - last.lo <= WELD && Math.abs(p.hi - last.hi) <= WELD) continue
    out.push({ lo: Math.max(p.lo, last.lo + WELD), hi: Math.max(p.hi, last.hi + WELD) })
  }
  return out
}

/** One horizontal band of the tile: which cells are solid, and where they sit. */
interface Band {
  y0: number
  y1: number
  /** Cell coordinates at the bottom of the band and at the top. */
  at0: number[]
  at1: number[]
  fill: boolean[]
}

/**
 * The tile as bands of solid cells. Exported so the geometry audit can integrate
 * the solid independently of the triangulation.
 */
export function junctionGrid(d: Dimensions, spec: JunctionSpec) {
  const l = junctionLayout(d, spec)
  const cuts = axisCuts(l)
  const lo = cuts.map((c) => c.lo)
  const hi = cuts.map((c) => c.hi)
  const n = cuts.length - 1
  const mid = (a: number[], i: number) => (a[i] + a[i + 1]) / 2

  const mask = (solid: (u: number, v: number) => boolean) => {
    const out = new Array<boolean>(n * n)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) out[i * n + j] = solid(mid(lo, i), mid(lo, j))
    }
    return out
  }

  const bands: Band[] = [
    { y0: 0, y1: l.mouthH, at0: lo, at1: lo, fill: mask((u, v) => !inSlot(l, u, v, l.mouthHalf)) },
    { y0: l.mouthH, y1: l.slotH, at0: lo, at1: lo, fill: mask((u, v) => !inSlot(l, u, v, l.outerHalf)) },
    { y0: l.slotH, y1: l.floorY, at0: lo, at1: lo, fill: mask(() => true) },
    { y0: l.floorY, y1: l.rampTopY, at0: lo, at1: hi, fill: mask((u, v) => isWall(l, u, v)) },
    { y0: l.rampTopY, y1: l.H, at0: hi, at1: hi, fill: mask((u, v) => isWall(l, u, v)) },
  ].filter((b) => b.y1 - b.y0 > WELD)

  return { ...l, cuts, lo, hi, n, bands }
}

type V3 = [number, number, number]

/** Geometry for a junction tile, port `a` at the origin and +X across to port `b`. */
export function buildJunctionGeometry(d: Dimensions, spec: JunctionSpec): THREE.BufferGeometry {
  const g = junctionGrid(d, spec)
  const { n, bands, half } = g

  const pos: number[] = []
  const idx: number[] = []
  // Built about the middle of the tile and shifted so port `a` lands on the
  // origin, which is where every other part keeps it.
  const P = (u: number, y: number, v: number): V3 => [u + half, y, v]
  const quad = (a: V3, b: V3, c: V3, e: V3) => {
    const base = pos.length / 3
    for (const p of [a, b, c, e]) pos.push(p[0], p[1], p[2])
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const solid = (b: Band | undefined, i: number, j: number) =>
    !!b && i >= 0 && j >= 0 && i < n && j < n && b.fill[i * n + j]

  for (const b of bands) {
    const { y0, y1, at0, at1 } = b
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!solid(b, i, j)) continue
        // Each face is emitted by the solid cell behind it, so every one of them
        // is emitted exactly once and the shell closes on itself.
        if (!solid(b, i - 1, j)) {
          quad(
            P(at0[i], y0, at0[j]),
            P(at0[i], y0, at0[j + 1]),
            P(at1[i], y1, at1[j + 1]),
            P(at1[i], y1, at1[j]),
          )
        }
        if (!solid(b, i + 1, j)) {
          quad(
            P(at0[i + 1], y0, at0[j]),
            P(at1[i + 1], y1, at1[j]),
            P(at1[i + 1], y1, at1[j + 1]),
            P(at0[i + 1], y0, at0[j + 1]),
          )
        }
        if (!solid(b, i, j - 1)) {
          quad(
            P(at0[i], y0, at0[j]),
            P(at1[i], y1, at1[j]),
            P(at1[i + 1], y1, at1[j]),
            P(at0[i + 1], y0, at0[j]),
          )
        }
        if (!solid(b, i, j + 1)) {
          quad(
            P(at0[i], y0, at0[j + 1]),
            P(at0[i + 1], y0, at0[j + 1]),
            P(at1[i + 1], y1, at1[j + 1]),
            P(at1[i], y1, at1[j + 1]),
          )
        }
      }
    }
  }

  // Horizontal faces wherever one band is solid and the one above or below it is
  // not — the bottom face, the undercut ledges, the slot ceilings, the channel
  // floor and the tops of the walls, all from the one rule.
  for (let k = 0; k <= bands.length; k++) {
    const below = bands[k - 1]
    const above = bands[k]
    const y = above ? above.y0 : below.y1
    const a = above ? above.at0 : below.at1
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const under = solid(below, i, j)
        const over = solid(above, i, j)
        if (under === over) continue
        const corners: V3[] = [
          P(a[i], y, a[j]),
          P(a[i], y, a[j + 1]),
          P(a[i + 1], y, a[j + 1]),
          P(a[i + 1], y, a[j]),
        ]
        if (under) quad(corners[0], corners[1], corners[2], corners[3])
        else quad(corners[0], corners[3], corners[2], corners[1])
      }
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geom.setIndex(idx)
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  return geom
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * The volume the solid must come out to, read off the grid rather than off the
 * mesh. A band whose cells lean in over the ramp has an area that is quadratic
 * in the height, so Simpson's rule is exact here rather than approximate.
 */
export function junctionVolume(d: Dimensions, spec: JunctionSpec): number {
  const g = junctionGrid(d, spec)
  let volume = 0
  for (const b of g.bands) {
    const area = (t: number) => {
      let a = 0
      for (let i = 0; i < g.n; i++) {
        for (let j = 0; j < g.n; j++) {
          if (!b.fill[i * g.n + j]) continue
          const du = lerp(b.at0[i + 1], b.at1[i + 1], t) - lerp(b.at0[i], b.at1[i], t)
          const dv = lerp(b.at0[j + 1], b.at1[j + 1], t) - lerp(b.at0[j], b.at1[j], t)
          a += du * dv
        }
      }
      return a
    }
    volume += ((area(0) + 4 * area(0.5) + area(1)) / 6) * (b.y1 - b.y0)
  }
  return volume
}
