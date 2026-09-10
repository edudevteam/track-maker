/**
 * Puts a model that ships with the app into `public/cars/cars.json`.
 *
 *   pnpm car:add                     every model in the folder that is not listed
 *   pnpm car:add muscle_car.glb      just that one, relisted if it is already in
 *   pnpm car:add --scale 32          start it at 1:32 rather than die-cast 1:64
 *   pnpm car:add --dry-run           say what would be written, write nothing
 *   pnpm car:add --name "Muscle Car" --id musclecar     one file only
 *
 * This is for a car that everyone who opens the app should get. A model just for
 * yourself does not belong here at all — Settings ▸ Vehicle ▸ Add a model reads
 * it off your disk into your own browser, which costs the repository nothing.
 *
 * What it saves you is the measuring. A model file does not say what unit it is
 * in, where its nose points, or how big the real vehicle is, and getting any of
 * those wrong puts a 6mm car or a sideways one on the track. So each file is
 * read with the app's own loaders and seated with the app's own code, and the
 * entry is written from what came out. What is reported is what you will see.
 *
 * 3MF is measured in the browser only: its loader reads the package with
 * DOMParser, which node has none of. A .3mf entry is still written, just without
 * measurements — pick its size in the Vehicle dialog.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import * as THREE from 'three'
import { seatVehicleObject, vehicleClumps, vehicleObjectSize } from '../src/geometry/vehicle'
import { CAR_FORMATS, type CarFormat } from '../src/lib/carLibrary'
import { CAR_SCALES, guessMmPerUnit, sizeAtScale } from '../src/lib/carScales'
import type { VehicleSize } from '../src/types'

const CARS_DIR = 'public/cars'
const MANIFEST = join(CARS_DIR, 'cars.json')

/** Past this, a model is worth thinking twice about shipping to everyone. */
const BIG_FILE = 5e6
const BIG_MESH = 150_000

/**
 * three's GLTFLoader hands an embedded texture to the browser as a blob URL and
 * decodes it. Node has neither piece, and nothing here looks at a pixel — only
 * at geometry and at material colours, which arrive either way — so a stub for
 * both is enough to let a textured model through.
 */
function shimBrowserImages(): void {
  const g = globalThis as Record<string, unknown>
  g.self ??= globalThis
  g.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} })
}

interface Args {
  files: string[]
  scale: number
  dryRun: boolean
  name: string | null
  id: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { files: [], scale: 64, dryRun: false, name: null, id: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--scale') args.scale = Number(argv[++i])
    else if (arg === '--name') args.name = argv[++i]
    else if (arg === '--id') args.id = argv[++i]
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`)
    else args.files.push(basename(arg))
  }
  if (!(args.scale > 0) || !Number.isFinite(args.scale)) fail('--scale wants a number, e.g. 64')
  if ((args.name || args.id) && args.files.length !== 1) {
    fail('--name and --id set one car, so name exactly one file with them')
  }
  return args
}

function fail(message: string): never {
  console.error(`add-vehicle: ${message}`)
  process.exit(1)
}

const formatOf = (file: string): CarFormat | null => {
  const ext = extname(file).slice(1).toLowerCase()
  return ext in CAR_FORMATS ? (ext as CarFormat) : null
}

const slug = (file: string): string =>
  basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'car'

const titleCase = (file: string): string =>
  basename(file, extname(file))
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')

const round = (size: VehicleSize): VehicleSize => ({
  length: Math.round(size.length * 10) / 10,
  width: Math.round(size.width * 10) / 10,
  height: Math.round(size.height * 10) / 10,
})

const mm = (v: number) => `${v.toFixed(1)}mm`
const shape = (s: VehicleSize) => `${mm(s.length)} × ${mm(s.width)} × ${mm(s.height)}`
const fileSize = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`

interface Measured {
  /** The real vehicle, mm, when the file's scale could be settled. */
  real: VehicleSize | null
  /** Millimetres per unit of the file, when it could be settled. */
  mmPerUnit: number | null
  triangles: number
  parts: number
  clumps: number
  materials: number
}

/** Read a model the way the app does, and report what came out. */
async function measure(file: string, format: CarFormat): Promise<Measured | null> {
  const path = join(CARS_DIR, file)
  const buf = readFileSync(path)
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer

  let root: THREE.Object3D
  switch (format) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const data = format === 'glb' ? bytes : new TextDecoder().decode(bytes)
      root = (await new GLTFLoader().parseAsync(data, `${CARS_DIR}/`)).scene
      break
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
      root = new THREE.Mesh(new STLLoader().parse(bytes))
      break
    }
    case 'obj': {
      const text = new TextDecoder().decode(bytes)
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
      const loader = new OBJLoader()
      // The MTL beside it, when it named one and it is there.
      const named = /^\s*mtllib\s+(.+)$/m.exec(text)?.[1]?.trim()
      if (named) {
        try {
          const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js')
          const materials = new MTLLoader().parse(readFileSync(join(CARS_DIR, named), 'utf8'), '')
          materials.preload()
          loader.setMaterials(materials)
        } catch {
          console.log(`     its .mtl (${named}) is not beside it, so it will take a flat colour`)
        }
      }
      root = loader.parse(text)
      break
    }
    // 3MF wants DOMParser, which node has none of.
    default:
      return null
  }

  // The units are read off the model the same way the app reads them: only one
  // power of ten puts a car anywhere near car-sized.
  root.updateMatrixWorld(true)
  const raw = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  const mmPerUnit = guessMmPerUnit(Math.max(raw.x, raw.y, raw.z))

  const { forward, up } = CAR_FORMATS[format]
  const seated = seatVehicleObject(root, forward, up, mmPerUnit ?? 1)

  let triangles = 0
  const materials = new Set<THREE.Material>()
  seated.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const g = mesh.geometry
    triangles += Math.floor((g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3)
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m) materials.add(m)
    }
  })

  return {
    real: mmPerUnit === null ? null : vehicleObjectSize(seated),
    mmPerUnit,
    triangles,
    parts: seated.children.length,
    clumps: vehicleClumps(seated),
    materials: materials.size,
  }
}

interface Entry extends Record<string, unknown> {
  id: string
  name: string
  file: string
}

async function main(): Promise<void> {
  shimBrowserImages()
  const args = parseArgs(process.argv.slice(2))

  let manifest: { format?: string; cars: Entry[] }
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as typeof manifest
  } catch {
    manifest = { format: 'track-maker-cars', cars: [] }
  }
  if (!Array.isArray(manifest.cars)) manifest.cars = []

  const listed = new Set(manifest.cars.map((c) => c.file))
  const inFolder = readdirSync(CARS_DIR).filter((f) => formatOf(f) !== null)
  const wanted = args.files.length ? args.files : inFolder.filter((f) => !listed.has(f))

  if (!wanted.length) {
    console.log(
      inFolder.length
        ? `Every model in ${CARS_DIR}/ is already in cars.json. Name one to measure it again.`
        : `No models in ${CARS_DIR}/ yet. Put one there, or use Settings ▸ Vehicle ▸ Add a model.`,
    )
    return
  }

  const scale = CAR_SCALES.find((s) => s.denominator === args.scale)
  console.log(
    `Sizing to 1:${args.scale}${scale ? ` (${scale.note})` : ''}, ` +
      `which is what a car starts at — every size is editable in Settings ▸ Vehicle.\n`,
  )

  let wrote = 0
  for (const file of wanted) {
    const format = formatOf(file)
    if (!format) {
      console.log(`${file}\n     skipped — only ${Object.keys(CAR_FORMATS).map((f) => `.${f}`).join(', ')} can be read\n`)
      continue
    }
    if (!inFolder.includes(file)) {
      console.log(`${file}\n     skipped — it is not in ${CARS_DIR}/\n`)
      continue
    }

    const bytes = readFileSync(join(CARS_DIR, file)).byteLength
    console.log(`${file}  ${fileSize(bytes)}`)

    let measured: Measured | null = null
    try {
      measured = await measure(file, format)
    } catch (err) {
      console.log(`     could not be read: ${err instanceof Error ? err.message : String(err)}\n`)
      continue
    }

    const entry: Entry = {
      id: args.id ?? slug(file),
      name: args.name ?? titleCase(file),
      file,
    }

    if (!measured) {
      console.log('     .3mf is read in the browser only, so it goes in unmeasured')
    } else {
      console.log(
        `     ${measured.parts} part${measured.parts === 1 ? '' : 's'} · ` +
          `${measured.triangles.toLocaleString()} triangles · ` +
          `${measured.materials} material${measured.materials === 1 ? '' : 's'}`,
      )
      if (measured.real && measured.mmPerUnit !== null) {
        // A unit name where there is one, so the entry reads as it should; a
        // plain multiplier otherwise, which is what an exporter that bakes a
        // scale into the root node leaves behind.
        const named = { 1: 'mm', 10: 'cm', 25.4: 'in', 1000: 'm' }[measured.mmPerUnit]
        entry.units = named ?? measured.mmPerUnit
        Object.assign(entry, round(sizeAtScale(measured.real, args.scale)))
        console.log(
          `     real vehicle ${shape(measured.real)} — the file is in ` +
            `${named ?? `units of ${measured.mmPerUnit}mm`}`,
        )
        console.log(`     rides at 1:${args.scale} — ${shape(round(sizeAtScale(measured.real, args.scale)))}`)
      } else {
        console.log(
          '     its scale is not a vehicle scale, so no real size could be read. ' +
            'It rides at the file\'s own numbers until a size is typed in Settings ▸ Vehicle.',
        )
      }
      if (measured.clumps > 1) {
        console.log(
          `     WARNING its ${measured.parts} parts stand apart in ${measured.clumps} groups — ` +
            'this looks laid out for printing rather than assembled',
        )
      }
      if (measured.triangles > BIG_MESH) {
        console.log(`     WARNING ${measured.triangles.toLocaleString()} triangles is heavy for a preview`)
      }
    }
    if (bytes > BIG_FILE) {
      console.log(
        `     WARNING ${fileSize(bytes)} ships to everyone who opens the app. ` +
          'A model this big is better added per-browser from Settings ▸ Vehicle ▸ Add a model.',
      )
    }

    const at = manifest.cars.findIndex((c) => c.file === file)
    if (at >= 0) {
      // Anything set by hand — a colour, an axis — is kept; only what was
      // measured is written over.
      manifest.cars[at] = { ...manifest.cars[at], ...entry }
      console.log('     updated in cars.json\n')
    } else {
      manifest.cars.push(entry)
      console.log('     added to cars.json\n')
    }
    wrote++
  }

  if (!wrote) return
  if (args.dryRun) {
    console.log('--dry-run, so nothing was written. cars.json would have been:\n')
    console.log(JSON.stringify(manifest, null, 2))
    return
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${MANIFEST} now lists ${manifest.cars.length} car${manifest.cars.length === 1 ? '' : 's'}.`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
