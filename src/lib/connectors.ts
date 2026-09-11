import type { Piece, PortId } from '../types'
import { junctionClipLength } from '../geometry/junction'
import type { Dimensions } from '../geometry/dimensions'

/**
 * Whether this piece should draw the clip at `port`.
 *
 * A joined pair shares one physical clip, so exactly one of the two pieces has
 * to own it. Lowest piece id wins — deterministic, and it holds for b-to-b joins
 * as well as the usual b-to-a.
 *
 * Every way onto a piece is held the same way. A junction's side openings were
 * butt joints while the tile was a straight with holes in its walls, because
 * there was no slot cut across its underside for a clip to seat in; the square
 * tile carries one in from all four sides, so there is nothing left to special
 * case.
 */
export function ownsConnector(piece: Piece, port: PortId): boolean {
  if (!piece.connectors[port]) return false
  const link = piece.links[port]
  return !link || piece.id < link.pieceId
}

/**
 * How long the clip at this joint is, mm.
 *
 * A junction takes a shorter one on every side — the standard clip reaches
 * further into the tile than there is room for before two of its slots meet — and
 * the piece on the other side of the joint has to use the same one, since there
 * is only the one clip between them. `neighbour` is whatever is joined there, or
 * nothing when the end is still open.
 */
export function clipLength(piece: Piece, neighbour: Piece | undefined, d: Dimensions): number {
  const junction = piece.kind === 'junction' || neighbour?.kind === 'junction'
  return junction ? junctionClipLength(d) : d.connector.length
}
