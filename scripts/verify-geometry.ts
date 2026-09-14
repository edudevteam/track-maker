import * as THREE from 'three'
import { DEFAULT_DIMENSIONS, floorTopY, laneWidth, validateDimensions, type Dimensions } from '../src/geometry/dimensions.ts'
import { buildSnapClipGeometry, clipSeatY, snapClipShape, snapClipVolume } from '../src/geometry/snapClip.ts'
import { buildTrackGeometry, plainVolume, plainZones } from '../src/geometry/parts.ts'
import { slotMetrics, trackProfile, wallMetrics } from '../src/geometry/trackProfile.ts'
import { signedArea } from '../src/geometry/sweep.ts'
import {
  buildTransitionGeometry,
  maxFlatEnd,
  minFlatEnd,
  transitionCornerLimit,
  transitionVolume,
  transitionZones,
} from '../src/geometry/transition.ts'
import {
  buildJunctionGeometry,
  junctionClipLength,
  junctionGrid,
  junctionSide,
  junctionVolume,
} from '../src/geometry/junction.ts'

const d = DEFAULT_DIMENSIONS

function volume(g: THREE.BufferGeometry) {
  const idx = g.getIndex()!
  const pos = g.getAttribute('position')
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let v = 0
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i))
    b.fromBufferAttribute(pos, idx.getX(i + 1))
    c.fromBufferAttribute(pos, idx.getX(i + 2))
    v += a.dot(b.clone().cross(c))
  }
  return v / 6
}

/** A closed manifold has every edge used exactly twice, once in each direction. */
function edgeAudit(g: THREE.BufferGeometry) {
  const idx = g.getIndex()!
  const pos = g.getAttribute('position')
  // Normalise through Number so -0 and 0 quantise to the same key.
  const q = (v: number) => String(+v.toFixed(4) + 0)
  const key = (i: number) => `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`
  const edges = new Map<string, number>()
  for (let i = 0; i < idx.count; i += 3) {
    const k = [key(idx.getX(i)), key(idx.getX(i + 1)), key(idx.getX(i + 2))]
    for (let e = 0; e < 3; e++) {
      const p = k[e], q = k[(e + 1) % 3]
      const id = p < q ? `${p}|${q}` : `${q}|${p}`
      edges.set(id, (edges.get(id) ?? 0) + 1)
    }
  }
  let bad = 0
  const samples: string[] = []
  for (const [id, n] of edges) {
    if (n === 2) continue
    bad++
    if (samples.length < 6) samples.push(`${id} ×${n}`)
  }
  return { edges: edges.size, nonManifold: bad, samples }
}

const bar = (s: string) => console.log(`\n=== ${s} ===`)

bar('control')
const box = new THREE.BoxGeometry(10, 10, 10).toNonIndexed()
box.setIndex(Array.from({ length: box.getAttribute('position').count }, (_, i) => i))
console.log('10mm cube volume =', volume(box).toFixed(1), '(expect 1000.0)')

bar('dimension sanity')
console.log('lane pitch      ', laneWidth(d.track).toFixed(3), 'mm')
console.log('channel floor at', floorTopY(d.track).toFixed(3), 'mm')
console.log('warnings        ', validateDimensions(d).map((w) => w.field))

bar('cross-section')
for (const lanes of [1, 2, 4]) {
  const p = trackProfile(d, lanes)
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y)
  console.log(
    `lanes=${lanes} pts=${p.length} width=${(Math.max(...xs) - Math.min(...xs)).toFixed(3)}` +
      ` height=${(Math.max(...ys) - Math.min(...ys)).toFixed(3)} area=${Math.abs(signedArea(p)).toFixed(2)}mm²`,
  )
}

bar('against the measured part')
// Every number below was measured off _models/Single-Track-V2.stl. These are
// the dimensions the printed track actually has, so a drift here is a drift away
// from something that fits real track. The clip is checked against its own part,
// _models/SR2_Single_230116.stl, in the clip section.
{
  const t = d.track
  const { slotH, mouthH, outerHalf, mouthHalf } = slotMetrics(d)
  const { innerX, rampBottomX } = wallMetrics(t, laneWidth(t) / 2)
  const checks: [string, number, number][] = [
    ['lane pitch', laneWidth(t), 40.013],
    ['wall thickness', t.wallThickness, 2.453],
    ['inner wall face', innerX, 17.554],
    ['channel floor half-width', rampBottomX, 16.281],
    ['channel floor height', floorTopY(t), 6.4],
    ['total height', t.totalHeight, 16.389],
    ['slot mouth width', 2 * mouthHalf, 21.094],
    ['slot mouth depth', mouthH, 3.211],
    ['slot undercut width', 2 * outerHalf, 26.232],
    ['slot total depth', slotH, 5.111],
    ['material above slot', floorTopY(t) - slotH, 1.289],
    // The clip sits up against the slot ceiling, so what the 4.647 clip leaves of
    // the 5.111 slot is under it.
    ['clip seat (gap under clip)', clipSeatY(d), 0.464],
  ]
  for (const [name, got, want] of checks) {
    const off = Math.abs(got - want)
    console.log(`${off < 2e-3 ? 'ok  ' : 'BAD '} ${name.padEnd(26)} ${got.toFixed(3)} (want ${want.toFixed(3)})`)
  }
}

bar('track solids')
for (const spec of [
  { kind: 'straight' as const, lanes: 1, length: 135, radius: 0, angleDeg: 0 },
  { kind: 'straight' as const, lanes: 2, length: 100, radius: 0, angleDeg: 0 },
  // Longer than two insets, exactly two insets, and shorter — the last two have
  // no solid middle left and must fall back to a slot running the whole way.
  { kind: 'straight' as const, lanes: 1, length: 80, radius: 0, angleDeg: 0 },
  { kind: 'straight' as const, lanes: 2, length: 50, radius: 0, angleDeg: 0 },
  { kind: 'curve' as const, lanes: 1, length: 0, radius: 120, angleDeg: 45 },
  { kind: 'curve' as const, lanes: 1, length: 0, radius: 120, angleDeg: -90 },
  { kind: 'curve' as const, lanes: 2, length: 0, radius: 90, angleDeg: 180 },
  { kind: 'curve' as const, lanes: 1, length: 0, radius: 60, angleDeg: 30 },
]) {
  const piece = { ...spec, id: 'x', name: 'x', position: [0, 0, 0], rotation: [0, 0, 0], color: '#fff', connectors: { a: true, b: true }, connectorColor: '#fff', links: { a: null, b: null }, visible: true, locked: false } as never
  const g = buildTrackGeometry(piece, d)
  const bb = g.boundingBox!
  const audit = edgeAudit(g)
  const z = plainZones(d, spec)
  const expected = plainVolume(d, piece)
  const got = volume(g)
  // A straight is swept exactly; a curve chords its revolve, so it comes out
  // slightly under and the tolerance has to allow for the tessellation.
  const tol = spec.kind === 'straight' ? 1e-6 : 2e-3
  const off = Math.abs(got - expected) / expected
  console.log(
    `${spec.kind} lanes=${spec.lanes} len=${z.length.toFixed(1)} zones=${z.zones.length}` +
      `${z.through ? ' (slot runs through)' : ` pocket=${z.inset.toFixed(1)}`}` +
      ` tris=${g.getIndex()!.count / 3}` +
      ` vol=${got.toFixed(1)}mm³ (expect ${expected.toFixed(1)}, off ${(off * 100).toFixed(3)}% ${off <= tol ? 'ok' : 'BAD'})` +
      ` bbox=[${bb.min.toArray().map((n) => n.toFixed(1))}]→[${bb.max.toArray().map((n) => n.toFixed(1))}]` +
      ` nonManifoldEdges=${audit.nonManifold}/${audit.edges}`,
  )
  for (const s of audit.samples) console.log('  bad edge', s)
}

bar('the slot is a pocket, not a channel')
for (const spec of [
  { kind: 'straight' as const, lanes: 1, length: 135, radius: 0, angleDeg: 0 },
  { kind: 'straight' as const, lanes: 2, length: 150, radius: 0, angleDeg: 0 },
]) {
  const piece = { ...spec, id: 'x', name: 'x', position: [0, 0, 0], rotation: [0, 0, 0], color: '#fff', connectors: { a: true, b: true }, connectorColor: '#fff', links: { a: null, b: null }, visible: true, locked: false } as never
  const g = buildTrackGeometry(piece, d)
  const pos = g.getAttribute('position')
  const { slotH } = slotMetrics(d)
  const inset = plainZones(d, spec).inset
  // Every vertex at slot-ceiling height is inside a pocket, so the furthest one
  // in says where the pocket stops.
  let deepest = 0
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - slotH) > 1e-6) continue
    deepest = Math.max(deepest, Math.min(pos.getX(i), spec.length - pos.getX(i)))
  }
  console.log(
    `${spec.kind} lanes=${spec.lanes} len=${spec.length}: slot ceiling reaches ${deepest.toFixed(2)}` +
      ` in from each end (pocket is ${inset.toFixed(2)}) ${Math.abs(deepest - inset) < 1e-6 ? 'ok' : 'BAD'}`,
  )
}

bar('transition solids')
for (const spec of [
  { lanesA: 1, lanesB: 2, length: 110 },
  { lanesA: 2, lanesB: 1, length: 110 },
  { lanesA: 1, lanesB: 4, length: 140 },
  { lanesA: 3, lanesB: 2, length: 120 },
  { lanesA: 2, lanesB: 5, length: 200 },
]) {
  const g = buildTransitionGeometry(d, spec)
  const bb = g.boundingBox!
  const audit = edgeAudit(g)
  const expected = transitionVolume(d, spec)
  const got = volume(g)
  const off = Math.abs(got - expected) / expected
  console.log(
    `${spec.lanesA}->${spec.lanesB} len=${spec.length} tris=${g.getIndex()!.count / 3}` +
      ` vol=${got.toFixed(1)}mm³ (expect ${expected.toFixed(1)}, off ${(off * 100).toFixed(3)}%)` +
      ` bbox=[${bb.min.toArray().map((n) => n.toFixed(1))}]→[${bb.max.toArray().map((n) => n.toFixed(1))}]` +
      ` nonManifoldEdges=${audit.nonManifold}/${audit.edges}`,
  )
  for (const s of audit.samples) console.log('  bad edge', s)
}

bar('rounded transition corners')
for (const spec of [
  { lanesA: 1, lanesB: 2, length: 110 },
  { lanesA: 1, lanesB: 4, length: 140 },
  { lanesA: 3, lanesB: 2, length: 120 },
  { lanesA: 2, lanesB: 5, length: 200 },
]) {
  const limit = transitionCornerLimit(d, spec)
  // Square, part-way, right on the limit, and past it — the last must clamp.
  for (const r of [limit * 0.5, limit, limit * 2]) {
    const rounded = { ...spec, cornerRadius: r }
    const z = transitionZones(d, rounded)
    const g = buildTransitionGeometry(d, rounded)
    const audit = edgeAudit(g)
    const expected = transitionVolume(d, rounded)
    const got = volume(g)
    const taper = z.zones[1]
    // The taper has to leave both end zones level, or the slots and the joint
    // fit would not be the width they claim.
    const endsLevel =
      Math.abs(taper.xs[0] - z.x0) + Math.abs(taper.xs[taper.xs.length - 1] - z.x1)
    console.log(
      `${spec.lanesA}->${spec.lanesB} r=${r.toFixed(1)} (limit ${limit.toFixed(1)}, used ${z.cornerRadius.toFixed(1)})` +
        ` stations=${taper.xs.length} vol off ${(Math.abs(got - expected) / expected * 100).toFixed(3)}%` +
        ` endsOffBy=${endsLevel.toExponential(0)}mm nonManifoldEdges=${audit.nonManifold}/${audit.edges}`,
    )
    for (const s of audit.samples) console.log('  bad edge', s)
  }
}

bar('slow tapers — short flat ends')
for (const spec of [
  { lanesA: 1, lanesB: 2, length: 150 },
  { lanesA: 1, lanesB: 4, length: 192 },
  { lanesA: 4, lanesB: 1, length: 192 },
]) {
  const min = minFlatEnd(d)
  for (const flatEnd of [min, min * 1.5, maxFlatEnd(spec.length), 5]) {
    for (const cornerRadius of [0, 1e6]) {
      const part = { ...spec, flatEnd, cornerRadius }
      const z = transitionZones(d, part)
      const g = buildTransitionGeometry(d, part)
      const audit = edgeAudit(g)
      const expected = transitionVolume(d, part)
      const got = volume(g)
      const span = (z.x1 - z.x0) / z.length
      // Whatever the flat ends were asked for, the clip still has to find slot.
      const seats = z.flatEnd >= min - 1e-9 || z.flatEnd === maxFlatEnd(spec.length)
      console.log(
        `${spec.lanesA}->${spec.lanesB} flat=${flatEnd.toFixed(1)}→${z.flatEnd.toFixed(1)}` +
          ` round=${cornerRadius ? 'full' : 'square'} taper=${(span * 100).toFixed(0)}%` +
          ` vol off ${(Math.abs(got - expected) / expected * 100).toFixed(3)}%` +
          ` clipSeats=${seats} nonManifoldEdges=${audit.nonManifold}/${audit.edges}`,
      )
      for (const s of audit.samples) console.log('  bad edge', s)
    }
  }
}

bar('junction solids')
for (const spec of [
  { lanes: 1, openLeft: true, openRight: false },
  { lanes: 1, openLeft: false, openRight: true },
  { lanes: 1, openLeft: true, openRight: true },
  { lanes: 1, openLeft: false, openRight: false },
  { lanes: 2, openLeft: true, openRight: true },
  { lanes: 2, openLeft: true, openRight: false },
  { lanes: 3, openLeft: true, openRight: true },
  { lanes: 4, openLeft: true, openRight: true },
]) {
  const g = buildJunctionGeometry(d, spec)
  const bb = g.boundingBox!
  const audit = edgeAudit(g)
  const expected = junctionVolume(d, spec)
  const got = volume(g)
  const grid = junctionGrid(d, spec)
  const sides = `${spec.openLeft ? 'L' : '-'}${spec.openRight ? 'R' : '-'}`
  console.log(
    `lanes=${spec.lanes} ${sides} side=${grid.side.toFixed(2)} cells=${grid.n}×${grid.n}` +
      ` tris=${g.getIndex()!.count / 3}` +
      ` vol=${got.toFixed(1)}mm³ (expect ${expected.toFixed(1)}, off ${(Math.abs(got - expected) / expected * 100).toFixed(3)}%)` +
      ` bbox=[${bb.min.toArray().map((n) => n.toFixed(1))}]→[${bb.max.toArray().map((n) => n.toFixed(1))}]` +
      ` nonManifoldEdges=${audit.nonManifold}/${audit.edges}`,
  )
  for (const s of audit.samples) console.log('  bad edge', s)
}

bar('junction takes a clip on every side')
console.log('junction clip   ', junctionClipLength(d).toFixed(1), 'mm (the clip is', snapClipShape(d).L, 'mm)')
for (const lanes of [1, 2, 3, 4]) {
  const grid = junctionGrid(d, { lanes, openLeft: true, openRight: true })
  const outerHalf = d.track.slotOuterWidth / 2
  // An end slot reaches `reach` in from its face; the nearest a side slot comes
  // to that face is its outermost lane centre less half a slot. The two must not
  // meet, or the clips would have nowhere to sit.
  const nearestSide = grid.half + grid.centres[0] - outerHalf
  const clearance = nearestSide - grid.reach
  // And the channel through the tile has to be the one a straight of that width
  // has, or a car would step sideways crossing the joint.
  const straightChannel = wallMetrics(d.track, (laneWidth(d.track) * lanes) / 2)
  console.log(
    `lanes=${lanes} side=${grid.side.toFixed(2)} (${(grid.side / laneWidth(d.track)).toFixed(2)} pitches)` +
      ` opening=${(laneWidth(d.track) * lanes).toFixed(2)} reach=${grid.reach.toFixed(2)}` +
      ` slotClearance=${clearance.toFixed(2)}mm` +
      ` channelHalf=${grid.chanHalf.toFixed(3)} (straight ${straightChannel.innerX.toFixed(3)})` +
      ` floorHalf=${grid.rampInner.toFixed(3)} (straight ${straightChannel.rampBottomX.toFixed(3)})`,
  )
}

bar('junction slots line up with a plain piece')
for (const lanes of [1, 2, 3]) {
  const grid = junctionGrid(d, { lanes, openLeft: true, openRight: true })
  // Mouth and undercut edges the junction offers on each of its four sides,
  // against the ones a straight of that width has. A clip only passes from one
  // piece into the other if these agree.
  const mouth = Math.min(
    d.track.slotMouthWidth / 2,
    Math.min(d.track.slotOuterWidth / 2, laneWidth(d.track) / 2 - 0.2) - 0.05,
  )
  const half = (laneWidth(d.track) * lanes) / 2
  const want = Array.from({ length: lanes }, (_, i) => -half + laneWidth(d.track) * (i + 0.5)).flatMap(
    (c) => [c - grid.outerHalf, c - mouth, c + mouth, c + grid.outerHalf],
  )
  const got = grid.centres.flatMap((c) => [
    c - grid.outerHalf,
    c - grid.mouthHalf,
    c + grid.mouthHalf,
    c + grid.outerHalf,
  ])
  const worst = got.length !== want.length ? Infinity : Math.max(...got.map((v, i) => Math.abs(v - want[i])))
  console.log(
    `lanes=${lanes} slots=${grid.centres.length} per side, edges off by ${worst.toExponential(1)}mm`,
  )
}

bar('junction side follows the lane count')
for (const lanes of [1, 2, 4, 8]) {
  console.log(`lanes=${lanes} side=${junctionSide(d, lanes).toFixed(3)}mm`)
}

bar('transition slots line up with a plain piece')
for (const spec of [
  { lanesA: 1, lanesB: 2, length: 110 },
  { lanesA: 3, lanesB: 2, length: 120 },
  { lanesA: 2, lanesB: 5, length: 200 },
]) {
  const z = transitionZones(d, spec)
  // Mouth edges the transition offers each end, against the ones a plain piece
  // of that width has — a clip only seats if these agree.
  const wanted = (n: number) => {
    const half = (laneWidth(d.track) * n) / 2
    const mouth = Math.min(
      d.track.slotMouthWidth / 2,
      Math.min(d.track.slotOuterWidth / 2, laneWidth(d.track) / 2 - 0.2) - 0.05,
    )
    return Array.from({ length: n }, (_, i) => -half + laneWidth(d.track) * (i + 0.5)).flatMap((c) => [
      c - mouth,
      c + mouth,
    ])
  }
  const gotA = z.slotsA.flatMap((s) => [s.uLeft * z.halfA, s.uRight * z.halfA])
  const gotB = z.slotsB.flatMap((s) => [s.uLeft * z.halfB, s.uRight * z.halfB])
  const worst = (got: number[], want: number[]) =>
    got.length !== want.length ? Infinity : Math.max(...got.map((v, i) => Math.abs(v - want[i])))
  console.log(
    `${spec.lanesA}->${spec.lanesB} a-end slots=${z.slotsA.length} off by ${worst(gotA, wanted(spec.lanesA)).toExponential(1)}mm,` +
      ` b-end slots=${z.slotsB.length} off by ${worst(gotB, wanted(spec.lanesB)).toExponential(1)}mm`,
  )
}

bar('connector clip (snap)')
{
  // The 40mm clip as built, and the same design at the printed part's 70mm with
  // three holes, which can be held against the part itself.
  const replica: Dimensions = { ...d, snapClip: { ...d.snapClip, length: 70, holeCount: 3 } }
  for (const [label, dims] of [
    ['40mm', d],
    ['70mm replica', replica],
  ] as [string, Dimensions][]) {
    const g = buildSnapClipGeometry(dims)
    const s = snapClipShape(dims)
    const bb = g.boundingBox!
    const audit = edgeAudit(g)
    const got = volume(g)
    const want = snapClipVolume(dims)
    const off = Math.abs(got - want) / want
    console.log(
      `${label} tris=${g.getIndex()!.count / 3} vol=${got.toFixed(1)}mm³ (expect ${want.toFixed(1)},` +
        ` off ${(off * 100).toFixed(4)}% ${off < 1e-5 ? 'ok' : 'BAD'}) holes at [${s.holes.map((x) => x.toFixed(3))}]` +
        ` bbox=[${bb.min.toArray().map((n) => n.toFixed(3))}]→[${bb.max.toArray().map((n) => n.toFixed(3))}]` +
        ` nonManifoldEdges=${audit.nonManifold}/${audit.edges} ${audit.nonManifold === 0 ? 'ok' : 'BAD'}`,
    )
    for (const smp of audit.samples) console.log('  bad edge', smp)
  }
  // Against _models/SR2_Single_230116.stl. Its volume is 4662.5mm³; its holes are
  // finer circles than the 32-sided ones here, which accounts for a few mm³.
  const s = snapClipShape(replica)
  const checks: [string, number, number, number][] = [
    ['replica volume', volume(buildSnapClipGeometry(replica)), 4662.5, 0.005 * 4662.5],
    ['body width', 2 * s.hb, 19.593, 2e-3],
    ['wing span', 2 * s.hw, 26.611, 2e-3],
    ['wing ledge', s.stepY, 3.211, 2e-3],
    ['wing tip top', s.tipY, 3.847, 2e-3],
    ['height', s.H, 4.647, 2e-3],
    ['slot inner edge', s.stripHalf, 5.0965, 2e-3],
    ['slot outer edge', s.slotOuter, 8.1955, 2e-3],
    ['slots start', s.bridge, 3, 2e-3],
    ['end chamfer', s.endChamfer, 3.407, 2e-3],
    ['top face corner', s.endChamfer - s.inset, 2.607, 2e-3],
    ['first hole', s.holes[0], 10.845, 5e-3],
    ['middle hole', s.holes[1], 35.001, 5e-3],
    ['last hole', s.holes[2], 59.157, 5e-3],
    ['countersink Ø', 2 * s.csR, 8.5, 5e-3],
  ]
  for (const [name, got, want, tol] of checks) {
    console.log(`${Math.abs(got - want) <= tol ? 'ok  ' : 'BAD '} ${name.padEnd(18)} ${got.toFixed(3)} (SR2 ${want.toFixed(3)})`)
  }
}
