import * as THREE from 'three'
import type { Pt2 } from './sweep'
import { Dimensions, floorTopY, laneWidth, slotDepth, slotMouthDepth } from './dimensions'

/**
 * Builds the track cross-section for an N-lane piece.
 *
 * A 2-lane piece is two single tracks side by side with the shared middle walls
 * removed (per the plan and drawing 07), so only the two outermost walls survive
 * and the channel floor spans the full width. The underside keeps one T-slot per
 * lane, on the lane centres, so a wide piece still clips to narrow neighbours.
 *
 * Returned points are counter-clockwise in a plane where +x is across the track
 * (0 = centreline) and +y is up (0 = bottom face).
 */
export function trackProfile(d: Dimensions, lanes: number): Pt2[] {
  const t = d.track
  const n = Math.max(1, Math.round(lanes))
  const pitch = laneWidth(t)
  const width = pitch * n
  const halfW = width / 2

  const floorY = floorTopY(t)
  const innerX = Math.max(0.5, halfW - t.wallThickness)
  // The 110° wall angle is measured from the floor, so the ramp leans 20° off vertical.
  const rampRun = t.rampHeight * Math.tan(THREE.MathUtils.degToRad(t.wallAngleDeg - 90))
  const rampBottomX = THREE.MathUtils.clamp(innerX - rampRun, 0.2, innerX)
  const rampTopY = Math.min(floorY + t.rampHeight, t.totalHeight - 0.2)

  // Clamped so a hand-edited dimension can never fold the polygon back on itself.
  const slotH = Math.min(slotDepth(d), floorY - 0.2)
  const mouthH = Math.min(slotMouthDepth(d), slotH - 0.05)
  const outerHalf = Math.min(t.slotOuterWidth / 2, pitch / 2 - 0.2)
  const mouthHalf = Math.min(t.slotMouthWidth / 2, outerHalf - 0.05)

  const pts: Pt2[] = []

  // Top surface, left wall over to the right wall.
  pts.push({ x: -halfW, y: t.totalHeight })
  pts.push({ x: -innerX, y: t.totalHeight })
  pts.push({ x: -innerX, y: rampTopY })
  pts.push({ x: -rampBottomX, y: floorY })
  pts.push({ x: rampBottomX, y: floorY })
  pts.push({ x: innerX, y: rampTopY })
  pts.push({ x: innerX, y: t.totalHeight })
  pts.push({ x: halfW, y: t.totalHeight })

  // Bottom face, right to left, notched with one T-slot per lane.
  pts.push({ x: halfW, y: 0 })
  for (let i = n - 1; i >= 0; i--) {
    const c = -halfW + pitch * (i + 0.5)
    pts.push({ x: c + mouthHalf, y: 0 })
    pts.push({ x: c + mouthHalf, y: mouthH })
    pts.push({ x: c + outerHalf, y: mouthH })
    pts.push({ x: c + outerHalf, y: slotH })
    pts.push({ x: c - outerHalf, y: slotH })
    pts.push({ x: c - outerHalf, y: mouthH })
    pts.push({ x: c - mouthHalf, y: mouthH })
    pts.push({ x: c - mouthHalf, y: 0 })
  }
  pts.push({ x: -halfW, y: 0 })

  return pts
}

/** Outer width of an N-lane piece. */
export function pieceWidth(d: Dimensions, lanes: number): number {
  return laneWidth(d.track) * Math.max(1, Math.round(lanes))
}

/** Height the car's wheels ride at — the top of the channel floor. */
export function railHeight(d: Dimensions): number {
  return floorTopY(d.track)
}
