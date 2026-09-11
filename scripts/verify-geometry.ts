import * as THREE from 'three'
import { DEFAULT_DIMENSIONS, floorTopY, laneWidth, validateDimensions } from '../src/geometry/dimensions.ts'
import { buildConnectorGeometry, buildTrackGeometry } from '../src/geometry/parts.ts'
import { trackProfile, wallMetrics } from '../src/geometry/trackProfile.ts'
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

bar('track solids')
for (const spec of [
  { kind: 'straight' as const, lanes: 1, length: 100, radius: 0, angleDeg: 0 },
  { kind: 'straight' as const, lanes: 2, length: 100, radius: 0, angleDeg: 0 },
  { kind: 'curve' as const, lanes: 1, length: 0, radius: 120, angleDeg: 45 },
  { kind: 'curve' as const, lanes: 1, length: 0, radius: 120, angleDeg: -90 },
]) {
  const piece = { ...spec, id: 'x', name: 'x', position: [0, 0, 0], rotation: [0, 0, 0], color: '#fff', connectors: { a: true, b: true }, connectorColor: '#fff', links: { a: null, b: null }, visible: true, locked: false } as never
  const g = buildTrackGeometry(piece, d)
  const bb = g.boundingBox!
  const audit = edgeAudit(g)
  const expected = spec.kind === 'straight' ? Math.abs(signedArea(trackProfile(d, spec.lanes))) * spec.length : null
  console.log(
    `${spec.kind} lanes=${spec.lanes} tris=${g.getIndex()!.count / 3}` +
      ` vol=${volume(g).toFixed(1)}mm³${expected ? ` (expect ${expected.toFixed(1)})` : ''}` +
      ` bbox=[${bb.min.toArray().map((n) => n.toFixed(1))}]→[${bb.max.toArray().map((n) => n.toFixed(1))}]` +
      ` nonManifoldEdges=${audit.nonManifold}/${audit.edges}`,
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
console.log('junction clip   ', junctionClipLength(d).toFixed(1), 'mm (standard is', d.connector.length, 'mm)')
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

bar('connector clip')
const c = buildConnectorGeometry(d)
const cbb = c.boundingBox!
const caudit = edgeAudit(c)
console.log(
  `tris=${c.getIndex()!.count / 3} vol=${volume(c).toFixed(1)}mm³` +
    ` bbox=[${cbb.min.toArray().map((n) => n.toFixed(2))}]→[${cbb.max.toArray().map((n) => n.toFixed(2))}]` +
    ` nonManifoldEdges=${caudit.nonManifold}/${caudit.edges}`,
)
for (const s of caudit.samples) console.log('  bad edge', s)
