import * as THREE from 'three'
import { DEFAULT_DIMENSIONS, floorTopY, laneWidth, validateDimensions } from '../src/geometry/dimensions.ts'
import { buildConnectorGeometry, buildTrackGeometry } from '../src/geometry/parts.ts'
import { trackProfile } from '../src/geometry/trackProfile.ts'
import { signedArea } from '../src/geometry/sweep.ts'

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
