/**
 * Checks the vehicle-model path: a model is turned onto the track's axes, seated
 * on the road, measured, scaled to a typed size, and — for the formats that
 * carry colour — arrives still wearing it.
 *
 *   npx vite build --ssr scripts/verify-vehicle.ts --outDir .vg --config /dev/null
 *   node .vg/verify-vehicle.js
 *
 * 3MF is not checked here: its loader reads the package with the browser's XML
 * parser, which node has none of. It goes through the same seating and material
 * path as GLB, so what is not covered is the reading itself.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import {
  facingIsValid,
  flipAxis,
  seatVehicleGeometry,
  seatVehicleObject,
  vehicleObjectSize,
  vehicleScale,
  vehicleSizeOf,
} from '../src/geometry/vehicle'
import { buildBlockGeometry, buildCarGeometry } from '../src/geometry/parts'
import { DEFAULT_DIMENSIONS } from '../src/geometry/dimensions'
import {
  CAR_SCALES,
  REFERENCE_VEHICLE,
  guessMmPerUnit,
  scaleOf,
  sizeAtScale,
} from '../src/lib/carScales'

let failures = 0

function check(label: string, got: number, want: number, tol = 1e-4) {
  const ok = Math.abs(got - want) <= tol
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got.toFixed(4)} (want ${want.toFixed(4)})`)
}

function same(label: string, got: string, want: string) {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got} (want ${want})`)
}

/** Every distinct material colour in a tree, as sRGB hex, in a stable order. */
function colorsOf(root: THREE.Object3D): string[] {
  const seen = new Set<string>()
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const c = (m as THREE.MeshStandardMaterial | undefined)?.color
      if (c) seen.add(`#${c.getHexString()}`)
    }
  })
  return [...seen].sort()
}

/** A box 40 wide (X), 30 tall (Y), 100 long (Z), sitting well off the origin. */
function testBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(40, 30, 100)
  g.translate(500, -220, 17)
  return g
}

/** Binary STL bytes for a geometry, so the real loader is exercised. */
function toBinaryStl(geom: THREE.BufferGeometry): ArrayBuffer {
  const g = geom.index ? geom.toNonIndexed() : geom
  const pos = g.getAttribute('position')
  const tris = pos.count / 3
  const buf = new ArrayBuffer(84 + tris * 50)
  const view = new DataView(buf)
  view.setUint32(80, tris, true)
  let o = 84
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, t * 3)
    b.fromBufferAttribute(pos, t * 3 + 1)
    c.fromBufferAttribute(pos, t * 3 + 2)
    n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
    for (const v of [n, a, b, c]) {
      view.setFloat32(o, v.x, true)
      view.setFloat32(o + 4, v.y, true)
      view.setFloat32(o + 8, v.z, true)
      o += 12
    }
    view.setUint16(o, 0, true)
    o += 2
  }
  return buf
}

/** The same box as OBJ text, to exercise the other loader and the group flatten. */
function toObj(geom: THREE.BufferGeometry): string {
  const g = geom.index ? geom.toNonIndexed() : geom
  const pos = g.getAttribute('position')
  const lines = ['o testcar']
  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${pos.getX(i)} ${pos.getY(i)} ${pos.getZ(i)}`)
  }
  for (let t = 0; t < pos.count / 3; t++) {
    lines.push(`f ${t * 3 + 1} ${t * 3 + 2} ${t * 3 + 3}`)
  }
  return lines.join('\n')
}

function flatten(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) {
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      parts.push(g)
    }
  })
  return parts[0]
}

function report(label: string, g: THREE.BufferGeometry) {
  const size = vehicleSizeOf(g)
  const b = g.boundingBox!
  console.log(`\n=== ${label} ===`)
  check('length down the track', size.length, 100)
  check('width across the track', size.width, 40)
  check('height off the road', size.height, 30)
  check('wheels on the road', b.min.y, 0)
  check('centred along the track', (b.min.x + b.max.x) / 2, 0)
  check('centred across the track', (b.min.z + b.max.z) / 2, 0)
}

// A model exported nose-down-+Z, up +Y — the common Fusion/Blender export.
const stl = new STLLoader().parse(toBinaryStl(testBox()))
seatVehicleGeometry(stl, '+Z', '+Y')
report('binary STL, forward +Z', stl)

const obj = flatten(new OBJLoader().parse(toObj(testBox())))
seatVehicleGeometry(obj, '+Z', '+Y')
report('OBJ, forward +Z', obj)

// Z-up, as an STL out of a CAD package that works that way. Length is along Y
// there, so the same box has to come out measuring the same.
const zUp = new THREE.BoxGeometry(40, 100, 30)
seatVehicleGeometry(zUp, '+Y', '+Z')
report('Z-up, forward +Y', zUp)

// Exported in centimetres: a tenth the size, read back at the same millimetres.
const cm = new THREE.BoxGeometry(4, 3, 10)
seatVehicleGeometry(cm, '+Z', '+Y', 10)
report('exported in cm', cm)

console.log('\n=== scaling to a typed size ===')
const natural = vehicleSizeOf(stl)
const [sx, sy, sz] = vehicleScale(natural, { length: 75, width: 32, height: 24 })
check('length scale', sx * natural.length, 75)
check('height scale', sy * natural.height, 24)
check('width scale', sz * natural.width, 32)
const [ux, uy, uz] = vehicleScale(natural, null)
check('no size typed leaves it alone', ux + uy + uz, 3)

console.log('\n=== the built-in car is seated the same way ===')
const built = buildCarGeometry(DEFAULT_DIMENSIONS)
built.computeBoundingBox()
const bb = built.boundingBox!
const size = vehicleSizeOf(built)
check('wheels on the road', bb.min.y, 0)
check('centred along the track', (bb.min.x + bb.max.x) / 2, 0, 1e-3)
check('centred across the track', (bb.min.z + bb.max.z) / 2, 0, 1e-3)
console.log(
  `     built-in car ${size.length.toFixed(1)} × ${size.width.toFixed(1)} × ${size.height.toFixed(1)}mm ` +
    `in a ${DEFAULT_DIMENSIONS.track.channelTopWidth}mm channel`,
)
if (size.width >= DEFAULT_DIMENSIONS.track.channelTopWidth) {
  failures++
  console.log('FAIL built-in car is wider than the channel')
}

/**
 * A car in parts: a red body and black wheels, each its own object with its own
 * place in the file. 40 wide on X, 30 tall on Y, 100 long on Z — glTF's own axes,
 * so a GLB of it needs nothing said in cars.json.
 */
const BODY = '#dc2626'
const WHEEL = '#1a1a1a'

/** A part in its own local space, plus where the file puts it. */
interface Part {
  positions: Float32Array
  color: string
  at: [number, number, number]
}

function boxPart(w: number, h: number, d: number, at: [number, number, number], color: string): Part {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  return { positions: g.getAttribute('position').array as Float32Array, color, at }
}

/**
 * A GLB written by hand, so the real loader is what gets tested rather than the
 * exporter — which wants a FileReader that node has none of. Header, then a JSON
 * chunk, then the binary chunk, each padded to four bytes as the spec requires.
 *
 * Every part is its own node carrying its own translation, which is how a model
 * built out of separate objects arrives — a multi-part GLB, or a 3MF whose build
 * holds one item per part. Seating has to bake those away without moving the
 * parts relative to each other.
 */
function writeGlb(parts: Part[], origin: [number, number, number] = [400, 90, -230]): ArrayBuffer {
  const pad4 = (n: number) => (n + 3) & ~3
  const binLength = parts.reduce((n, p) => n + pad4(p.positions.byteLength), 0)
  const bin = new Uint8Array(binLength)
  const json: Record<string, unknown> = {
    asset: { version: '2.0' },
    scene: 0,
    // One root well off the origin, so seating has a real transform to undo,
    // with each part hanging off it at its own offset.
    scenes: [{ nodes: [0] }],
    nodes: [
      { children: parts.map((_, i) => i + 1), translation: origin },
      ...parts.map((p, i) => ({ mesh: i, translation: p.at })),
    ] as unknown[],
    meshes: [] as unknown[],
    materials: [] as unknown[],
    accessors: [] as unknown[],
    bufferViews: [] as unknown[],
    buffers: [{ byteLength: binLength }],
  }
  let offset = 0
  parts.forEach((part, i) => {
    bin.set(new Uint8Array(part.positions.buffer.slice(0)), offset)
    const box = new THREE.Box3().setFromArray(Array.from(part.positions))
    ;(json.bufferViews as unknown[]).push({
      buffer: 0,
      byteOffset: offset,
      byteLength: part.positions.byteLength,
      target: 34962,
    })
    ;(json.accessors as unknown[]).push({
      bufferView: i,
      componentType: 5126,
      count: part.positions.length / 3,
      type: 'VEC3',
      min: box.min.toArray(),
      max: box.max.toArray(),
    })
    // glTF holds baseColorFactor in linear space, which is what THREE.Color
    // stores a hex colour as, so the components go straight across.
    const c = new THREE.Color(part.color)
    ;(json.materials as unknown[]).push({
      pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, 1] },
    })
    // One mesh per part, rather than one mesh of many primitives, so each part
    // is a separate object the way a real multi-part model has them.
    ;(json.meshes as unknown[]).push({
      primitives: [{ attributes: { POSITION: i }, material: i }],
    })
    offset += pad4(part.positions.byteLength)
  })

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonChunk = new Uint8Array(pad4(jsonBytes.length)).fill(0x20)
  jsonChunk.set(jsonBytes)
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)
  view.setUint32(0, 0x46546c67, true) // 'glTF'
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonChunk.length, true)
  view.setUint32(16, 0x4e4f534a, true) // 'JSON'
  bytes.set(jsonChunk, 20)
  const binAt = 20 + jsonChunk.length
  view.setUint32(binAt, bin.length, true)
  view.setUint32(binAt + 4, 0x004e4942, true) // 'BIN'
  bytes.set(bin, binAt + 8)
  return out
}

/** The union box of a two-tone car is the same 100 × 40 × 30 the others use. */
function reportObject(label: string, group: THREE.Object3D, colors: string[]) {
  const size = vehicleObjectSize(group)
  const b = new THREE.Box3().setFromObject(group)
  console.log(`\n=== ${label} ===`)
  check('length down the track', size.length, 100)
  check('width across the track', size.width, 40)
  check('height off the road', size.height, 30)
  check('wheels on the road', b.min.y, 0)
  check('centred along the track', (b.min.x + b.max.x) / 2, 0)
  check('centred across the track', (b.min.z + b.max.z) / 2, 0)
  same('colours survive', colorsOf(group).join(' '), colors.join(' '))
}

/**
 * A car in four separate objects, each placed by its own transform — a body and
 * three wheels. This is the shape a multi-part model arrives in, whether it is a
 * GLB of several objects or a 3MF whose build holds an item per part, and it is
 * how a 3MF carries colour at all. What has to survive seating is not just the
 * overall box but where the parts sit relative to one another.
 */
function carInParts(): Part[] {
  return [
    boxPart(40, 24, 90, [0, 18, 5], BODY),
    boxPart(40, 12, 20, [0, 6, -40], WHEEL),
    boxPart(16, 12, 20, [-12, 6, 35], WHEEL),
    boxPart(16, 12, 20, [12, 6, 35], WHEEL),
  ]
}

// A GLB, the format that carries the most, read by the loader the app uses.
async function checkGlb() {
  const gltf = await new GLTFLoader().parseAsync(writeGlb(carInParts()), '')
  const seated = seatVehicleObject(gltf.scene, '+Z', '+Y')
  reportObject('GLB in four parts', seated, [WHEEL, BODY].sort())

  console.log('\n=== the parts keep their places relative to each other ===')
  const boxes: THREE.Box3[] = []
  seated.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    boxes.push(
      new THREE.Box3().setFromBufferAttribute(
        mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
      ),
    )
  })
  check('four parts came through', boxes.length, 4)

  // Picked out by what each one is rather than by the order the loader happened
  // to build them in, so this does not break on an unrelated loader change.
  const span = (b: THREE.Box3) => b.max.clone().sub(b.min)
  const volume = (b: THREE.Box3) => span(b).x * span(b).y * span(b).z
  const sorted = [...boxes].sort((a, b) => volume(b) - volume(a))
  const body = sorted[0]
  const wheels = sorted.slice(1)
  const front = wheels.filter((w) => span(w).z < 20).sort((a, b) => a.min.z - b.min.z)
  const rear = wheels.find((w) => span(w).z >= 20)!

  check('two front wheels and one rear', front.length, 2)
  check('front wheels 24mm apart across the track', front[1].min.z - front[0].min.z, 24)
  check('front wheels level with each other', front[1].min.y - front[0].min.y, 0)
  check('rear wheel 75mm back down the track', front[0].min.x - rear.min.x, 75)
  check('body sits 6mm above the wheel bottoms', body.min.y - rear.min.y, 6)
  check('every wheel is on the road', Math.max(...wheels.map((w) => w.min.y)), 0)
}

// An OBJ with its MTL — two named materials, two groups. Body z -40..50 and
// wheel z -50..-30, so the pair spans the same 100 the others do.
const objText = [
  'mtllib car.mtl',
  'v -20 6 -40', 'v 20 6 -40', 'v 20 6 50', 'v -20 6 50',
  'v -20 30 -40', 'v 20 30 -40', 'v 20 30 50', 'v -20 30 50',
  'v -20 0 -50', 'v 20 0 -50', 'v 20 0 -30', 'v -20 0 -30',
  'usemtl body',
  'f 1 2 3', 'f 1 3 4', 'f 5 6 7', 'f 5 7 8',
  'usemtl wheel',
  'f 9 10 11', 'f 9 11 12',
].join('\n')
/** MTL holds Kd in sRGB, so the hex goes in as plain components of 255. */
const srgb = (hex: string) =>
  [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(6)).join(' ')
const mtlText = ['newmtl body', `Kd ${srgb(BODY)}`, 'newmtl wheel', `Kd ${srgb(WHEEL)}`].join('\n')
const mtl = new MTLLoader().parse(mtlText, '')
mtl.preload()
const obj2 = new OBJLoader().setMaterials(mtl).parse(objText)
reportObject('OBJ with MTL', seatVehicleObject(obj2, '+Z', '+Y'), [WHEEL, BODY].sort())

console.log('\n=== an STL takes the manifest colour ===')
const plain = new STLLoader().parse(toBinaryStl(testBox()))
const painted = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f7fd1') })
const plainCar = seatVehicleObject(new THREE.Mesh(plain, painted), '+Z', '+Y')
same('one flat colour', colorsOf(plainCar).join(' '), '#2f7fd1')
painted.color.set('#e2622a')
same('and it can be changed without re-reading', colorsOf(plainCar).join(' '), '#e2622a')

console.log('\n=== the placeholder block is a real vehicle, seated ===')
const block = buildBlockGeometry(REFERENCE_VEHICLE)
const blockSize = vehicleSizeOf(block)
const blockBox = block.boundingBox!
check('length down the track', blockSize.length, REFERENCE_VEHICLE.length)
check('width across the track', blockSize.width, REFERENCE_VEHICLE.width)
check('height off the road', blockSize.height, REFERENCE_VEHICLE.height)
check('sits on the road', blockBox.min.y, 0)
check('centred along the track', (blockBox.min.x + blockBox.max.x) / 2, 0)
check('centred across the track', (blockBox.min.z + blockBox.max.z) / 2, 0)

/**
 * The units read off a model. A file says nothing about its own, so this is the
 * only thing standing between a 6-metre car and a 6-millimetre one.
 */
console.log('\n=== units are read off the model ===')
check('a 6.25-unit car is metres', guessMmPerUnit(6.25141) ?? 0, 1000)
check('a 5092-unit car is already millimetres', guessMmPerUnit(5092.4) ?? 0, 1)
check('a 509-unit car is centimetres', guessMmPerUnit(509.24) ?? 0, 10)
// An exporter that bakes a scale into the root node lands further down the same
// ladder — this is a metres model under a 0.001 node, which is what a real file
// out of one popular pipeline turned out to be.
check('a 0.00529-unit car is metres under a thousandth-scale node', guessMmPerUnit(0.0052864) ?? 0, 1e6)
same('a 1mm speck is no vehicle at all', String(guessMmPerUnit(1)), 'null')
same('nor is a 60-metre one', String(guessMmPerUnit(60000)), 'null')

console.log('\n=== a scale divides into the real vehicle ===')
const real = { length: 6251.4, width: 2385.2, height: 1775.5 }
for (const s of CAR_SCALES) {
  const at = sizeAtScale(real, s.denominator)
  check(`1:${s.denominator} length`, at.length * s.denominator, real.length, 1e-9)
  same(`1:${s.denominator} is recognised again`, scaleOf(real, at)?.id ?? 'none', s.id)
}
same('a hand-typed size is at no scale', scaleOf(real, { length: 60, width: 25, height: 18 })?.id ?? 'none', 'none')

/**
 * Turning a car around. No model format records which way a car faces, so a
 * model built nose-the-other-way arrives driving backwards and the only fix is
 * to say so. What has to hold is that flipping `forward` swaps the ends without
 * disturbing anything else: same size, still seated, still centred.
 */
async function checkTurnAround() {
  console.log('\n=== turning a car around swaps its ends ===')
  same('flipping an axis', `${flipAxis('+Z')} ${flipAxis('-X')}`, '-Z +X')
  same('an axis cannot be its own up', String(facingIsValid({ forward: '+Z', up: '-Z' })), 'false')
  same('two axes can', String(facingIsValid({ forward: '+Z', up: '+Y' })), 'true')

  /** How far the odd rear wheel sits behind the front pair, down the track. */
  const rearOffset = async (forward: '+Z' | '-Z') => {
    const gltf = await new GLTFLoader().parseAsync(writeGlb(carInParts()), '')
    const seated = seatVehicleObject(gltf.scene, forward, '+Y')
    const boxes: THREE.Box3[] = []
    seated.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        boxes.push(
          new THREE.Box3().setFromBufferAttribute(
            mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
          ),
        )
      }
    })
    const span = (b: THREE.Box3) => b.max.clone().sub(b.min)
    const wheels = [...boxes].sort((a, b) => span(b).x * span(b).y * span(b).z - span(a).x * span(a).y * span(a).z).slice(1)
    const front = wheels.filter((w) => span(w).x < 20 || span(w).z < 20)
    const rear = wheels.find((w) => !front.includes(w)) ?? wheels[0]
    const size = vehicleObjectSize(seated)
    const box = new THREE.Box3().setFromObject(seated)
    return {
      offset: Math.min(...front.map((w) => w.min.x)) - rear.min.x,
      size,
      seatY: box.min.y,
      centreZ: (box.min.z + box.max.z) / 2,
    }
  }

  const asBuilt = await rearOffset('+Z')
  const turned = await rearOffset('-Z')
  check('as built, the rear wheel is 75mm back', asBuilt.offset, 75)
  check('turned around, it is 75mm forward instead', turned.offset, -75)
  check('the car is the same length either way', turned.size.length, asBuilt.size.length)
  check('the same width', turned.size.width, asBuilt.size.width)
  check('still on the road', turned.seatY, 0)
  check('still centred across the track', turned.centreZ, 0)
}

checkTurnAround().then(checkGlb).then(() => {
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
  process.exit(failures ? 1 : 0)
})
