import { useEffect, useRef, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { useProject } from '../store/useProject'
import { ColorInput, Field, NumberInput, Panel, Section, Segmented, Toggle } from './controls'
import { LengthInput, useUnits } from './units'
import { LENGTH_PRESETS, MAX_LANES } from './PartsLibrary'
import { laneWidth } from '../geometry/dimensions'
import type { GizmoAnchor, Vec3 } from '../types'

/**
 * The selected part's settings, floating over the workplane rather than docked
 * to a side. It collapses to its title bar when nothing is selected and opens
 * again as soon as a piece is picked, so an empty panel never takes up room.
 *
 * Build size lives in the toolbar's Build details.
 */
export function PartDetails() {
  const hasSelection = useProject((s) => s.selection.pieceIds.length > 0)
  const [open, setOpen] = useState(hasSelection)
  const wasSelected = useRef(hasSelection)

  // Selecting a piece opens the box, deselecting closes it — but only on the
  // change, so a manual toggle sticks until the selection moves on.
  useEffect(() => {
    if (hasSelection === wasSelected.current) return
    wasSelected.current = hasSelection
    setOpen(hasSelection)
  }, [hasSelection])

  return (
    <Panel title="Part Details" open={open} onToggle={() => setOpen((v) => !v)}>
      <Properties />
    </Panel>
  )
}

function Properties() {
  const pieces = useProject((s) => s.pieces)
  const selection = useProject((s) => s.selection)
  const setAnchor = useProject((s) => s.setAnchor)
  const updatePiece = useProject((s) => s.updatePiece)
  const removeSelected = useProject((s) => s.removeSelected)
  const duplicateSelected = useProject((s) => s.duplicateSelected)
  const commit = useProject((s) => s.commit)
  const dims = useProject((s) => s.dims)
  const { fmt, val } = useUnits()

  const selected = pieces.filter((p) => selection.pieceIds.includes(p.id))
  const piece = selected[0]

  if (!piece) {
    return (
      <div className="p-3">
        <p className="text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
          Select a piece to edit it. Click any track body in the viewport, or a row in the browser.
        </p>
      </div>
    )
  }

  const set = (patch: Parameters<typeof updatePiece>[1]) => {
    commit()
    for (const p of selected) updatePiece(p.id, patch)
  }

  const joined = piece.links.a !== null || piece.links.b !== null

  return (
    <>
      <Section
        title={selected.length > 1 ? `${selected.length} pieces selected` : piece.name}
        action={
          <div className="flex gap-1">
            <button className="tm-btn px-1.5 py-1" title="Duplicate" onClick={duplicateSelected}>
              <Copy size={12} />
            </button>
            <button className="tm-btn px-1.5 py-1" title="Delete" onClick={removeSelected}>
              <Trash2 size={12} />
            </button>
          </div>
        }
      >
        <Field label="Handle position" hint="Where the move/rotate gizmo grabs the piece.">
          <Segmented<GizmoAnchor>
            value={selection.anchor}
            onChange={setAnchor}
            options={[
              { value: 'a', label: 'Side A' },
              { value: 'middle', label: 'Middle' },
              { value: 'b', label: 'Side B' },
            ]}
          />
        </Field>
        {joined && (
          <p className="text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
            This piece is joined, so moving it carries the whole assembly. Use the disconnect tool to
            free an end first.
          </p>
        )}
      </Section>

      <Section title="Shape">
        <Field label="Track width" hint="Whole lanes.">
          <NumberInput
            value={piece.lanes}
            onChange={(v) => set({ lanes: Math.max(1, Math.round(v)) })}
            step={1}
            min={1}
            max={MAX_LANES}
            digits={0}
            clampWhileTyping
            suffix="×"
          />
        </Field>
        <p className="mb-2 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          {fmt(laneWidth(dims.track) * piece.lanes)} across
          {piece.lanes > 1 ? ' · inner walls removed' : ''}
        </p>

        {piece.kind === 'straight' ? (
          <>
            <Field label="Length" hint="Connector ends keep their width, so joins still fit.">
              <LengthInput
                value={piece.length}
                min={20}
                max={600}
                step={5}
                onChange={(length) => set({ length })}
              />
            </Field>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {LENGTH_PRESETS.map((l) => (
                <button
                  key={l}
                  className="tm-btn px-0"
                  style={piece.length === l ? { borderColor: 'var(--color-accent)' } : undefined}
                  onClick={() => set({ length: l })}
                >
                  {val(l, 0)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Field label="Radius">
              <LengthInput
                value={piece.radius}
                min={40}
                max={800}
                step={5}
                onChange={(radius) => set({ radius })}
              />
            </Field>
            <Field label="Sweep" hint="Negative turns right.">
              <NumberInput
                value={piece.angleDeg}
                min={-180}
                max={180}
                step={5}
                suffix="°"
                onChange={(angleDeg) => set({ angleDeg })}
              />
            </Field>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {[15, 30, 45, 90].map((a) => (
                <button
                  key={a}
                  className="tm-btn px-0"
                  onClick={() => set({ angleDeg: Math.sign(piece.angleDeg || 1) * a })}
                >
                  {a}°
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Appearance">
        <Field label="Track colour">
          <ColorInput value={piece.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Connector colour">
          <ColorInput value={piece.connectorColor} onChange={(connectorColor) => set({ connectorColor })} />
        </Field>
        <Toggle
          checked={piece.connectors.a}
          onChange={(v) => set({ connectors: { ...piece.connectors, a: v } })}
          label="Connector on side A"
        />
        <Toggle
          checked={piece.connectors.b}
          onChange={(v) => set({ connectors: { ...piece.connectors, b: v } })}
          label="Connector on side B"
        />
      </Section>

      <Section title="Transform">
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <Field key={axis} label={axis}>
              <LengthInput
                value={piece.position[i]}
                step={1}
                onChange={(v) => {
                  const next = [...piece.position] as Vec3
                  next[i] = v
                  set({ position: next })
                }}
              />
            </Field>
          ))}
        </div>
      </Section>
    </>
  )
}
