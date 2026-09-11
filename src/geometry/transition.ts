import * as THREE from 'three'
import { laneWidth, type Dimensions } from './dimensions'
import {
  ensureOutwardWinding,
  mergeGeometries,
  signedArea,
  sweepSections,
  type Frame,
  type Pt2,
} from './sweep'
import { slotMetrics } from './trackProfile'
import {
  at,
  capGeometry,
  ribbon,
  sectionCap,
  trackSection,
  type Slot,
  type Tri,
} from './section'

/**
 * A transition piece — track that opens from one width to the next, so a single
 * lane can run into a double without either end having to change.
 *
 * The part is three zones along its length:
 *
 *   |<- inset ->|<--- taper --->|<- inset ->|
 *   ┌───────────┐               ┌───────────┐
 *   │  width A  ╲               ╱  width B  │
 *   │  A slots  ╱               ╲  B slots  │
 *   └───────────┘               └───────────┘
 *
 * The end zones keep their own end's full width and its T-slots, so the clip at
 * each joint seats exactly as it does on a plain piece. The middle tapers, and
 * has no slots at all — the A slots are walled off where the taper starts and
 * the B slots open where it ends. That step is why this cannot be one sweep: the
 * cross-section changes how many slots it carries, so the two slot ends are
 * built as their own faces and stitched between the three swept zones.
 */
export interface TransitionSpec {
  /** Lanes at port `a`. */
  lanesA: number
  /** Lanes at port `b`. */
  lanesB: number
  /** Overall centreline length, mm. */
  length: number
  /**
   * Radius the two taper corners are rounded to, mm. 0 leaves them square.
   * Clamped to `maxCornerRadius` — past that the two fillets would overlap.
   */
  cornerRadius?: number
  /**
   * How much of each end stays full width before the taper starts, mm. Shorter
   * ends spread the taper over more of the piece, so it opens more slowly.
   */
  flatEnd?: number
}

/** Bottom-face vertices closer than this are merged into one, mm. */
const WELD = 0.05

/** One end zone or the tapering middle, as the cross-section at each station along it. */
interface Zone {
  xs: number[]
  sections: Pt2[][]
}

/**
 * The shortest full-width run each end can keep.
 *
 * The clip is centred on the joint, so it reaches half its length into the
 * piece. The slot has to stay at full width for at least that far or the clip
 * runs out of slot and cannot seat.
 */
export function minFlatEnd(d: Dimensions): number {
  return Math.max(6, d.connector.length / 2)
}

/** The longest full-width run, so a taper is always left in the middle. */
export function maxFlatEnd(length: number): number {
  return Math.max(1, length) * 0.45
}

/** Shortest a transition can be and still hold a clip at each end, mm. */
export function minTransitionLength(d: Dimensions): number {
  return Math.round(2 * minFlatEnd(d) + 10)
}

/**
 * A sensible length for a transition between two widths: a full-width run at
 * each end, plus a taper long enough to open gradually rather than step across.
 */
export function defaultTransitionLength(d: Dimensions, lanesA: number, lanesB: number): number {
  const step = (Math.abs(lanesB - lanesA) * laneWidth(d.track)) / 2
  const flat = Math.max(minFlatEnd(d), d.assembly.transitionFlatEnd)
  return Math.round(2 * flat + Math.max(70, 2 * step))
}

/** Half-width of an N-lane end. */
function halfWidth(d: Dimensions, lanes: number): number {
  return (laneWidth(d.track) * Math.max(1, Math.round(lanes))) / 2
}

/**
 * Steepest the taper wall is allowed to lean, measured from the centreline.
 * Rounding a corner steepens whatever is left between the two fillets, and past
 * about here the wall is near enough side-on that the surface degenerates into
 * slivers — and past 90° it would fold back over itself.
 */
const MAX_TAPER_ANGLE = (80 * Math.PI) / 180

/** Stations closer together than this along the length are treated as one, mm. */
const STATION_WELD = 1e-4

/** The radius the fillets come out at for a given ramp angle. */
function radiusForAngle(run: number, rise: number, theta: number): number {
  const drop = 1 - Math.cos(theta)
  return drop <= 1e-12 ? 0 : (run * Math.sin(theta) - rise * Math.cos(theta)) / (2 * drop)
}

/**
 * The largest corner radius a taper can take. Normally that is where the two
 * fillets meet and the taper becomes a smooth S with no straight run left
 * between them — but a short run for a big step reaches `MAX_TAPER_ANGLE`
 * first, and the wall is not allowed past that.
 */
export function maxCornerRadius(run: number, rise: number): number {
  if (run <= 1e-9 || rise <= 1e-9) return 0
  const flat = Math.atan(rise / run)
  const limit = Math.min(2 * flat, MAX_TAPER_ANGLE)
  if (limit <= flat + 1e-9) return 0
  return Math.max(0, radiusForAngle(run, rise, limit))
}

/** Where the taper sits and how wide each end is, without building any sections. */
export function transitionLayout(d: Dimensions, spec: TransitionSpec) {
  const nA = Math.max(1, Math.round(spec.lanesA))
  const nB = Math.max(1, Math.round(spec.lanesB))
  // The built length is whatever the piece says, so the geometry and the port
  // frames can never disagree; a length too short to seat a clip is held off in
  // the fields instead.
  const length = Math.max(1, spec.length)
  // Each end keeps a run at its own width for the clip, and a shorter run hands
  // the rest to the taper.
  const flatEnd = Math.min(
    Math.max(spec.flatEnd ?? d.assembly.transitionFlatEnd, minFlatEnd(d)),
    maxFlatEnd(length),
  )
  const halfA = halfWidth(d, nA)
  const halfB = halfWidth(d, nB)
  const x0 = flatEnd
  const x1 = length - flatEnd
  const cornerLimit = maxCornerRadius(x1 - x0, Math.abs(halfB - halfA))
  const cornerRadius = Math.min(Math.max(spec.cornerRadius ?? 0, 0), cornerLimit)
  return { nA, nB, halfA, halfB, length, flatEnd, x0, x1, cornerLimit, cornerRadius }
}

/** The largest corner radius the given transition can take, mm. */
export function transitionCornerLimit(d: Dimensions, spec: TransitionSpec): number {
  return transitionLayout(d, spec).cornerLimit
}

/**
 * Half-width of the piece at `x` along its length, mm.
 *
 * Read off the same stations the geometry is swept through rather than
 * interpolated between the two ends, so the walls a driven car is held inside
 * are the walls that get printed — a filleted taper leaves each end level for a
 * while, and a straight line between the ends would put the car through one.
 */
export function transitionHalfWidthAt(d: Dimensions, spec: TransitionSpec, x: number): number {
  const { halfA, halfB, x0, x1, cornerRadius, length } = transitionLayout(d, spec)
  const at = THREE.MathUtils.clamp(x, 0, length)
  if (at <= x0) return halfA
  if (at >= x1) return halfB
  const stations = taperStations(x0, x1, halfA, halfB, cornerRadius)
  for (let i = 1; i < stations.length; i++) {
    const from = stations[i - 1]
    const to = stations[i]
    if (at > to.x) continue
    const span = to.x - from.x
    return span > 1e-9 ? from.half + ((to.half - from.half) * (at - from.x)) / span : to.half
  }
  return halfB
}

/**
 * Half-width along the taper, sampled station by station: level where it leaves
 * each end zone, rolling through a fillet of `radius` into a straight ramp and
 * back out again. Being level at both ends is what keeps the two end zones — and
 * so the slots and the joint fit — exactly the width they claim to be.
 */
function taperStations(
  x0: number,
  x1: number,
  hA: number,
  hB: number,
  radius: number,
): { x: number; half: number }[] {
  const square = [
    { x: x0, half: hA },
    { x: x1, half: hB },
  ]
  const run = x1 - x0
  const rise = hB - hA
  const climb = Math.abs(rise)
  if (run <= 1e-9 || climb <= 1e-9 || radius <= 1e-6) return square

  const dir = Math.sign(rise)
  // The ramp angle runs from the square taper's own slope, at zero radius, up to
  // whatever the fillets have room for. Radius climbs with it, so the angle this
  // radius asks for is found by bisection.
  const flat = Math.atan(climb / run)
  let lo = flat
  let hi = Math.min(2 * flat, MAX_TAPER_ANGLE)
  if (hi <= lo + 1e-9) return square
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (radiusForAngle(run, climb, mid) < radius) lo = mid
    else hi = mid
  }
  const theta = (lo + hi) / 2
  if (!Number.isFinite(theta) || theta <= flat + 1e-12) return square

  const segs = Math.max(3, Math.ceil((theta * 180) / Math.PI / 4))
  const arc = (i: number, xEnd: number, hEnd: number, towards: number) => {
    const p = (theta * i) / segs
    return {
      x: xEnd + towards * radius * Math.sin(p),
      half: hEnd + towards * dir * radius * (1 - Math.cos(p)),
    }
  }

  const out: { x: number; half: number }[] = []
  for (let i = 0; i <= segs; i++) out.push(arc(i, x0, hA, 1))
  for (let i = segs; i >= 0; i--) out.push(arc(i, x1, hB, -1))

  // A full S leaves the two fillets touching, so drop the repeated station
  // rather than hand the sweep a sliver of zero-length surface.
  const kept: { x: number; half: number }[] = []
  for (const p of out) {
    if (kept.length && p.x - kept[kept.length - 1].x <= STATION_WELD) continue
    kept.push(p)
  }
  // Whatever the welding did, the taper still has to hand each end zone back
  // exactly the width it claims.
  if (kept.length < 2) return square
  kept[0] = { x: x0, half: hA }
  kept[kept.length - 1] = { x: x1, half: hB }
  return kept
}

/**
 * The three zones of a transition, with the exact cross-section at every plane
 * where two of them meet. Exported so the geometry audit can integrate the
 * section area along the length independently of the triangulation.
 */
export function transitionZones(d: Dimensions, spec: TransitionSpec) {
  const layout = transitionLayout(d, spec)
  const { nA, nB, halfA, halfB, x0, x1, cornerRadius } = layout
  const L = layout.length

  const { pitch, mouthHalf } = slotMetrics(d)
  const centres = (n: number, half: number) =>
    Array.from({ length: n }, (_, i) => (-half + pitch * (i + 0.5)) / half)

  // Every bottom vertex is held as a fraction of the half-width, so the ones
  // that belong to the far end fan out with the taper instead of crossing it.
  const interior: number[] = []
  for (const u of centres(nA, halfA)) interior.push(u - mouthHalf / halfA, u + mouthHalf / halfA)
  for (const u of centres(nB, halfB)) interior.push(u - mouthHalf / halfB, u + mouthHalf / halfB)

  const minHalf = Math.min(halfA, halfB)
  const us: number[] = [-1]
  for (const u of interior.sort((a, b) => a - b)) {
    if (u <= -1 || u >= 1) continue
    if ((u - us[us.length - 1]) * minHalf > WELD) us.push(u)
  }
  us.push(1)

  const snap = (u: number) =>
    us.reduce((best, cur) => (Math.abs(cur - u) < Math.abs(best - u) ? cur : best), us[0])

  const slotsFor = (n: number, half: number): Slot[] =>
    centres(n, half)
      .map((u) => ({ uLeft: snap(u - mouthHalf / half), uRight: snap(u + mouthHalf / half) }))
      .filter((s) => s.uRight > s.uLeft)

  const slotsA = slotsFor(nA, halfA)
  const slotsB = slotsFor(nB, halfB)

  // A slot is a hole in the bottom face, so the vertices that fall inside its
  // mouth belong to the flat middle zone only.
  const outsideSlots = (slots: Slot[]) =>
    us.filter((u) => !slots.some((s) => u > s.uLeft + 1e-9 && u < s.uRight - 1e-9))

  const usA = outsideSlots(slotsA)
  const usB = outsideSlots(slotsB)

  const sectionA = trackSection(d, halfA, usA, slotsA)
  const sectionB = trackSection(d, halfB, usB, slotsB)
  const taper = taperStations(x0, x1, halfA, halfB, cornerRadius)

  const zones: Zone[] = [
    { xs: [0, x0], sections: [sectionA, sectionA] },
    {
      xs: taper.map((p) => p.x),
      sections: taper.map((p) => trackSection(d, p.half, us, [])),
    },
    { xs: [x1, L], sections: [sectionB, sectionB] },
  ]

  return { ...layout, us, usA, usB, slotsA, slotsB, zones }
}

/** Geometry for a transition piece, port `a` at the origin and +X down the centreline. */
export function buildTransitionGeometry(d: Dimensions, spec: TransitionSpec): THREE.BufferGeometry {
  const z = transitionZones(d, spec)

  const frame = (x: number): Frame => ({
    position: new THREE.Vector3(x, 0, 0),
    tangent: new THREE.Vector3(1, 0, 0),
  })

  // Zones are swept open at both ends; the faces between them are built below,
  // so the winding is only settled once the whole solid is assembled.
  const parts = z.zones.map((zone) =>
    sweepSections(zone.sections, zone.xs.map(frame), false, false, false),
  )

  parts.push(capGeometry(sectionCap(d, z.halfA, z.usA, z.slotsA), 0, true))
  parts.push(capGeometry(sectionCap(d, z.halfB, z.usB, z.slotsB), z.length, false))
  // The A slots are walled off where the taper starts, and the B slots open
  // where it ends. Both walls take their intermediate bottom vertices from the
  // taper's own section, so no edge is left split against its neighbour.
  parts.push(capGeometry(slotCaps(d, z.halfA, z.us, z.slotsA), z.x0, true))
  parts.push(capGeometry(slotCaps(d, z.halfB, z.us, z.slotsB), z.x1, false))

  const geom = mergeGeometries(parts.filter((g) => (g.getIndex()?.count ?? 0) > 0))
  ensureOutwardWinding(geom)
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  for (const p of parts) p.dispose()
  return geom
}

/**
 * The wall that closes off one end's T-slots where the taper takes over. Only
 * the slot cross-sections are filled — the rest of that plane is solid on both
 * sides.
 */
function slotCaps(d: Dimensions, halfW: number, bottom: number[], slots: Slot[]): Tri[] {
  const { slotH, mouthH, outerHalf } = slotMetrics(d)
  const tris: Tri[] = []

  for (const s of slots) {
    const left = s.uLeft * halfW
    const right = s.uRight * halfW
    const c = (left + right) / 2
    const lower = bottom
      .filter((u) => u >= s.uLeft - 1e-9 && u <= s.uRight + 1e-9)
      .map((u) => at(u * halfW, 0))
    ribbon(lower, [at(left, mouthH), at(right, mouthH)], tris)
    ribbon(
      [at(c - outerHalf, mouthH), at(left, mouthH), at(right, mouthH), at(c + outerHalf, mouthH)],
      [at(c - outerHalf, slotH), at(c + outerHalf, slotH)],
      tris,
    )
  }

  return tris
}

/**
 * Cross-section area swept along the length — the volume the solid must come
 * out to. Section area is linear in the half-width and each station is joined to
 * the next by a ruled surface, so the trapezoid rule is exact here, rounded
 * corners and all.
 */
export function transitionVolume(d: Dimensions, spec: TransitionSpec): number {
  const area = (pts: Pt2[]) => Math.abs(signedArea(pts))
  let volume = 0
  for (const zone of transitionZones(d, spec).zones) {
    for (let i = 0; i < zone.xs.length - 1; i++) {
      const span = zone.xs[i + 1] - zone.xs[i]
      volume += ((area(zone.sections[i]) + area(zone.sections[i + 1])) / 2) * span
    }
  }
  return volume
}
