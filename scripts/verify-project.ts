import { parseProject, serializeProject, projectFileName } from '../src/export/project'
import { DEFAULT_DIMENSIONS } from '../src/geometry/dimensions'
import type { Piece } from '../src/types'
import { centrelineLength, pieceMatrix, reflowFrom, sampleCentreline, worldPortFrame } from '../src/lib/ports'
import { clipTwistAt, twistClip } from '../src/lib/clipTwist'
import { clipPlacement } from '../src/lib/supports'
import { buildSnapClipGeometry } from '../src/geometry/snapClip'
import { slotMetrics } from '../src/geometry/trackProfile'
import { DEFAULT_TOP_SPEED } from '../src/lib/driving'
import { clipLength } from '../src/lib/connectors'
import { junctionClipLength } from '../src/geometry/junction'
import { supportLeg } from '../src/lib/supports'
import { clipSeatY } from '../src/geometry/snapClip'
import { bendSpecOf, buildTrackGeometry, connectorOffsets } from '../src/geometry/parts'
import { trackProfile } from '../src/geometry/trackProfile'
import { stepLeanSlide, SIDE_GRIP } from '../src/lib/driving'
import { bedLength, levelOutRoll, portLean, rollIntoBank } from '../src/lib/levelling'
import { MAX_EDGE_GRADE, rollEdge, rollLayout, rollLeanAt } from '../src/geometry/bend'
import * as THREE from 'three'
import { pieceQuaternion } from '../src/lib/ports'

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
  bankAngle: 30,
  bankBase: true,
  bendMode: 'pitch',
  rollDeg: 30,
  rollStart: 0,
  easeFrom: 0,
  easeTo: 1,
  length: 137.5,
  slope: 0,
  base: 'none',
  openLeft: false,
  openRight: false,
  cornerRadius: 6,
  flatEnd: 38,
  radius: 120,
  angleDeg: 45,
  position: [1, 2, 3],
  rotation: [0.1, 0.2, 0.3],
  color: '#ff8800',
  connectors: { a: false, b: true, l: false, r: false },
  connectorColor: '#334455',
  links: { a: null, b: null, l: null, r: null },
  visible: true,
  locked: false,
  ...over,
})

// Two pieces joined b <-> a.
const p1 = piece('p1', {
  links: { a: null, b: { pieceId: 'p2', port: 'a' }, l: null, r: null },
  connectors: { a: false, b: true, l: false, r: false },
})
const p2 = piece('p2', { kind: 'curve', links: { a: { pieceId: 'p1', port: 'b' }, b: null, l: null, r: null } })
const p3 = piece('p3', { kind: 'bend', radius: 180, angleDeg: 22.5, slope: 35.5, base: 'b' })

const snapshot = {
  projectName: 'My Big Track!',
  trackType: 'car' as const,
  vehicle: 'diecast' as const,
  dims: { ...DEFAULT_DIMENSIONS, track: { ...DEFAULT_DIMENSIONS.track, totalHeight: 15.5 } },
  clipSize: 'long' as const,
  pieces: [p1, p2, p3],
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
check('connector choice round-trips', back.clipSize === 'long')
{
  const old = JSON.parse(text)
  delete old.clipSize
  check('a file without a connector choice opens with the short clip', parseProject(JSON.stringify(old)).clipSize === 'short')
}
check('edited dimension round-trips', back.dims.track.totalHeight === 15.5)
check('untouched dimension kept', back.dims.snapClip.holeInset === DEFAULT_DIMENSIONS.snapClip.holeInset)
check('piece count', back.pieces.length === 3)
check('a based bend keeps its shape and base', back.pieces[2].kind === 'bend' && back.pieces[2].slope === 35.5 && back.pieces[2].base === 'b')
{
  const old = JSON.parse(text)
  for (const p of old.pieces) {
    delete p.slope
    delete p.base
  }
  check('a file from before bends opens with no piece based', parseProject(JSON.stringify(old)).pieces.every((p) => p.base === 'none' && p.slope === 0))
  // 1.4.6's S-shaped ramp opens as a based bend about as high.
  const s1 = JSON.parse(text)
  s1.pieces[0] = { ...s1.pieces[0], kind: 'ramp', rise: 40 }
  s1.pieces[1] = { ...s1.pieces[1], kind: 'ramp', rise: -20 }
  const [r1, r2] = parseProject(JSON.stringify(s1)).pieces
  // Height between the ends, measured square to whichever end sits on the base.
  const height = (p: Piece) => {
    const at = { ...p, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
    const fa = worldPortFrame(at, 'a', DEFAULT_DIMENSIONS)
    const fb = worldPortFrame(at, 'b', DEFAULT_DIMENSIONS)
    const level = p.base === 'b' ? fb : fa
    return Math.abs(fb.position.clone().sub(fa.position).dot(new THREE.Vector3(0, 1, 0).applyQuaternion(level.quaternion)))
  }
  check('an old ramp up opens as a ramp up from side A', r1.kind === 'bend' && r1.base === 'a' && r1.angleDeg === 15 && Math.abs(height(r1) - 40) < 1)
  check('an old ramp down opens as a ramp down onto side B', r2.kind === 'bend' && r2.base === 'b' && r2.angleDeg === 15 && Math.abs(height(r2) - 20) < 1)
  const dims = JSON.parse(text)
  delete dims.dims.elevation
  check('a file from before ramps picks up the support defaults', JSON.stringify(parseProject(JSON.stringify(dims)).dims.elevation) === JSON.stringify(DEFAULT_DIMENSIONS.elevation))
}
check('pieces identical', JSON.stringify(back.pieces) === JSON.stringify(snapshot.pieces))
check('printer round-trips', back.printerId === 'prusa-mk4')
check('friction round-trips', back.friction === 0.42)
check('top speed round-trips', back.carTopSpeed === 750, String(back.carTopSpeed))
check('custom printer size', JSON.stringify(back.customPrinterSize) === '[200,210,220]')
check('vehicle round-trips', back.vehicle === 'diecast')

// A file written before a dimension existed picks up today's default.
const missingDim = JSON.parse(text)
delete missingDim.dims.snapClip.holeInset
delete missingDim.gravity
delete missingDim.carTopSpeed
const patched = parseProject(JSON.stringify(missingDim))
check('missing dimension falls back to default', patched.dims.snapClip.holeInset === DEFAULT_DIMENSIONS.snapClip.holeInset)
// A file saved with the old clip's `connector` dimensions opens with the snap clip.
const oldClip = JSON.parse(text)
oldClip.dims.connector = { length: 70, wingSpan: 26.232, holeCount: 3 }
delete oldClip.dims.snapClip
check('old clip dimensions do not reach the snap clip', JSON.stringify(parseProject(JSON.stringify(oldClip)).dims.snapClip) === JSON.stringify(DEFAULT_DIMENSIONS.snapClip))
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

// Settings ▸ Connector: the long clip goes in only where both pieces have the
// pocket for it with the end gap left clear.
{
  const d = DEFAULT_DIMENSIONS
  const at = (a: Partial<Piece>, b: Partial<Piece> | undefined, size: 'short' | 'long') =>
    clipLength(piece('x', a), b ? piece('y', b) : undefined, d, size)
  check('short setting keeps the 40mm clip', at({ length: 135 }, { length: 135 }, 'short') === 40)
  check('long setting fits 70mm between two full pockets', at({ length: 135 }, { length: 135 }, 'long') === 70)
  check('long clip on an open end', at({ length: 135 }, undefined, 'long') === 70)
  check('an 80mm straight still has the room', at({ length: 80 }, { length: 135 }, 'long') === 70)
  check('a 75mm straight takes the short clip', at({ length: 75 }, { length: 135 }, 'long') === 40)
  check('so does its neighbour', at({ length: 135 }, { length: 75 }, 'long') === 40)
  check('a long curve takes the long clip', at({ kind: 'curve', radius: 300, angleDeg: 45 }, { length: 135 }, 'long') === 70)
  check('a transition with 40mm flat ends takes it', at({ kind: 'transition', length: 200, flatEnd: 40 }, { length: 135 }, 'long') === 70)
  check('one with 35mm flat ends does not', at({ kind: 'transition', length: 200, flatEnd: 35 }, { length: 135 }, 'long') === 40)
  check('a junction keeps its own clip', at({ kind: 'junction' }, { length: 135 }, 'long') === junctionClipLength(d))
}


{
  // A whole hill: a ramp up from the floor, a slope, a bend over onto a level
  // top, a bend back down, a slope, and a ramp down onto the floor. Which joints
  // need a leg, and at what tilt?
  const d = DEFAULT_DIMENSIONS
  const flat = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
  const chain = (ids: string[], i: number) => ({
    a: i > 0 ? { pieceId: ids[i - 1], port: 'b' as const } : null,
    b: i < ids.length - 1 ? { pieceId: ids[i + 1], port: 'a' as const } : null,
    l: null,
    r: null,
  })
  const ids = ['up', 'climb', 'over', 'top', 'off', 'fall', 'down']
  const shapes: Partial<Piece>[] = [
    { kind: 'bend', radius: 150, angleDeg: 20, slope: 0, base: 'a' },
    { length: 150 },
    { kind: 'bend', radius: 150, angleDeg: -20 },
    { length: 135 },
    { kind: 'bend', radius: 150, angleDeg: -20 },
    { length: 150 },
    { kind: 'bend', radius: 150, angleDeg: 20, slope: 0, base: 'b' },
  ]
  const hill = reflowFrom(
    ids.map((id, i) => piece(id, { ...flat, ...shapes[i], links: chain(ids, i) })),
    'up',
    d,
  )
  const [up, climb, , top, , fall, down] = hill
  const leg = (p: Piece, port: 'a' | 'b', next?: Piece) => supportLeg(p, port, next, 40, d)
  check('the top of a ramp standing on the floor holds its own joint', leg(up, 'b', climb) === null && leg(climb, 'a', up) === null)
  const climbing = leg(climb, 'b', hill[2])
  check('a joint on the climb gets a support tipped 20°', !!climbing && Math.abs(climbing.pitchDeg - 20) < 1e-6, JSON.stringify(climbing))
  const level = leg(top, 'b', hill[4])
  check('the level top gets a level support down to the floor', !!level && Math.abs(level.pitchDeg) < 1e-6 && Math.abs(level.floor - (worldPortFrame(top, 'b', d).position.y + clipSeatY(d))) < 1e-9, JSON.stringify(level))
  const falling = leg(fall, 'a', hill[4])
  check('a joint on the way down gets one tipped the other way', !!falling && Math.abs(Math.abs(falling.pitchDeg) - 20) < 1e-6, JSON.stringify(falling))
  check('the ramp down lands level on the floor', Math.abs(worldPortFrame(down, 'b', d).position.y) < 1e-9 && Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(worldPortFrame(down, 'b', d).quaternion).y) < 1e-9)
  check('and holds the slope coming onto it', leg(down, 'a', fall) === null && leg(fall, 'b', down) === null)
  check('the foot of each ramp, on the floor, takes a plain clip', leg(up, 'a') === null && leg(down, 'b') === null)
  const low = { ...top, position: [top.position[0], 3, top.position[2]] as [number, number, number] }
  check('a joint just off the floor keeps a plain clip', leg(low, 'b') === null)
  const rolled = { ...top, rotation: [0.2, 0, 0] as [number, number, number] }
  check('a piece rolled sideways is left alone', leg(rolled, 'b') === null)
  const lifted = hill.map((p) => ({ ...p, position: [p.position[0], p.position[1] + 30, p.position[2]] as [number, number, number] }))
  check('a ramp lifted off the floor no longer holds its top', leg(lifted[0], 'b', lifted[1]) !== null)
}
{
  // A hill from the kit: bend up 20°, a straight, bend back down 20°, a straight.
  const d = DEFAULT_DIMENSIONS
  const link = (a: string | null, b: string | null, ap: 'a' | 'b' = 'b', bp: 'a' | 'b' = 'a') => ({
    a: a ? { pieceId: a, port: ap } : null,
    b: b ? { pieceId: b, port: bp } : null,
    l: null,
    r: null,
  })
  const flat = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
  const hill = reflowFrom(
    [
      piece('h1', { ...flat, kind: 'bend', radius: 150, angleDeg: 20, links: link(null, 'h2') }),
      piece('h2', { ...flat, length: 200, links: link('h1', 'h3') }),
      piece('h3', { ...flat, kind: 'bend', radius: 150, angleDeg: -20, links: link('h2', 'h4') }),
      piece('h4', { ...flat, length: 135, links: link('h3', null) }),
    ],
    'h1',
    d,
  )
  const [b1, slope, b2, top] = hill
  const pitch = (p: Piece) => THREE.MathUtils.radToDeg(Math.asin(new THREE.Vector3(1, 0, 0).applyQuaternion(pieceQuaternion(p)).y))
  check('a straight on a 20° bend climbs at 20°', Math.abs(pitch(slope) - 20) < 1e-9, pitch(slope).toFixed(6))
  check('bending back down leaves the next straight level', Math.abs(pitch(top)) < 1e-9, pitch(top).toFixed(6))
  const gained = worldPortFrame(top, 'a', d).position.y
  const l1 = 150 * (1 - Math.cos(THREE.MathUtils.degToRad(20)))
  const wantGain = 2 * (l1 + 40 * Math.sin(THREE.MathUtils.degToRad(20))) + 200 * Math.sin(THREE.MathUtils.degToRad(20))
  check('and the top is as high as the two bends and the slope add up to', Math.abs(gained - wantGain) < 1e-6, `${gained.toFixed(3)} vs ${wantGain.toFixed(3)}`)
  const sloped = supportLeg(slope, 'b', b2, 40, d)
  check('a joint on the slope gets a support tipped to match', !!sloped && Math.abs(Math.abs(sloped.pitchDeg) - 20) < 1e-6, JSON.stringify(sloped))
  check('the bend at the foot, on the floor, does not', supportLeg(b1, 'a', undefined, 40, d) === null)
  check('the level top gets a level support', Math.abs(supportLeg(top, 'b', undefined, 40, d)?.pitchDeg ?? 99) < 1e-6)
  const json = JSON.parse(JSON.stringify(serializeProject({ ...snapshot, pieces: hill })))
  const back = parseProject(JSON.stringify(json))
  check('a bend keeps its kind and angle', back.pieces[2].kind === 'bend' && back.pieces[2].angleDeg === -20)
}

{
  // Into a bank and out again: straight, Roll left 30° (base under A), Banked
  // left 30°, a plain straight clipped on at the bank, Roll right 30° (base
  // under B), straight. All 1 lane.
  const d = DEFAULT_DIMENSIONS
  const flat = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
  const ids = ['s1', 'in', 'bank', 'lean', 'out', 's2']
  const chain = (i: number) => ({
    a: i > 0 ? { pieceId: ids[i - 1], port: 'b' as const } : null,
    b: i < ids.length - 1 ? { pieceId: ids[i + 1], port: 'a' as const } : null,
    l: null,
    r: null,
  })
  const shapes: Partial<Piece>[] = [
    { lanes: 1, length: 135 },
    { lanes: 1, kind: 'bend', bendMode: 'roll', rollDeg: 30, length: 150, base: 'a' },
    { lanes: 1, kind: 'banked', bankAngle: 30, bankBase: true, radius: 250, angleDeg: 90 },
    { lanes: 1, length: 135 },
    { lanes: 1, kind: 'bend', bendMode: 'roll', rollDeg: -30, rollStart: 30, length: 150, base: 'b' },
    { lanes: 1, length: 135 },
  ]
  const run = reflowFrom(ids.map((id, i) => piece(id, { ...flat, ...shapes[i], links: chain(i) })), 's1', d)
  const lean = (p: Piece, port: 'a' | 'b') => {
    // How far the road leans at that end, degrees: its up, against straight up.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldPortFrame(p, port, d).quaternion)
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)))
  }
  const [s1, rin, bank, leaning, rout, s2] = run
  const lowest = (p: Piece) => {
    const g = buildTrackGeometry(p, d).clone().applyMatrix4(pieceMatrix(p))
    g.computeBoundingBox()
    return g.boundingBox!.min.y
  }
  check('the roll starts level and ends leaning 30°', Math.abs(lean(rin, 'a')) < 1e-6 && Math.abs(lean(rin, 'b') - 30) < 1e-6)
  check('the banked curve leans 30° at both ends', Math.abs(lean(bank, 'a') - 30) < 1e-6 && Math.abs(lean(bank, 'b') - 30) < 1e-6)
  check('a plain straight clipped on at the bank leans with it', Math.abs(lean(leaning, 'a') - 30) < 1e-6 && Math.abs(lean(leaning, 'b') - 30) < 1e-6)
  check('rolling back out ends level', Math.abs(lean(rout, 'b')) < 1e-6 && Math.abs(lean(s2, 'b')) < 1e-6)
  // Level out: read off the end it joins, it is exactly the roll back.
  check('level out reads −30° off the end of a left-leaning 30° bank', Math.abs(levelOutRoll(leaning, 'b', d, rout) + 30) < 1e-9 && Math.abs(levelOutRoll(bank, 'b', d, rout) + 30) < 1e-9)
  check('and nothing off a level end', portLean(s2, 'b', d, rout) === 0 && portLean(s1, 'b', d, rout) === 0)
  {
    // A right-hand bank: Roll lean right 30° into Banked right 30°, then level out
    // with whatever it reads.
    const rid = ['r1', 'rin', 'rbank']
    const rchain = (i: number) => ({
      a: i > 0 ? { pieceId: rid[i - 1], port: 'b' as const } : null,
      b: i < rid.length - 1 ? { pieceId: rid[i + 1], port: 'a' as const } : null,
      l: null,
      r: null,
    })
    const rshapes: Partial<Piece>[] = [
      { lanes: 1, length: 135 },
      { lanes: 1, kind: 'bend', bendMode: 'roll', rollDeg: -30, length: 150, base: 'a' },
      { lanes: 1, kind: 'banked', bankAngle: 30, bankBase: true, radius: 250, angleDeg: -90 },
    ]
    const rrun = reflowFrom(rid.map((id, i) => piece(id, { ...flat, ...rshapes[i], links: rchain(i) })), 'r1', d)
    const outShape = piece('rout', { ...flat, kind: 'bend', bendMode: 'roll', lanes: 1, length: 150, base: 'b' })
    const read = levelOutRoll(rrun[2], 'b', d, outShape)
    const closer = { ...outShape, rollDeg: read, rollStart: -read, links: { a: { pieceId: 'rbank', port: 'b' as const }, b: null, l: null, r: null } }
    const all = reflowFrom([...rrun.map((p) => (p.id === 'rbank' ? { ...p, links: { ...p.links, b: { pieceId: 'rout', port: 'a' as const } } } : p)), closer], 'r1', d)
    const done = all[3]
    check('off a right-leaning bank it reads +30°, and that brings it level on the floor',
      Math.abs(read - 30) < 1e-9 && Math.abs(lean(done, 'b')) < 1e-6 && Math.abs(worldPortFrame(done, 'b', d).position.y) < 1e-6 && Math.abs(lowest(done)) < 1e-3,
      `${read.toFixed(4)}°`)
  }
  check('and back on the floor', Math.abs(worldPortFrame(s2, 'b', d).position.y) < 1e-6, worldPortFrame(s2, 'b', d).position.y.toFixed(6))
  check('the banked curve turns level: its two ends at the same height', Math.abs(worldPortFrame(bank, 'a', d).position.y - worldPortFrame(bank, 'b', d).position.y) < 1e-6)

  // Every joint is the ordinary section on both sides: each piece's end face
  // carries every corner of the track outline, at the same places in the world.
  const meshFace = (p: Piece, port: 'a' | 'b') => {
    const g = buildTrackGeometry(p, d)
    const m = pieceMatrix(p)
    const f = worldPortFrame(p, port, d)
    const out = new THREE.Vector3(1, 0, 0).applyQuaternion(f.quaternion)
    const pos = g.getAttribute('position')
    const face: THREE.Vector3[] = []
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m)
      if (Math.abs(v.clone().sub(f.position).dot(out)) < 1e-3) face.push(v)
    }
    return face
  }
  const outline = (p: Piece, port: 'a' | 'b') => {
    const f = worldPortFrame(p, port, d)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(f.quaternion)
    const lat = new THREE.Vector3(0, 0, 1).applyQuaternion(f.quaternion)
    // Profile +x is −z at a port b and +z at a port a, in that port's own frame.
    const sideways = port === 'b' ? -1 : 1
    return trackProfile(d, 1, true).map((q) => f.position.clone().addScaledVector(up, q.y).addScaledVector(lat, sideways * q.x))
  }
  const has = (face: THREE.Vector3[], pts: THREE.Vector3[]) => pts.every((p) => face.some((v) => v.distanceTo(p) < 2e-3))
  for (let i = 0; i < run.length - 1; i++) {
    const [x, y] = [run[i], run[i + 1]]
    const ox = outline(x, 'b')
    const oy = outline(y, 'a')
    const same = ox.every((p) => oy.some((q) => q.distanceTo(p) < 1e-6))
    check(`${x.id} meets ${y.id} on the same outline, in both meshes`, same && has(meshFace(x, 'b'), ox) && has(meshFace(y, 'a'), oy))
  }

  // The bases stand on the floor.
  check('the roll in, the banked curve and the roll out all stand on the floor',
    [rin, bank, rout].every((p) => Math.abs(lowest(p)) < 1e-3), [rin, bank, rout].map((p) => lowest(p).toFixed(4)).join(', '))
  void s1

  // The physics on a 30° lean: parked it slides down; on the banked curve at
  // v = √(r·g·tan θ) it holds its line with no grip at all; level, nothing.
  const g = 9810
  const at = sampleCentreline(bank, 100, d)
  const across = at.tangent.clone().cross(at.up).normalize()
  const parked = stepLeanSlide(across, at.up, new THREE.Vector3(), g, 0, 0.01)
  check('parked on the 30° lean it slides down towards the inside', Math.tan(Math.PI / 6) > SIDE_GRIP && parked.moved !== 0 && across.y * parked.moved < 0)
  const r = 250
  const v = Math.sqrt(r * g * Math.tan(Math.PI / 6))
  const inward = new THREE.Vector3(across.x, 0, across.z).normalize().multiplyScalar(-1)
  const bal = stepLeanSlide(across, at.up, inward.multiplyScalar((v * v) / r), g, 0, 0.01)
  check('at v = √(r·g·tan θ) a car on the bank holds its line', bal.slide === 0 && bal.moved === 0, `${v.toFixed(1)} mm/s`)
  const levelAt = sampleCentreline(s2, 50, d)
  const level = stepLeanSlide(levelAt.tangent.clone().cross(levelAt.up).normalize(), levelAt.up, new THREE.Vector3(), g, 0, 0.01)
  check('on level track nothing slides', level.slide === 0)
  check('a project keeps a roll and a banked curve as they were', (() => {
    const back = parseProject(JSON.stringify(serializeProject({ ...snapshot, pieces: [rin, bank] })))
    const [a, b] = back.pieces
    return a.kind === 'bend' && a.bendMode === 'roll' && a.rollDeg === 30 && a.base === 'a' && b.kind === 'banked' && b.bankAngle === 30 && b.bankBase
  })())
}

{
  // The reported case: the default banked curve, 4 lanes, added onto a level
  // 4-lane straight on the floor — with a Top speed of 500 mm/s and a 256 mm bed.
  const d = DEFAULT_DIMENSIONS
  const sizing = { speed: 500, gravity: 9810, bed: bedLength([256, 256, 256]) }
  const flat = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
  const straight = piece('st', { ...flat, lanes: 4, length: 135, links: { a: null, b: null, l: null, r: null } })
  const curve = { lanes: 4, angleDeg: 90, bankAngle: 30, color: '#e2622a' }
  const rolls = rollIntoBank(straight, 'b', curve, d, sizing)
  const total = rolls.reduce((sum, r) => sum + (r.rollDeg ?? 0), 0)
  check('onto a level end a banked curve gets Rolls in first, 30° into a left turn all told, with a base',
    rolls.length > 1 && Math.abs(total - 30) < 1e-9 && rolls.every((r) => r.base !== 'none' && r.lanes === 4),
    `${rolls.length} pieces, ${total.toFixed(6)}°`)
  check('each fits the 256 mm bed', rolls.every((r) => (r.length ?? 0) + 2 * d.assembly.connectorInset <= sizing.bed + 1e-9),
    rolls.map((r) => ((r.length ?? 0) + 2 * d.assembly.connectorInset).toFixed(1)).join(', '))
  const ids = ['st', ...rolls.map((_, k) => `r${k}`), 'bk']
  const chain = (i: number) => ({
    a: i > 0 ? { pieceId: ids[i - 1], port: 'b' as const } : null,
    b: i < ids.length - 1 ? { pieceId: ids[i + 1], port: 'a' as const } : null,
    l: null,
    r: null,
  })
  const run = reflowFrom(
    [
      { ...straight, links: chain(0) },
      ...rolls.map((r, k) => piece(`r${k}`, { ...flat, ...r, links: chain(k + 1) })),
      piece('bk', { ...flat, kind: 'banked', lanes: 4, bankAngle: 30, bankBase: true, radius: 250, angleDeg: 90, links: chain(ids.length - 1) }),
    ],
    'st',
    d,
  )
  const bk = run[run.length - 1]
  const upright = (p: Piece) => new THREE.Vector3(0, 1, 0).applyQuaternion(pieceQuaternion(p)).y
  check('the banked curve after them turns level, not tipped', Math.abs(upright(bk) - 1) < 1e-9, upright(bk).toFixed(9))
  const lowestOf = (p: Piece) => {
    const g = buildTrackGeometry(p, d).clone().applyMatrix4(pieceMatrix(p))
    g.computeBoundingBox()
    return g.boundingBox!.min.y
  }
  check('every Roll and the banked curve stand flat on the floor', run.slice(1).every((p) => Math.abs(lowestOf(p)) < 1e-3),
    run.slice(1).map((p) => lowestOf(p).toFixed(4)).join(', '))
  // The outside edge, piece by piece: no steeper than 15%, and a car at Top
  // speed stays down.
  const edges = run.slice(1, -1).map((p) => rollEdge(rollLayout(d, bendSpecOf(p)), sizing.gravity))
  check('the outside edge climbs no steeper than 15% anywhere', edges.every((e) => e.grade <= MAX_EDGE_GRADE),
    edges.map((e) => `${(e.grade * 100).toFixed(1)}%`).join(', '))
  check('and a car at 500 mm/s stays on all the way', edges.every((e) => e.liftSpeed >= sizing.speed),
    edges.map((e) => `${Math.round(e.liftSpeed)}`).join(', '))
  // No dips: walk the outside edge's height along the whole run, joints and all.
  // Through the steady middle — past the easing at each end — it must climb at
  // one grade, with no flat where one piece meets the next.
  {
    const W = 4 * (d.track.channelTopWidth + 2 * d.track.wallThickness)
    // Sampled by distance along the whole run, so a joint falls between two
    // samples a millimetre apart like anywhere else.
    const layouts = run.slice(1, -1).map((p) => rollLayout(d, bendSpecOf(p)))
    const total = layouts.reduce((sum, l) => sum + l.length, 0)
    const step = 1
    const heights: number[] = []
    for (let sigma = 0; sigma <= total + 1e-9; sigma += step) {
      let along = sigma
      let k = 0
      while (k < layouts.length - 1 && along > layouts[k].length) along -= layouts[k++].length
      heights.push(W * Math.sin(rollLeanAt(layouts[k], Math.min(along, layouts[k].length))))
    }
    const inset = d.assembly.connectorInset
    const span = total - 2 * inset
    const grades = heights.slice(1).map((h, i) => (h - heights[i]) / step)
    const middle = grades.filter((_, i) => i * step > inset + 0.3 * span && i * step < total - inset - 0.3 * span)
    const top = Math.max(...middle)
    const low = Math.min(...middle)
    check('no dips: through the middle of the run the outside edge climbs at a steady grade, joints included',
      low > 0.9 * top, `${(low * 100).toFixed(2)}% to ${(top * 100).toFixed(2)}% over ${total.toFixed(0)} mm`)
  }
  // The clips at the joints in the middle of the run, where the slot is still
  // turning: a straight clip stands proud of it at the outside lanes; one
  // turned to follow it stays inside the slot all the way along.
  {
    const { slotH } = slotMetrics(d)
    const layouts = run.map((p) => p)
    /** The road under a world point, as the piece and distance along it. */
    const roadAt = (v: THREE.Vector3) => {
      for (const p of layouts.slice(1, -1)) {
        const len = centrelineLength(p, d)
        const start = worldPortFrame(p, 'a', d).position
        const along = sampleCentreline(p, 0, d).tangent
        const s = v.clone().sub(start).dot(along)
        if (s >= -1e-6 && s <= len + 1e-6) return sampleCentreline(p, THREE.MathUtils.clamp(s, 0, len), d)
      }
      return null
    }
    let straightWorst = 0
    let twistedWorst = 0
    let twistedLowest = Infinity
    let joints = 0
    for (let i = 1; i < run.length - 2; i++) {
      const [x, y] = [run[i], run[i + 1]]
      const twist = clipTwistAt(x, 'b', y, d)
      if (!twist) continue
      joints++
      for (const length of [40, 70]) {
        const clip = buildSnapClipGeometry(d, length)
        const place = clipPlacement(x, 'b', length, d)
        const m = pieceMatrix(x)
        for (const lane of [connectorOffsets(x, d, 'b')[0], connectorOffsets(x, d, 'b').slice(-1)[0]]) {
          for (const [geom, worst] of [
            [clip, (h: number) => (straightWorst = Math.max(straightWorst, h))],
            [twistClip(clip, length, lane, twist, d), (h: number, lo: number) => {
              twistedWorst = Math.max(twistedWorst, h)
              twistedLowest = Math.min(twistedLowest, lo)
            }],
          ] as [THREE.BufferGeometry, (h: number, lo: number) => void][]) {
            const pos = geom.getAttribute('position')
            const at = new THREE.Matrix4().compose(
              place.origin.clone().addScaledVector(place.lateral, lane),
              place.quaternion,
              new THREE.Vector3(1, 1, 1),
            )
            let hi = -Infinity
            let lo = Infinity
            for (let k = 0; k < pos.count; k++) {
              const v = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(at).applyMatrix4(m)
              const road = roadAt(v)
              if (!road) continue
              const h = v.clone().sub(road.point).dot(road.up)
              hi = Math.max(hi, h)
              lo = Math.min(lo, h)
            }
            worst(hi, lo)
          }
        }
      }
    }
    check('a straight clip at a turning joint would stand proud of its slot', joints > 0 && straightWorst > slotH + 0.1,
      `${joints} joints; tops ${straightWorst.toFixed(2)} mm up against a ${slotH.toFixed(2)} mm slot`)
    check('a clip turned to follow it stays inside the slot, end to end, on both outside lanes',
      twistedWorst <= slotH + 1e-3 && twistedLowest >= -1e-3,
      `${twistedLowest.toFixed(3)} to ${twistedWorst.toFixed(3)} mm, slot 0 to ${slotH.toFixed(3)} mm`)
  }
  // The pieces carry on from each other: what one finishes at, the next starts at.
  check('each Roll starts at the lean the one before finishes at', rolls.every((r, k) =>
    k === 0 ? r.rollStart === 0 : Math.abs((r.rollStart ?? 0) - ((rolls[k - 1].rollStart ?? 0) + (rolls[k - 1].rollDeg ?? 0))) < 1e-9))
  for (let i = 0; i < run.length - 1; i++) {
    const [x, y] = [run[i], run[i + 1]]
    const outline = (p: Piece, port: 'a' | 'b') => {
      const f = worldPortFrame(p, port, d)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(f.quaternion)
      const lat = new THREE.Vector3(0, 0, 1).applyQuaternion(f.quaternion)
      return trackProfile(d, 4, true).map((q) => f.position.clone().addScaledVector(up, q.y).addScaledVector(lat, (port === 'b' ? -1 : 1) * q.x))
    }
    const ox = outline(x, 'b')
    const oy = outline(y, 'a')
    check(`${x.id} meets ${y.id} on the same outline`, ox.every((p) => oy.some((q) => q.distanceTo(p) < 1e-6)))
  }
  check('a second banked curve on its end clips straight on, no Roll', rollIntoBank(bk, 'b', curve, d, sizing).length === 0)
  check('a right-hand one gets Rolls leaning right',
    rollIntoBank(straight, 'b', { ...curve, angleDeg: -90 }, d, sizing).reduce((sum, r) => sum + (r.rollDeg ?? 0), 0) < -29.999)
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
