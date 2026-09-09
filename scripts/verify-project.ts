import { parseProject, serializeProject, projectFileName } from '../src/export/project'
import { DEFAULT_DIMENSIONS } from '../src/geometry/dimensions'
import type { Piece } from '../src/types'

let fails = 0
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
}

const piece = (id: string, over: Partial<Piece> = {}): Piece => ({
  id,
  name: `Piece ${id}`,
  kind: 'straight',
  lanes: 2,
  length: 137.5,
  radius: 120,
  angleDeg: 45,
  position: [1, 2, 3],
  rotation: [0.1, 0.2, 0.3],
  color: '#ff8800',
  connectors: { a: false, b: true },
  connectorColor: '#334455',
  links: { a: null, b: null },
  visible: true,
  locked: false,
  ...over,
})

// Two pieces joined b <-> a.
const p1 = piece('p1', { links: { a: null, b: { pieceId: 'p2', port: 'a' } }, connectors: { a: false, b: true } })
const p2 = piece('p2', { kind: 'curve', links: { a: { pieceId: 'p1', port: 'b' }, b: null } })

const snapshot = {
  projectName: 'My Big Track!',
  trackType: 'car' as const,
  dims: { ...DEFAULT_DIMENSIONS, track: { ...DEFAULT_DIMENSIONS.track, totalHeight: 15.5 } },
  pieces: [p1, p2],
  printer: { id: 'prusa-mk4' },
  customPrinterSize: [200, 210, 220] as [number, number, number],
  gravity: 9810,
  friction: 0.42,
}

const text = JSON.stringify(serializeProject(snapshot), null, 2)
const back = parseProject(text)

check('filename from project title', projectFileName(snapshot.projectName) === 'My-Big-Track.tm.json', projectFileName(snapshot.projectName))
check('name round-trips', back.name === snapshot.projectName)
check('edited dimension round-trips', back.dims.track.totalHeight === 15.5)
check('untouched dimension kept', back.dims.connector.holeSpan === DEFAULT_DIMENSIONS.connector.holeSpan)
check('piece count', back.pieces.length === 2)
check('pieces identical', JSON.stringify(back.pieces) === JSON.stringify(snapshot.pieces))
check('printer round-trips', back.printerId === 'prusa-mk4')
check('friction round-trips', back.friction === 0.42)
check('custom printer size', JSON.stringify(back.customPrinterSize) === '[200,210,220]')

// A file written before a dimension existed picks up today's default.
const missingDim = JSON.parse(text)
delete missingDim.dims.connector.holeSpan
delete missingDim.gravity
const patched = parseProject(JSON.stringify(missingDim))
check('missing dimension falls back to default', patched.dims.connector.holeSpan === DEFAULT_DIMENSIONS.connector.holeSpan)
check('missing gravity falls back to default', patched.gravity === 9810)

// A link to a deleted piece is dropped rather than left dangling.
const orphan = JSON.parse(text)
orphan.pieces = [orphan.pieces[0]]
const pruned = parseProject(JSON.stringify(orphan))
check('dangling link dropped', pruned.pieces[0].links.b === null)

// A one-sided link (the other end does not agree) is dropped.
const oneSided = JSON.parse(text)
oneSided.pieces[1].links.a = null
const fixed = parseProject(JSON.stringify(oneSided))
check('one-sided link dropped', fixed.pieces[0].links.b === null && fixed.pieces[1].links.a === null)

// Junk input is rejected with a readable message.
for (const [label, bad] of [
  ['not json', '{oops'],
  ['wrong format marker', '{"hello":"world"}'],
  ['newer format version', JSON.stringify({ format: 'track-maker', formatVersion: 99 })],
] as const) {
  let msg = ''
  try {
    parseProject(bad)
  } catch (e) {
    msg = (e as Error).message
  }
  check(`rejects ${label}`, msg.length > 0, msg)
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
