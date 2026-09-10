/**
 * Audit for the closing-part solver, the way `verify-geometry.ts` audits the
 * meshes. Each round trip places a known part between two ends, takes it away,
 * and asks the solver to fill the hole it left: if what comes back does not
 * close the gap to within the joint tolerance, the solver is wrong.
 *
 *   npx vite build --ssr scripts/verify-closure.ts --outDir node_modules/.vc --config /dev/null
 *   node node_modules/.vc/verify-closure.js
 */
import { transformToMate, worldPortFrame } from '../src/lib/ports'
import { fitOf, measureGap, suggestPart } from '../src/lib/closure'
import { DEFAULT_DIMENSIONS } from '../src/geometry/dimensions'
import type { PartSpec, Piece, PieceKind, PortId } from '../src/types'

let n = 0
const piece = (init: Partial<Piece>): Piece => ({
  id: `p${n++}`,
  name: 'x',
  kind: 'straight',
  lanes: 1,
  lanesB: 2,
  length: 100,
  cornerRadius: 0,
  flatEnd: 35,
  radius: 120,
  angleDeg: 45,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  color: '#fff',
  connectors: { a: false, b: false },
  connectorColor: '#fff',
  links: { a: null, b: null },
  visible: true,
  locked: false,
  ...init,
})

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/**
 * Build A → bridge → B, then measure the gap between A's far end and B's near
 * end as if the bridge were not there.
 */
function scenario(bridge: Partial<Piece>, tailRotation: [number, number, number] = [0, 0, 0]) {
  const a = piece({ kind: 'straight', length: 100, position: [0, 0, 0] })
  const mid = piece({ ...bridge })
  const seat = transformToMate(mid, 'a', worldPortFrame(a, 'b'))
  mid.position = seat.position
  mid.rotation = seat.rotation
  const b = piece({ kind: 'straight', length: 100, rotation: tailRotation })
  const bSeat = transformToMate(b, 'a', worldPortFrame(mid, 'b'))
  b.position = bSeat.position
  b.rotation = bSeat.rotation
  return { pieces: [a, b], a: { pieceId: a.id, port: 'b' as PortId }, b: { pieceId: b.id, port: 'a' as PortId } }
}

function roundTrip(label: string, kind: PieceKind, bridge: Partial<Piece>) {
  const s = scenario(bridge)
  const gap = measureGap(s.pieces, s.a, s.b)
  if (!gap) return check(label, false, 'no gap measured')
  const spec = suggestPart(kind, gap, DEFAULT_DIMENSIONS)
  const fit = fitOf(spec, gap)
  check(
    label,
    fit.exact,
    `gap ${fit.gap.toFixed(4)}mm, angle ${fit.angleDeg.toFixed(4)}° · suggested ` +
      `${spec.kind} len ${spec.length.toFixed(2)} r ${spec.radius.toFixed(2)} sweep ${spec.angleDeg.toFixed(2)}`,
  )
}

roundTrip('straight 100 closes a straight gap', 'straight', { kind: 'straight', length: 100 })
roundTrip('straight 237.5 closes a straight gap', 'straight', { kind: 'straight', length: 237.5 })
roundTrip('curve 90° r120 left', 'curve', { kind: 'curve', radius: 120, angleDeg: 90 })
roundTrip('curve 90° r120 right', 'curve', { kind: 'curve', radius: 120, angleDeg: -90 })
roundTrip('curve 37° r260 left', 'curve', { kind: 'curve', radius: 260, angleDeg: 37 })
roundTrip('curve 135° r80 right', 'curve', { kind: 'curve', radius: 80, angleDeg: -135 })
roundTrip('curve 179° r150 left', 'curve', { kind: 'curve', radius: 150, angleDeg: 179 })
roundTrip('hairpin 210° r70 left', 'curve', { kind: 'curve', radius: 70, angleDeg: 210 })
roundTrip('hairpin 270° r90 right', 'curve', { kind: 'curve', radius: 90, angleDeg: -270 })
roundTrip('transition 1x->2x', 'transition', {
  kind: 'transition',
  lanes: 1,
  lanesB: 2,
  length: 150,
})

// A gap the solver cannot close: the far end is lifted off the workplane.
{
  const s = scenario({ kind: 'straight', length: 100 })
  const lifted = s.pieces.map((p) =>
    p.id === s.b.pieceId ? { ...p, position: [p.position[0], p.position[1] + 20, p.position[2]] as [number, number, number] } : p,
  )
  const gap = measureGap(lifted, s.a, s.b)!
  const straight = fitOf(suggestPart('straight', gap, DEFAULT_DIMENSIONS), gap)
  const curve = fitOf(suggestPart('curve', gap, DEFAULT_DIMENSIONS), gap)
  check('a raised end closes with nothing', !straight.exact && !curve.exact, `rise ${gap.rise.toFixed(2)}mm`)
  check('the rise is reported', Math.abs(gap.rise - 20) < 1e-6, `${gap.rise.toFixed(3)}`)
}

// Two ends of one run are flagged, so the picker knows nothing can be moved.
{
  const a = piece({ kind: 'straight', length: 100 })
  const b = piece({ kind: 'straight', length: 100, links: { a: { pieceId: a.id, port: 'b' }, b: null } })
  a.links = { a: null, b: { pieceId: b.id, port: 'a' } }
  const joined = measureGap([a, b], { pieceId: a.id, port: 'a' }, { pieceId: b.id, port: 'b' })!
  check('two ends of one run are flagged', joined.sameRun)
  const loose = measureGap([a, piece({})], { pieceId: a.id, port: 'a' }, { pieceId: piece({}).id, port: 'b' })
  check('a separate run is not', loose === null || !loose.sameRun)
}

// Width is read off each end, whatever the piece is.
{
  const a = piece({ kind: 'transition', lanes: 1, lanesB: 3, length: 150 })
  const b = piece({ kind: 'straight', lanes: 2, position: [400, 0, 0] })
  const gap = measureGap([a, b], { pieceId: a.id, port: 'b' }, { pieceId: b.id, port: 'a' })!
  check('widths come off the ends', gap.lanesA === 3 && gap.lanesB === 2, `${gap.lanesA}× / ${gap.lanesB}×`)
  const spec: PartSpec = suggestPart('transition', gap, DEFAULT_DIMENSIONS)
  check('a transition takes both widths', spec.lanes === 3 && spec.lanesB === 2)
  const straight = suggestPart('straight', gap, DEFAULT_DIMENSIONS)
  check('a straight takes the near width at both ends', straight.lanes === 3 && straight.lanesB === 3)
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed')
process.exit(failures ? 1 : 0)
