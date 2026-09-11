import { parseProject, serializeProject, projectFileName } from '../src/export/project'
import { DEFAULT_DIMENSIONS } from '../src/geometry/dimensions'
import type { Piece } from '../src/types'
import { reflowFrom, worldPortFrame } from '../src/lib/ports'
import { DEFAULT_TOP_SPEED } from '../src/lib/driving'

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
  lanesB: 3,
  length: 137.5,
  cornerRadius: 6,
  flatEnd: 38,
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
  vehicle: 'diecast' as const,
  dims: { ...DEFAULT_DIMENSIONS, track: { ...DEFAULT_DIMENSIONS.track, totalHeight: 15.5 } },
  pieces: [p1, p2],
  printer: { id: 'prusa-mk4' },
  customPrinterSize: [200, 210, 220] as [number, number, number],
  gravity: 9810,
  friction: 0.42,
  topSpeed: 750,
}

const text = JSON.stringify(serializeProject(snapshot), null, 2)
const back = parseProject(text)

check('filename from project title', projectFileName(snapshot.projectName) === 'My-Big-Track.track.json', projectFileName(snapshot.projectName))
check('name round-trips', back.name === snapshot.projectName)
check('edited dimension round-trips', back.dims.track.totalHeight === 15.5)
check('untouched dimension kept', back.dims.connector.holeSpan === DEFAULT_DIMENSIONS.connector.holeSpan)
check('piece count', back.pieces.length === 2)
check('pieces identical', JSON.stringify(back.pieces) === JSON.stringify(snapshot.pieces))
check('printer round-trips', back.printerId === 'prusa-mk4')
check('friction round-trips', back.friction === 0.42)
check('top speed round-trips', back.carTopSpeed === 750, String(back.carTopSpeed))
check('custom printer size', JSON.stringify(back.customPrinterSize) === '[200,210,220]')
check('vehicle round-trips', back.vehicle === 'diecast')

// A file written before a dimension existed picks up today's default.
const missingDim = JSON.parse(text)
delete missingDim.dims.connector.holeSpan
delete missingDim.gravity
delete missingDim.carTopSpeed
const patched = parseProject(JSON.stringify(missingDim))
check('missing dimension falls back to default', patched.dims.connector.holeSpan === DEFAULT_DIMENSIONS.connector.holeSpan)
check('missing gravity falls back to default', patched.gravity === 9810)
check('missing top speed falls back to default', patched.carTopSpeed === DEFAULT_TOP_SPEED)
const oldMeaning = JSON.parse(text)
delete oldMeaning.carTopSpeed
oldMeaning.topSpeed = 33333
check("a 1.3.5 file's top speed is not read as this one", parseProject(JSON.stringify(oldMeaning)).carTopSpeed === DEFAULT_TOP_SPEED)

// Files saved before Settings existed, and the retired 'marble' track type,
// open as a car track with the die-cast vehicle rather than failing.
const legacy = JSON.parse(text)
legacy.trackType = 'marble'
delete legacy.vehicle
const opened = parseProject(JSON.stringify(legacy))
check('retired track type falls back to car', opened.trackType === 'car')
check('missing vehicle falls back to die cast', opened.vehicle === 'diecast')

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

// Resizing a piece has to carry whatever is clipped to it, or the two overlap.
{
  const a = piece('a', { kind: 'transition', length: 100, links: { a: null, b: { pieceId: 'b', port: 'a' } } })
  const b = piece('b', { kind: 'straight', length: 100, position: [0, 0, 0], rotation: [0, 0, 0] })
  b.links = { a: { pieceId: 'a', port: 'b' }, b: null }
  const c = piece('c', { kind: 'straight', length: 100 })
  c.links = { a: { pieceId: 'b', port: 'b' }, b: null }
  b.links.b = { pieceId: 'c', port: 'a' }

  // Seat the run properly first, then grow the transition and reflow again.
  const seated = reflowFrom([a, b, c], 'a')
  const grown = reflowFrom(
    seated.map((p) => (p.id === 'a' ? { ...p, length: 160 } : p)),
    'a',
  )

  const gap = (pieces: typeof grown, host: string, port: 'a' | 'b', other: string, otherPort: 'a' | 'b') => {
    const h = pieces.find((p) => p.id === host)!
    const o = pieces.find((p) => p.id === other)!
    return worldPortFrame(h, port).position.distanceTo(worldPortFrame(o, otherPort).position)
  }

  check('run seats end to end', gap(seated, 'a', 'b', 'b', 'a') < 1e-9 && gap(seated, 'b', 'b', 'c', 'a') < 1e-9)
  check('resizing carries the neighbour', gap(grown, 'a', 'b', 'b', 'a') < 1e-9, `gap ${gap(grown, 'a', 'b', 'b', 'a')}`)
  check('and everything beyond it', gap(grown, 'b', 'b', 'c', 'a') < 1e-9)
  // Growing the transition by 60mm has to slide the far side by exactly that.
  const shift = (id: string) => {
    const [x0, y0, z0] = seated.find((p) => p.id === id)!.position
    const [x1, y1, z1] = grown.find((p) => p.id === id)!.position
    return Math.hypot(x1 - x0, y1 - y0, z1 - z0)
  }
  check('the far side moved by the growth', Math.abs(shift('b') - 60) < 1e-9, `moved ${shift('b').toFixed(4)}`)
  check('so did the piece past it', Math.abs(shift('c') - 60) < 1e-9)
  check('the edited piece stayed put', shift('a') === 0)
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
