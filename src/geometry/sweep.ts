import * as THREE from 'three'

export interface Pt2 {
  x: number
  y: number
}

/** One station along a sweep path: where the profile sits and which way it faces. */
export interface Frame {
  position: THREE.Vector3
  /** Unit tangent, i.e. the direction of travel. */
  tangent: THREE.Vector3
}

const UP = new THREE.Vector3(0, 1, 0)

/** Signed area of a closed polygon. Positive when counter-clockwise. */
export function signedArea(pts: Pt2[]): number {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Returns the polygon wound counter-clockwise, copying only when a flip is needed. */
export function toCCW(pts: Pt2[]): Pt2[] {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts
}

/**
 * Sweeps a closed 2D profile along a path.
 *
 * The profile's +x maps to the lateral axis (`up × tangent`) and +y maps to world
 * up, giving a right-handed (lateral, up, tangent) basis so that a
 * counter-clockwise profile produces outward-facing triangles.
 *
 * Each profile edge becomes its own vertex strip, so normals are smoothed along
 * the sweep but stay hard across profile corners — the shading a CAD kernel gives
 * you, without needing an edge-angle pass.
 */
export function sweepProfile(profile: Pt2[], frames: Frame[], capStart = true, capEnd = true): THREE.BufferGeometry {
  return sweepSections(
    frames.map(() => profile),
    frames,
    capStart,
    capEnd,
  )
}

/**
 * Sweeps a cross-section that changes from station to station — a loft.
 *
 * `profiles[i]` is the section at `frames[i]`, and every section must list the
 * same points in the same order so the side strips join up. Orientation is
 * decided once, from the first section, so a section that happens to come out
 * clockwise cannot flip half the solid inside out.
 *
 * `orient` re-winds the finished mesh so its signed volume is positive. Leave it
 * off for a zone that is deliberately left open at one end — an open tube has no
 * meaningful volume to test — and orient the assembled solid instead.
 */
export function sweepSections(
  profiles: Pt2[][],
  frames: Frame[],
  capStart = true,
  capEnd = true,
  orient = true,
): THREE.BufferGeometry {
  const m = frames.length
  if (profiles.length !== m || m < 2) return new THREE.BufferGeometry()
  const reversed = signedArea(profiles[0]) < 0
  const polys = reversed ? profiles.map((p) => p.slice().reverse()) : profiles
  const poly = polys[0]
  const n = poly.length
  if (n < 3 || polys.some((p) => p.length !== n)) return new THREE.BufferGeometry()

  const positions: number[] = []
  const indices: number[] = []

  const lateral = new THREE.Vector3()

  // Precompute the world position of every profile vertex at every station.
  const rings: THREE.Vector3[][] = frames.map((f, i) => {
    lateral.copy(UP).cross(f.tangent).normalize()
    return polys[i].map((p) =>
      new THREE.Vector3()
        .copy(f.position)
        .addScaledVector(lateral, p.x)
        .addScaledVector(UP, p.y),
    )
  })

  // Side strips: one per profile edge, vertices duplicated between strips.
  for (let e = 0; e < n; e++) {
    const j0 = e
    const j1 = (e + 1) % n
    const base = positions.length / 3
    for (let i = 0; i < m; i++) {
      const a = rings[i][j0]
      const b = rings[i][j1]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
    // p0/p1 are the edge's two ends on this station, p2/p3 the same on the next.
    // Wound so the face normal points away from the solid, matching the caps —
    // mixing the two would leave a mesh whose signed volume partly cancels.
    for (let i = 0; i < m - 1; i++) {
      const p0 = base + i * 2
      const p1 = p0 + 1
      const p2 = p0 + 2
      const p3 = p0 + 3
      indices.push(p0, p1, p2, p1, p3, p2)
    }
  }

  // End caps, triangulated in profile space then mapped through each frame.
  const addCap = (frameIndex: number, flip: boolean) => {
    const capTris = THREE.ShapeUtils.triangulateShape(
      polys[frameIndex].map((p) => new THREE.Vector2(p.x, p.y)),
      [],
    )
    const ring = rings[frameIndex]
    const base = positions.length / 3
    for (const v of ring) positions.push(v.x, v.y, v.z)
    for (const tri of capTris) {
      if (flip) indices.push(base + tri[0], base + tri[2], base + tri[1])
      else indices.push(base + tri[0], base + tri[1], base + tri[2])
    }
  }

  if (capStart) addCap(0, true)
  if (capEnd) addCap(m - 1, false)

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  if (orient) ensureOutwardWinding(geom)
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  geom.computeBoundingSphere()
  return geom
}

/**
 * Flips every triangle if the mesh's signed volume came out negative, so exported
 * STL/3MF always has outward-facing normals regardless of profile orientation.
 */
export function ensureOutwardWinding(geom: THREE.BufferGeometry): void {
  const index = geom.getIndex()
  const pos = geom.getAttribute('position')
  if (!index) return
  const arr = index.array as Uint32Array | Uint16Array
  let vol = 0
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(pos, arr[i])
    b.fromBufferAttribute(pos, arr[i + 1])
    c.fromBufferAttribute(pos, arr[i + 2])
    vol += a.dot(b.clone().cross(c))
  }
  if (vol < 0) {
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1]
      arr[i + 1] = arr[i + 2]
      arr[i + 2] = t
    }
    index.needsUpdate = true
  }
}

/** Minimal position-only merge — enough for the parts we build here. */
export function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  let offset = 0
  for (const g of geoms) {
    const src = g.index ? g.toNonIndexed() : g
    const pos = src.getAttribute('position')
    const nor = src.getAttribute('normal')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i))
      indices.push(offset + i)
    }
    offset += pos.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setIndex(indices)
  if (normals.length === positions.length) {
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  } else {
    out.computeVertexNormals()
  }
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/** Stations along a straight run of `length` starting at the origin, heading +X. */
export function straightFrames(length: number): Frame[] {
  return [
    { position: new THREE.Vector3(0, 0, 0), tangent: new THREE.Vector3(1, 0, 0) },
    { position: new THREE.Vector3(length, 0, 0), tangent: new THREE.Vector3(1, 0, 0) },
  ]
}

/**
 * Stations along a horizontal arc starting at the origin heading +X.
 * Positive `angleDeg` turns left (towards -Z); the centre sits at (0, 0, ∓radius).
 */
export function arcFrames(radius: number, angleDeg: number, segments?: number): Frame[] {
  const total = THREE.MathUtils.degToRad(Math.abs(angleDeg))
  const sign = Math.sign(angleDeg) || 1
  const segs = segments ?? Math.max(6, Math.ceil(Math.abs(angleDeg) / 2.5))
  // Left turn (+) curves toward -Z, so the centre is at z = -radius.
  const cz = -sign * radius
  const frames: Frame[] = []
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * total
    const x = radius * Math.sin(t)
    const z = cz + sign * radius * Math.cos(t)
    frames.push({
      position: new THREE.Vector3(x, 0, z),
      tangent: new THREE.Vector3(Math.cos(t), 0, -sign * Math.sin(t)).normalize(),
    })
  }
  return frames
}
