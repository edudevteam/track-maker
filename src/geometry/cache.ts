import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import type { Piece } from '../types'
import { buildBlockGeometry, buildCarGeometry, buildTrackGeometry } from './parts'
import { REFERENCE_VEHICLE } from '../lib/carScales'
import { buildSnapClipGeometry, buildSupportClipGeometry, snapClipShape } from './snapClip'

/**
 * Geometry is rebuilt only when the inputs that actually shape it change, so
 * dragging a piece around never re-lofts it. Bounded LRU keyed on those inputs.
 */
const MAX_ENTRIES = 200
const cache = new Map<string, THREE.BufferGeometry>()

function take(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const geom = build()
  cache.set(key, geom)
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest !== undefined) {
      cache.get(oldest)?.dispose()
      cache.delete(oldest)
    }
  }
  return geom
}

/** Only the dimension fields that change the swept cross-section. */
function trackKey(d: Dimensions): string {
  const t = d.track
  return [
    t.totalHeight,
    t.wallThickness,
    t.channelTopWidth,
    t.slabThickness,
    t.rampHeight,
    t.wallAngleDeg,
    t.slotOuterWidth,
    t.slotMouthWidth,
    t.slotMouthDepth,
    t.slotCeiling,
    // Where a plain piece's pockets stop, how short a transition's flat ends may
    // be, and how far a junction's slots reach, which follows the clip's length.
    d.assembly.connectorInset,
    d.assembly.transitionMinFlatEnd,
    d.snapClip.length,
  ].join('|')
}

export function getTrackGeometry(piece: Piece, d: Dimensions): THREE.BufferGeometry {
  const shape =
    piece.kind === 'curve'
      ? `c:${piece.radius}:${piece.angleDeg}`
      : piece.kind === 'transition'
        ? `t:${piece.length}:${piece.lanesB}:${piece.cornerRadius}:${piece.flatEnd}`
        : piece.kind === 'junction'
          ? `j:${piece.openLeft ? 'l' : ''}${piece.openRight ? 'r' : ''}`
          : piece.kind === 'banked'
            ? `k:${piece.radius}:${piece.angleDeg}:${piece.bankAngle}:${piece.bankBase}:${d.elevation.rampAccessWidth}`
            : piece.kind === 'bend'
              ? `b:${piece.bendMode}:${piece.radius}:${piece.angleDeg}:${piece.rollDeg}:${piece.rollStart}:${piece.easeFrom}:${piece.easeTo}:${piece.length}:${piece.slope}:${piece.base}:${d.elevation.rampAccessWidth}`
              : `s:${piece.length}`
  return take(`track|${shape}|${piece.lanes}|${trackKey(d)}`, () => buildTrackGeometry(piece, d))
}

export function getCarGeometry(d: Dimensions): THREE.BufferGeometry {
  return take(`car|${d.track.channelTopWidth}`, () => buildCarGeometry(d))
}

/** The connector clip, at its own length unless a joint asks for a shorter one. */
export function getSnapClipGeometry(d: Dimensions, length = snapClipShape(d).L): THREE.BufferGeometry {
  return take(`snap|${length}|${Object.values(d.snapClip).join('|')}`, () => buildSnapClipGeometry(d, length))
}

/**
 * A support clip: the clip with a leg down to the floor `floor` mm below it,
 * tipped by `pitchDeg` on a slope. Both are rounded to a hundredth so dragging a
 * raised piece does not rebuild it every frame for a difference nobody could print.
 */
export function getSupportClipGeometry(
  d: Dimensions,
  length: number,
  floor: number,
  pitchDeg = 0,
): THREE.BufferGeometry {
  const f = Math.round(floor * 100) / 100
  const p = Math.round(pitchDeg * 100) / 100
  return take(
    `support|${length}|${f}|${p}|${Object.values(d.snapClip).join('|')}|${Object.values(d.elevation).join('|')}`,
    () => buildSupportClipGeometry(d, length, f, p),
  )
}

/** The placeholder block at its full reference size — a scale divides into it. */
export function getBlockGeometry(): THREE.BufferGeometry {
  return take('block', () => buildBlockGeometry(REFERENCE_VEHICLE))
}
