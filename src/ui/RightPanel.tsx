import { useMemo, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { useProject } from '../store/useProject'
import { ColorInput, Field, NumberInput, Section, Segmented, Toggle } from './controls'
import { LengthInput, useUnits } from './units'
import { computePrintVolume } from '../lib/printVolume'
import { laneWidth } from '../geometry/dimensions'
import type { GizmoAnchor, Vec3 } from '../types'

type Tab = 'properties' | 'build'

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('properties')
  return (
    <aside
      className="flex w-[268px] shrink-0 flex-col overflow-hidden border-l"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <div className="border-b p-2" style={{ borderColor: 'var(--color-line)' }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'properties', label: 'Part' },
            { value: 'build', label: 'Build' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'properties' && <Properties />}
        {tab === 'build' && <BuildTab />}
      </div>
    </aside>
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
  const { fmt } = useUnits()

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
        <Field label="Track width">
          <Segmented
            value={piece.lanes}
            onChange={(lanes) => set({ lanes })}
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? 'Single' : `${n}×` }))}
          />
        </Field>
        <p className="mb-2 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          {fmt(laneWidth(dims.track) * piece.lanes)} across
          {piece.lanes > 1 ? ' · inner walls removed' : ''}
        </p>

        {piece.kind === 'straight' ? (
          <Field label="Length" hint="Connector ends keep their width, so joins still fit.">
            <LengthInput
              value={piece.length}
              min={20}
              max={600}
              step={5}
              onChange={(length) => set({ length })}
            />
          </Field>
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

function BuildTab() {
  const printer = useProject((s) => s.printer)
  const customSize = useProject((s) => s.customPrinterSize)
  const setCustomSize = useProject((s) => s.setCustomPrinterSize)
  const pieces = useProject((s) => s.pieces)
  const dims = useProject((s) => s.dims)
  const { suffix, val } = useUnits()

  const result = useMemo(
    () => computePrintVolume(pieces, dims, printer.size),
    [pieces, dims, printer.size],
  )

  return (
    <>
      {printer.id === 'custom' && (
        <Section title="Custom build volume">
          <div className="grid grid-cols-3 gap-1.5">
            {(['X', 'Y (height)', 'Z'] as const).map((label, i) => (
              <Field key={label} label={label}>
                <LengthInput
                  value={customSize[i]}
                  step={5}
                  min={20}
                  onChange={(v) => {
                    const next = [...customSize] as Vec3
                    next[i] = v
                    setCustomSize(next)
                  }}
                />
              </Field>
            ))}
          </div>
        </Section>
      )}

      <Section title="Build size">
        {result.bounds ? (
          <dl className="space-y-1 text-[12px]">
            <Row
              label="Footprint"
              value={`${val(result.size[0], 1)} × ${val(result.size[2], 1)} ${suffix}`}
            />
            <Row label="Height" value={`${val(result.size[1], 1)} ${suffix}`} />
            <Row label="Pieces" value={String(pieces.length)} />
            <Row label="Printer" value={printer.name} />
            <Row
              label="Plates needed"
              value={`${result.cells.length} × ${val(printer.size[0], 0)}×${val(
                printer.size[2],
                0,
              )}×${val(printer.size[1], 0)}${suffix}`}
            />
          </dl>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
            Add track to see how much build volume it needs.
          </p>
        )}
        <p className="mt-2 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          The printer and the print-box preview are set in Settings ▸ Print.
        </p>
      </Section>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt style={{ color: 'var(--color-ink-2)' }}>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
