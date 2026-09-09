import type { Piece, PortId } from '../types'

/**
 * Whether this piece should draw the clip at `port`.
 *
 * A joined pair shares one physical clip, so exactly one of the two pieces has
 * to own it. Lowest piece id wins — deterministic, and it holds for b-to-b joins
 * as well as the usual b-to-a.
 */
export function ownsConnector(piece: Piece, port: PortId): boolean {
  if (!piece.connectors[port]) return false
  const link = piece.links[port]
  return !link || piece.id < link.pieceId
}
