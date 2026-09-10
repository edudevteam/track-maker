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
  const halfW = (pitch * n) / 2

  const { slotH, mouthH, outerHalf, mouthHalf } = slotMetrics(d)

  const pts: Pt2[] = [...topOutline(t, halfW)]

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

/** Where the walls sit for a piece of half-width `halfW`. */
export function wallMetrics(t: Dimensions['track'], halfW: number) {
  const floorY = floorTopY(t)
  const innerX = Math.max(0.5, halfW - t.wallThickness)
  // The 110° wall angle is measured from the floor, so the ramp leans 20° off vertical.
  const rampRun = t.rampHeight * Math.tan(THREE.MathUtils.degToRad(t.wallAngleDeg - 90))
  const rampBottomX = THREE.MathUtils.clamp(innerX - rampRun, 0.2, innerX)
  const rampTopY = Math.min(floorY + t.rampHeight, t.totalHeight - 0.2)
  return { floorY, innerX, rampBottomX, rampTopY }
}

/**
 * The eight points across the top of a section — left wall, down the ramp,
 * across the channel floor and up the far wall. Shared by the plain track and
 * the transition piece so both taper their walls the same way.
 */
export function topOutline(t: Dimensions['track'], halfW: number): Pt2[] {
  const { innerX, rampBottomX, rampTopY, floorY } = wallMetrics(t, halfW)
  return [
    { x: -halfW, y: t.totalHeight },
    { x: -innerX, y: t.totalHeight },
    { x: -innerX, y: rampTopY },
    { x: -rampBottomX, y: floorY },
    { x: rampBottomX, y: floorY },
    { x: innerX, y: rampTopY },
    { x: innerX, y: t.totalHeight },
    { x: halfW, y: t.totalHeight },
  ]
}

/**
 * The T-slot's clamped shape. Clamped so a hand-edited dimension can never fold
 * the polygon back on itself.
 */
export function slotMetrics(d: Dimensions) {
  const t = d.track
  const pitch = laneWidth(t)
  const floorY = floorTopY(t)
  const slotH = Math.min(slotDepth(d), floorY - 0.2)
  const mouthH = Math.min(slotMouthDepth(d), slotH - 0.05)
  const outerHalf = Math.min(t.slotOuterWidth / 2, pitch / 2 - 0.2)
  const mouthHalf = Math.min(t.slotMouthWidth / 2, outerHalf - 0.05)
  return { pitch, floorY, slotH, mouthH, outerHalf, mouthHalf }
}

/** Outer width of an N-lane piece. */
export function pieceWidth(d: Dimensions, lanes: number): number {
  return laneWidth(d.track) * Math.max(1, Math.round(lanes))
}

/** Height the car's wheels ride at — the top of the channel floor. */
export function railHeight(d: Dimensions): number {
  return floorTopY(d.track)
}
