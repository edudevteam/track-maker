import type { ClipSize, Piece, PortId } from '../types'
import { junctionClipLength } from '../geometry/junction'
import { connectorInset, longClipLength, type Dimensions } from '../geometry/dimensions'
import { plainLength } from '../geometry/parts'
import { snapClipShape } from '../geometry/snapClip'
import { transitionLayout } from '../geometry/transition'

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
 * How far the slot runs in from an end of a piece, mm: the pocket on a straight
 * or a curve — the whole of half the piece when it is too short for a solid
 * middle — and the full-width flat end on a transition. A junction's slots are
 * sized to the short clip, so it has no room to offer beyond that.
 */
function pocketDepth(piece: Piece, d: Dimensions): number {
  if (piece.kind === 'junction') return 0
  if (piece.kind === 'transition') {
    return transitionLayout(d, {
      lanesA: piece.lanes,
      lanesB: piece.lanesB,
      length: Math.max(1, piece.length),
      cornerRadius: piece.cornerRadius,
      flatEnd: piece.flatEnd,
    }).flatEnd
  }
  return connectorInset(d, plainLength(piece))
}

/** Whether the long clip can reach into this piece and still leave the end gap clear. */
function roomForLong(piece: Piece, d: Dimensions): boolean {
  return pocketDepth(piece, d) + 1e-6 >= longClipLength(d) / 2 + Math.max(0, d.snapClip.longEndGap)
}

/**
 * How long the clip at this joint is, mm.
 *
 * `size` is the Settings ▸ Connector choice. The long clip goes in only where
 * both pieces have the pocket for it with the end gap left clear — a short
 * straight whose two pockets meet, or a transition with short flat ends, takes
 * the short clip instead. An open end is judged on its own piece.
 *
 * A junction only shortens the clip if it has been made longer than the tile has
 * room for before two of its slots meet, and the piece on the other side of that
 * joint uses the same one, since there is only the one clip between them.
 * `neighbour` is whatever is joined there, or nothing when the end is still open.
 */
export function clipLength(
  piece: Piece,
  neighbour: Piece | undefined,
  d: Dimensions,
  size: ClipSize = 'short',
): number {
  const junction = piece.kind === 'junction' || neighbour?.kind === 'junction'
  if (junction) return junctionClipLength(d)
  const long = longClipLength(d)
  if (size === 'long' && long > snapClipShape(d).L && roomForLong(piece, d) && (!neighbour || roomForLong(neighbour, d))) {
    return long
  }
  return snapClipShape(d).L
}
