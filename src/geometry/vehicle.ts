import * as THREE from 'three'
import type { VehicleSize } from '../types'

/**
 * The frame every vehicle is drawn in: nose down +X, up +Y, sitting on the road
 * with its wheels at y = 0 and centred across the track.
 *
 * The built-in car is modelled that way and a loaded mesh is turned into it, so
 * a car's size is nothing but a scale on its bounding box — which is what lets
 * the size be typed in Settings ▸ Vehicle whatever the file was exported at.
 */

export const AXES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const
export type Axis = (typeof AXES)[number]

/**
 * Which way a model faces in its own file. Nothing in a model format records
 * this, so it is a guess per format until someone says otherwise — and when the
 * guess is wrong the car drives backwards, or on its roof.
 */
export interface VehicleFacing {
  forward: Axis
  up: Axis
}

/** The axis a direction runs along, ignoring which way along it. */
export const axisOf = (a: Axis): string => a[1]

/** The same axis, the other way — what turning a car around comes down to. */
export const flipAxis = (a: Axis): Axis => (a[0] === '+' ? `-${a[1]}` : `+${a[1]}`) as Axis

/** Whether a pair can be used: two axes, not one axis twice. */
export const facingIsValid = (f: VehicleFacing): boolean => axisOf(f.forward) !== axisOf(f.up)

export const sameFacing = (a: VehicleFacing, b: VehicleFacing): boolean =>
  a.forward === b.forward && a.up === b.up

const AXIS_VECTORS: Record<Axis, THREE.Vector3> = {
  '+X': new THREE.Vector3(1, 0, 0),
  '-X': new THREE.Vector3(-1, 0, 0),
  '+Y': new THREE.Vector3(0, 1, 0),
  '-Y': new THREE.Vector3(0, -1, 0),
  '+Z': new THREE.Vector3(0, 0, 1),
  '-Z': new THREE.Vector3(0, 0, -1),
}

/** The rotation that lands a model's own forward on +X and its own up on +Y. */
function orientation(forward: Axis, up: Axis): THREE.Matrix4 {
  const f = AXIS_VECTORS[forward]
  const u = AXIS_VECTORS[up]
  const w = new THREE.Vector3().crossVectors(f, u)
  // Set as rows, so each of the model's axes lands on the one it names.
  return new THREE.Matrix4().set(f.x, f.y, f.z, 0, u.x, u.y, u.z, 0, w.x, w.y, w.z, 0, 0, 0, 0, 1)
}

/**
 * Turn a mesh onto the track's axes, scale it out of its own units, then seat it.
 * `forward` and `up` say which way the model faces in its own file.
 */
export function seatVehicleGeometry(
  g: THREE.BufferGeometry,
  forward: Axis = '+X',
  up: Axis = '+Y',
  mmPerUnit = 1,
): void {
  g.applyMatrix4(orientation(forward, up))
  if (mmPerUnit !== 1) g.scale(mmPerUnit, mmPerUnit, mmPerUnit)
  g.computeBoundingBox()
  const b = g.boundingBox!
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  g.computeBoundingBox()
  g.computeBoundingSphere()
}

/**
 * The same, for a model that arrived as a tree of meshes with materials of their
 * own — a GLB, a 3MF, an OBJ with its MTL.
 *
 * Every mesh is baked into one flat group at the identity rather than left with
 * transforms on it, so the group's own scale is the whole of a car's size and
 * nothing downstream has to unpick a nested transform. Materials are carried
 * across untouched: whatever the file painted is what shows.
 */
export function seatVehicleObject(
  root: THREE.Object3D,
  forward: Axis = '+X',
  up: Axis = '+Y',
  mmPerUnit = 1,
): THREE.Group {
  root.updateMatrixWorld(true)
  const m = orientation(forward, up)
  if (mmPerUnit !== 1) m.premultiply(new THREE.Matrix4().makeScale(mmPerUnit, mmPerUnit, mmPerUnit))

  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[] = []
  const bounds = new THREE.Box3()
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    geometry.applyMatrix4(m)
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    bounds.union(geometry.boundingBox!)
    // Groups carry the per-material ranges of a multi-material mesh, so they
    // have to survive the copy or a GLB comes through in one colour.
    parts.push({ geometry, material: mesh.material })
  })
  if (!parts.length) throw new Error('the file holds no mesh')

  const seat = new THREE.Vector3(
    -(bounds.min.x + bounds.max.x) / 2,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) / 2,
  )
  const group = new THREE.Group()
  for (const part of parts) {
    part.geometry.translate(seat.x, seat.y, seat.z)
    part.geometry.computeBoundingBox()
    part.geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(part.geometry, part.material)
    mesh.castShadow = true
    group.add(mesh)
  }
  return group
}

/** What a seated group of meshes measures, mm. */
export function vehicleObjectSize(group: THREE.Object3D): VehicleSize {
  const b = new THREE.Box3().setFromObject(group)
  return {
    length: Math.max(b.max.x - b.min.x, 1e-3),
    width: Math.max(b.max.z - b.min.z, 1e-3),
    height: Math.max(b.max.y - b.min.y, 1e-3),
  }
}

/** What a seated vehicle measures before any scaling, mm. */
export function vehicleSizeOf(g: THREE.BufferGeometry): VehicleSize {
  if (!g.boundingBox) g.computeBoundingBox()
  const b = g.boundingBox!
  return {
    length: Math.max(b.max.x - b.min.x, 1e-3),
    width: Math.max(b.max.z - b.min.z, 1e-3),
    height: Math.max(b.max.y - b.min.y, 1e-3),
  }
}

/**
 * How many separate clumps the parts of a model fall into.
 *
 * On an assembled car every part touches another — wheels meet the body, glass
 * sits in the roof — so they come out as one clump. Parts laid out for printing
 * are deliberately spaced, so they come out as several. That is the difference
 * between a car and a print plate, and nothing else in the file records it: a
 * plate is a slicer's idea, held in metadata no model reader looks at.
 *
 * Two parts count as touching if their boxes overlap once grown by `slack`, a
 * fraction of the model's own size — enough to forgive a printing clearance
 * without joining up parts that were set apart on purpose.
 */
export function vehicleClumps(group: THREE.Object3D, slack = 0.02): number {
  const boxes: THREE.Box3[] = []
  for (const child of group.children) {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) boxes.push(new THREE.Box3().setFromObject(mesh))
  }
  if (boxes.length < 2) return boxes.length

  const whole = new THREE.Box3()
  for (const b of boxes) whole.union(b)
  const grow = whole.getSize(new THREE.Vector3()).length() * slack
  const grown = boxes.map((b) => b.clone().expandByScalar(grow / 2))

  // Union-find over "these two touch", so a chain of parts counts as one clump.
  const owner = grown.map((_, i) => i)
  const root = (i: number): number => (owner[i] === i ? i : (owner[i] = root(owner[i])))
  for (let i = 0; i < grown.length; i++) {
    for (let j = i + 1; j < grown.length; j++) {
      if (grown[i].intersectsBox(grown[j])) owner[root(i)] = root(j)
    }
  }
  return new Set(grown.map((_, i) => root(i))).size
}

/** The scale that takes a vehicle from its own size to the size asked for. */
export function vehicleScale(natural: VehicleSize, target: VehicleSize | null): [number, number, number] {
  if (!target) return [1, 1, 1]
  return [target.length / natural.length, target.height / natural.height, target.width / natural.width]
}
