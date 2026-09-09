import { useMemo, useState } from 'react'
import { AlertTriangle, Copy, RotateCcw, Trash2 } from 'lucide-react'
import {
  useProject,
  PRINTER_PRESETS,
  DEFAULT_SKY_TOP,
  DEFAULT_SKY_BOTTOM,
  type BackgroundMode,
} from '../store/useProject'
import { ColorInput, Field, NumberInput, Section, Segmented, Toggle } from './controls'
import { computePrintVolume } from '../lib/printVolume'
import { floorTopY, laneWidth, validateDimensions, wallStraightHeight } from '../geometry/dimensions'
import type { GizmoAnchor, Vec3 } from '../types'

type Tab = 'properties' | 'dimensions' | 'view' | 'print'

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
            { value: 'dimensions', label: 'Dims' },
            { value: 'view', label: 'View' },
            { value: 'print', label: 'Print' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'properties' && <Properties />}
        {tab === 'dimensions' && <DimensionsTab />}
        {tab === 'view' && <ViewTab />}
        {tab === 'print' && <PrintTab />}
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
          {(laneWidth(dims.track) * piece.lanes).toFixed(2)}mm across
          {piece.lanes > 1 ? ' · inner walls removed' : ''}
        </p>

        {piece.kind === 'straight' ? (
          <Field label="Length" hint="Connector ends keep their width, so joins still fit.">
            <NumberInput
              value={piece.length}
              min={20}
              max={600}
              step={5}
              suffix="mm"
              onChange={(length) => set({ length })}
            />
          </Field>
        ) : (
          <>
            <Field label="Radius">
              <NumberInput
                value={piece.radius}
                min={40}
                max={800}
                step={5}
                suffix="mm"
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
              <NumberInput
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

const TRACK_FIELDS: { key: string; label: string; step?: number; suffix?: string }[] = [
  { key: 'totalHeight', label: 'Overall height' },
  { key: 'wallThickness', label: 'Wall thickness' },
  { key: 'channelTopWidth', label: 'Channel width (top)' },
  { key: 'slabThickness', label: 'Slab thickness' },
  { key: 'rampHeight', label: 'Ramp height' },
  { key: 'wallAngleDeg', label: 'Wall angle', step: 1, suffix: '°' },
  { key: 'slotOuterWidth', label: 'T-slot undercut width' },
  { key: 'slotMouthWidth', label: 'T-slot mouth width' },
  { key: 'slotCeiling', label: 'Material above slot' },
]

const CONNECTOR_FIELDS: { key: string; label: string; step?: number; suffix?: string }[] = [
  { key: 'length', label: 'Clip length', step: 1 },
  { key: 'bodyWidth', label: 'Body width' },
  { key: 'bodyHeight', label: 'Body height' },
  { key: 'wingSpan', label: 'Wing span' },
  { key: 'wingThickness', label: 'Wing thickness' },
  { key: 'wingChamfer', label: 'Wing chamfer' },
  { key: 'wingAngleDeg', label: 'Wing angle', step: 1, suffix: '°' },
  { key: 'endChamfer', label: 'End chamfer' },
  { key: 'holeCount', label: 'Hole count', step: 1, suffix: '' },
  { key: 'holeSpan', label: 'Hole span', step: 1 },
  { key: 'holeDia', label: 'Hole Ø' },
  { key: 'counterSinkDia', label: 'Countersink Ø' },
  { key: 'counterSinkDepth', label: 'Countersink depth' },
  { key: 'innerRingHeight', label: 'Inner ring height' },
]

function DimensionsTab() {
  const dims = useProject((s) => s.dims)
  const setDimValue = useProject((s) => s.setDimValue)
  const resetDims = useProject((s) => s.resetDims)
  const warnings = useMemo(() => validateDimensions(dims), [dims])

  return (
    <>
      <div className="tm-section">
        <p className="text-[11.5px]" style={{ color: 'var(--color-ink-2)' }}>
          Read from the Fusion sketches in <code>Plan/media/</code>. A few values were inferred from
          the 2D views — correct anything that doesn't match your part and every piece rebuilds.
        </p>
        {warnings.map((w) => (
          <div
            key={w.field}
            className="mt-2 flex gap-1.5 rounded border p-2 text-[11px]"
            style={{ borderColor: '#d97706', background: 'color-mix(in srgb, #d97706 12%, transparent)' }}
          >
            <AlertTriangle size={13} className="mt-[1px] shrink-0" />
            <span>{w.message}</span>
          </div>
        ))}
      </div>

      <Section
        title="Track profile"
        action={
          <button className="tm-btn px-1.5 py-1" title="Reset to the CAD values" onClick={resetDims}>
            <RotateCcw size={12} />
          </button>
        }
      >
        {TRACK_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <NumberInput
              value={(dims.track as unknown as Record<string, number>)[f.key]}
              step={f.step ?? 0.1}
              min={0}
              suffix={f.suffix ?? 'mm'}
              onChange={(v) => setDimValue('track', f.key, v)}
            />
          </Field>
        ))}
        <p className="text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          Lane pitch {laneWidth(dims.track).toFixed(3)}mm · channel floor at{' '}
          {floorTopY(dims.track).toFixed(3)}mm · straight wall{' '}
          {wallStraightHeight(dims.track).toFixed(3)}mm
        </p>
      </Section>

      <Section title="Connector clip">
        {CONNECTOR_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <NumberInput
              value={(dims.connector as unknown as Record<string, number>)[f.key]}
              step={f.step ?? 0.1}
              min={0}
              suffix={f.suffix ?? 'mm'}
              onChange={(v) => setDimValue('connector', f.key, v)}
            />
          </Field>
        ))}
      </Section>

      <Section title="Assembly">
        <Field label="Connector inset" hint="How far the clip reaches into each piece.">
          <NumberInput
            value={dims.assembly.connectorInset}
            step={1}
            min={5}
            suffix="mm"
            onChange={(v) => setDimValue('assembly', 'connectorInset', v)}
          />
        </Field>
        <Field label="Fit clearance" hint="Slop between clip and slot so prints assemble.">
          <NumberInput
            value={dims.assembly.fitClearance}
            step={0.05}
            min={0}
            max={1}
            suffix="mm"
            onChange={(v) => setDimValue('assembly', 'fitClearance', v)}
          />
        </Field>
        <Field label="Default straight length">
          <NumberInput
            value={dims.assembly.defaultStraightLength}
            step={5}
            min={20}
            suffix="mm"
            onChange={(v) => setDimValue('assembly', 'defaultStraightLength', v)}
          />
        </Field>
      </Section>
    </>
  )
}

const SKY_PRESETS: { name: string; top: string; bottom: string }[] = [
  { name: 'Daylight', top: DEFAULT_SKY_TOP, bottom: DEFAULT_SKY_BOTTOM },
  { name: 'Dusk', top: '#2b3a67', bottom: '#e8a87c' },
  { name: 'Studio', top: '#4a5560', bottom: '#c9d1d9' },
  { name: 'Slate', top: '#1c2733', bottom: '#4a5866' },
]

function ViewTab() {
  const showGrid = useProject((s) => s.showGrid)
  const toggleGrid = useProject((s) => s.toggleGrid)
  const showPorts = useProject((s) => s.showPorts)
  const togglePorts = useProject((s) => s.togglePorts)
  const background = useProject((s) => s.background)
  const setBackground = useProject((s) => s.setBackground)
  const skyTop = useProject((s) => s.skyTop)
  const skyBottom = useProject((s) => s.skyBottom)
  const setSkyColors = useProject((s) => s.setSkyColors)
  const solidColor = useProject((s) => s.solidColor)
  const setSolidColor = useProject((s) => s.setSolidColor)

  return (
    <>
      <Section title="Display">
        <Toggle checked={showGrid} onChange={toggleGrid} label="Grid" hint="Ground plane, 10mm cells." />
        <Toggle
          checked={showPorts}
          onChange={togglePorts}
          label="Track ends"
          hint="Highlights the end a new piece will snap to."
        />
      </Section>

      <Section title="Background">
        <Field label="Mode" hint="Sky adds a gradient above the grid for contrast.">
          <Segmented<BackgroundMode>
            value={background}
            onChange={setBackground}
            options={[
              { value: 'theme', label: 'Theme' },
              { value: 'sky', label: 'Sky' },
              { value: 'solid', label: 'Solid' },
            ]}
          />
        </Field>

        {background === 'sky' && (
          <>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {SKY_PRESETS.map((p) => (
                <button
                  key={p.name}
                  className="h-6.5 rounded border transition"
                  title={p.name}
                  onClick={() => setSkyColors(p.top, p.bottom)}
                  style={{
                    background: `linear-gradient(${p.top}, ${p.bottom})`,
                    borderColor:
                      skyTop === p.top && skyBottom === p.bottom ? 'var(--color-accent)' : 'var(--color-line)',
                  }}
                />
              ))}
            </div>
            <Field label="Sky (top)">
              <ColorInput value={skyTop} onChange={(v) => setSkyColors(v, skyBottom)} />
            </Field>
            <Field label="Horizon (bottom)">
              <ColorInput value={skyBottom} onChange={(v) => setSkyColors(skyTop, v)} />
            </Field>
          </>
        )}

        {background === 'solid' && (
          <Field label="Colour">
            <ColorInput value={solidColor} onChange={setSolidColor} />
          </Field>
        )}
      </Section>
    </>
  )
}

function PrintTab() {
  const printer = useProject((s) => s.printer)
  const setPrinter = useProject((s) => s.setPrinter)
  const customSize = useProject((s) => s.customPrinterSize)
  const setCustomSize = useProject((s) => s.setCustomPrinterSize)
  const showPrintVolume = useProject((s) => s.showPrintVolume)
  const togglePrintVolume = useProject((s) => s.togglePrintVolume)
  const pieces = useProject((s) => s.pieces)
  const dims = useProject((s) => s.dims)

  const result = useMemo(
    () => computePrintVolume(pieces, dims, printer.size),
    [pieces, dims, printer.size],
  )

  return (
    <>
      <Section title="Print area preview">
        <Toggle
          checked={showPrintVolume}
          onChange={togglePrintVolume}
          label="Wrap track in print boxes"
          hint="One box per build plate, added as the track grows."
        />
        <Field label="Printer">
          <select className="tm-input" value={printer.id} onChange={(e) => setPrinter(e.target.value)}>
            {PRINTER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {printer.id === 'custom' && (
          <div className="grid grid-cols-3 gap-1.5">
            {(['X', 'Y (height)', 'Z'] as const).map((label, i) => (
              <Field key={label} label={label}>
                <NumberInput
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
        )}
      </Section>

      <Section title="Build size">
        {result.bounds ? (
          <dl className="space-y-1 text-[12px]">
            <Row label="Footprint" value={`${result.size[0].toFixed(1)} × ${result.size[2].toFixed(1)} mm`} />
            <Row label="Height" value={`${result.size[1].toFixed(1)} mm`} />
            <Row label="Pieces" value={String(pieces.length)} />
            <Row
              label="Plates needed"
              value={`${result.cells.length} × ${printer.size[0]}×${printer.size[2]}×${printer.size[1]}mm`}
            />
          </dl>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
            Add track to see how much build volume it needs.
          </p>
        )}
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
