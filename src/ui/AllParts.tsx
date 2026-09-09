import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Pencil } from 'lucide-react'
import { useProject } from '../store/useProject'
import { Panel } from './controls'
import type { Piece } from '../types'

/** What the piece is, shown after its name so a renamed piece still reads clearly. */
const kindLabel = (p: Piece) => (p.kind === 'straight' ? 'Straight' : 'Curve')

/**
 * Every piece on the workplane, one row each. The checkbox builds up a selection
 * without hunting for pieces in the viewport, the eye hides a piece from the
 * scene, and the pencil renames it — the part type stays in parentheses either
 * way.
 */
export function AllParts() {
  const pieces = useProject((s) => s.pieces)
  const [open, setOpen] = useState(false)

  return (
    <Panel
      title="All Parts"
      count={pieces.length}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      bodyClassName="max-h-[34vh]"
    >
      {pieces.length === 0 ? (
        <p className="p-3 text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
          Nothing on the workplane yet. Add a piece from the parts library.
        </p>
      ) : (
        <ul className="py-1">
          {pieces.map((p) => (
            <Row key={p.id} piece={p} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Row({ piece }: { piece: Piece }) {
  const selected = useProject((s) => s.selection.pieceIds.includes(piece.id))
  const selectedIds = useProject((s) => s.selection.pieceIds)
  const select = useProject((s) => s.select)
  const updatePiece = useProject((s) => s.updatePiece)
  const commit = useProject((s) => s.commit)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(piece.name)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const startEdit = () => {
    setDraft(piece.name)
    setEditing(true)
  }

  const commitName = () => {
    setEditing(false)
    const name = draft.trim()
    if (!name || name === piece.name) return
    commit()
    updatePiece(piece.id, { name })
  }

  // The checkbox adds to or drops from the selection, so several pieces can be
  // gathered without shift-clicking them in the viewport.
  const toggleChecked = () =>
    select(selected ? selectedIds.filter((id) => id !== piece.id) : [...selectedIds, piece.id])

  return (
    <li
      className="flex items-center gap-1.5 px-2 py-1 transition hover:bg-black/5 dark:hover:bg-white/5"
      style={selected ? { background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)' } : undefined}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={toggleChecked}
        title={selected ? 'Deselect' : 'Select'}
        aria-label={`Select ${piece.name}`}
        className="h-[13px] w-[13px] shrink-0 cursor-pointer accent-[var(--color-accent)]"
      />
      <button
        type="button"
        onClick={() => updatePiece(piece.id, { visible: !piece.visible })}
        title={piece.visible ? 'Hide' : 'Show'}
        aria-label={piece.visible ? `Hide ${piece.name}` : `Show ${piece.name}`}
        className="shrink-0 rounded p-1 transition hover:bg-black/10 dark:hover:bg-white/10"
        style={{ color: piece.visible ? 'var(--color-ink)' : 'var(--color-ink-2)' }}
      >
        {piece.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {editing ? (
        <input
          ref={input}
          className="tm-input min-w-0 flex-1 py-0.5 text-[12px]"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => select([piece.id])}
          onDoubleClick={startEdit}
          className="min-w-0 flex-1 truncate text-left text-[12px]"
          style={{ opacity: piece.visible ? 1 : 0.5 }}
        >
          {piece.name}{' '}
          <span style={{ color: 'var(--color-ink-2)' }}>({kindLabel(piece)})</span>
        </button>
      )}

      <button
        type="button"
        onClick={startEdit}
        title="Rename"
        aria-label={`Rename ${piece.name}`}
        className="shrink-0 rounded p-1 transition hover:bg-black/10 dark:hover:bg-white/10"
        style={{ color: 'var(--color-ink-2)' }}
      >
        <Pencil size={12} />
      </button>
    </li>
  )
}
