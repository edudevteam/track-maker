import * as THREE from 'three'
import type { Dimensions } from './dimensions'
import type { Piece } from '../types'
import { buildBlockGeometry, buildCarGeometry, buildConnectorGeometry, buildTrackGeometry } from './parts'
import { REFERENCE_VEHICLE } from '../lib/carScales'

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
    t.slotCeiling,
    d.connector.bodyHeight,
    d.connector.wingThickness,
    d.assembly.fitClearance,
    // A transition sets its taper against the connector inset, and a junction
    // sets how far its slots reach against the clip that goes in them.
    d.assembly.connectorInset,
    d.assembly.junctionConnectorLength,
  ].join('|')
}

function connectorKey(d: Dimensions): string {
  const c = d.connector
  return [
    c.holeSpan,
    c.holeCount,
    c.holeDia,
    c.counterSinkDia,
    c.counterSinkDepth,
    c.innerRingHeight,
    c.bodyWidth,
    c.bodyHeight,
    c.wingThickness,
    c.wingChamfer,
    c.wingAngleDeg,
    c.wingSpan,
    c.endChamfer,
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
          : `s:${piece.length}`
  return take(`track|${shape}|${piece.lanes}|${trackKey(d)}`, () => buildTrackGeometry(piece, d))
}

export function getConnectorGeometry(d: Dimensions, length: number): THREE.BufferGeometry {
  return take(`conn|${length}|${connectorKey(d)}`, () => buildConnectorGeometry(d, length))
}

export function getCarGeometry(d: Dimensions): THREE.BufferGeometry {
  return take(`car|${d.track.channelTopWidth}`, () => buildCarGeometry(d))
}

/** The placeholder block at its full reference size — a scale divides into it. */
export function getBlockGeometry(): THREE.BufferGeometry {
  return take('block', () => buildBlockGeometry(REFERENCE_VEHICLE))
}
