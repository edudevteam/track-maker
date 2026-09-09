import * as THREE from 'three'
import type { Dimensions } from '../geometry/dimensions'
import type { Piece, Vec3 } from '../types'
import { getTrackGeometry } from '../geometry/cache'
import { pieceMatrix } from './ports'

export interface PrintCell {
  /** Index of the cell within the tiling grid. */
  key: string
  /** Centre of the box in world space. */
  center: Vec3
  /** How many pieces have geometry inside this cell. */
  pieceCount: number
}

export interface PrintVolumeResult {
  cells: PrintCell[]
  /** World bounds of everything on the build. */
  bounds: THREE.Box3 | null
  /** Overall size of the assembly, mm. */
  size: Vec3
}

/** World-space bounding box of a single piece's track body. */
export function pieceBounds(piece: Piece, dims: Dimensions): THREE.Box3 {
  const geom = getTrackGeometry(piece, dims)
  if (!geom.boundingBox) geom.computeBoundingBox()
  return geom.boundingBox!.clone().applyMatrix4(pieceMatrix(piece))
}

/**
 * Tiles the assembly with printer-sized boxes so you can see how many build
 * plates the track needs. Boxes are laid out on a grid anchored at the
 * assembly's minimum corner, and only boxes that actually contain geometry are
 * returned — a track that runs off the end of one box simply gets another.
 */
export function computePrintVolume(
  pieces: Piece[],
  dims: Dimensions,
  printerSize: Vec3,
): PrintVolumeResult {
  const visible = pieces.filter((p) => p.visible)
  if (!visible.length) return { cells: [], bounds: null, size: [0, 0, 0] }

  const [sx, sy, sz] = printerSize
  const bounds = new THREE.Box3()
  const boxes = visible.map((p) => {
    const b = pieceBounds(p, dims)
    bounds.union(b)
    return b
  })

  const origin = bounds.min.clone()
  const counts = new Map<string, number>()

  boxes.forEach((b) => {
    const i0 = Math.floor((b.min.x - origin.x) / sx)
    const i1 = Math.floor((b.max.x - origin.x - 1e-6) / sx)
    const j0 = Math.floor((b.min.y - origin.y) / sy)
    const j1 = Math.floor((b.max.y - origin.y - 1e-6) / sy)
    const k0 = Math.floor((b.min.z - origin.z) / sz)
    const k1 = Math.floor((b.max.z - origin.z - 1e-6) / sz)
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const key = `${i},${j},${k}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
  })

  const cells: PrintCell[] = []
  for (const [key, pieceCount] of counts) {
    const [i, j, k] = key.split(',').map(Number)
    cells.push({
      key,
      center: [
        origin.x + (i + 0.5) * sx,
        origin.y + (j + 0.5) * sy,
        origin.z + (k + 0.5) * sz,
      ],
      pieceCount,
    })
  }
  cells.sort((a, b) => a.key.localeCompare(b.key))

  const size = bounds.getSize(new THREE.Vector3())
  return { cells, bounds, size: [size.x, size.y, size.z] }
}
