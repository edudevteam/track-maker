import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import { useProject } from '../store/useProject'
import { Field, NumberInput, Section } from './controls'
import { LengthInput, useUnits } from './units'
import { formatLength, unitNoun } from '../lib/units'
import {
  DEFAULT_DIMENSIONS,
  floorTopY,
  laneWidth,
  validateDimensions,
  wallStraightHeight,
  type Dimensions,
} from '../geometry/dimensions'

interface DimField {
  key: string
  label: string
  step?: number
  /** A length unless said otherwise; only lengths follow the chosen unit. */
  kind?: 'angle' | 'count'
}

const TRACK_FIELDS: DimField[] = [
  { key: 'totalHeight', label: 'Overall height' },
  { key: 'wallThickness', label: 'Wall thickness' },
  { key: 'channelTopWidth', label: 'Channel width (top)' },
  { key: 'slabThickness', label: 'Slab thickness' },
  { key: 'rampHeight', label: 'Ramp height' },
  { key: 'wallAngleDeg', label: 'Wall angle', step: 1, kind: 'angle' },
  { key: 'slotOuterWidth', label: 'T-slot undercut width' },
  { key: 'slotMouthWidth', label: 'T-slot mouth width' },
  { key: 'slotCeiling', label: 'Material above slot' },
]

const CONNECTOR_FIELDS: DimField[] = [
  { key: 'length', label: 'Clip length', step: 1 },
  { key: 'bodyWidth', label: 'Body width' },
  { key: 'bodyHeight', label: 'Body height' },
  { key: 'wingSpan', label: 'Wing span' },
  { key: 'wingThickness', label: 'Wing thickness' },
  { key: 'wingChamfer', label: 'Wing chamfer' },
  { key: 'wingAngleDeg', label: 'Wing angle', step: 1, kind: 'angle' },
  { key: 'endChamfer', label: 'End chamfer' },
  { key: 'holeCount', label: 'Hole count', step: 1, kind: 'count' },
  { key: 'holeSpan', label: 'Hole span', step: 1 },
  { key: 'holeDia', label: 'Hole Ø' },
  { key: 'counterSinkDia', label: 'Countersink Ø' },
  { key: 'counterSinkDepth', label: 'Countersink depth' },
  { key: 'innerRingHeight', label: 'Inner ring height' },
]

/**
 * The parametric dimensions of every part, edited as a draft. Nothing reaches the
 * build until Save, so Cancel leaves the pieces exactly as they were and a
 * half-typed value never rebuilds the geometry.
 */
export function DimensionsDialog({ onClose }: { onClose: () => void }) {
  const dims = useProject((s) => s.dims)
  const setDims = useProject((s) => s.setDims)
  const { unit, fmt } = useUnits()

  const [draft, setDraft] = useState<Dimensions>(dims)
  const warnings = useMemo(
    () => validateDimensions(draft, (mm) => formatLength(mm, unit)),
    [draft, unit],
  )
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(dims), [draft, dims])
  const isDefault = useMemo(
    () => JSON.stringify(draft) === JSON.stringify(DEFAULT_DIMENSIONS),
    [draft],
  )

  const setValue = (group: keyof Dimensions, field: string, value: number) =>
    setDraft((d) => ({ ...d, [group]: { ...d[group], [field]: value } }))

  const save = () => {
    setDims(draft)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dimensions"
        className="flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <h2 className="text-[13px] font-semibold">Dimensions</h2>
          <button className="tm-btn px-1.5 py-1" onClick={onClose} title="Close without saving">
            <X size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="tm-section">
            <p className="text-[11.5px]" style={{ color: 'var(--color-ink-2)' }}>
              The measurements every part is built from, in {unitNoun(unit)} — the shape of the track's
              cross-section, the clip that joins two pieces, and how tightly the two fit together.
              They apply to the whole build, not the selected piece, so changing one rebuilds every
              piece on the workplane when you save.
            </p>
            {warnings.map((w) => (
              <div
                key={w.field}
                className="mt-2 flex gap-1.5 rounded border p-2 text-[11px]"
                style={{
                  borderColor: '#d97706',
                  background: 'color-mix(in srgb, #d97706 12%, transparent)',
                }}
              >
                <AlertTriangle size={13} className="mt-[1px] shrink-0" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>

          <Section title="Track profile">
            <div className="grid grid-cols-2 gap-x-3">
              {TRACK_FIELDS.map((f) => (
                <DimensionField
                  key={f.key}
                  field={f}
                  value={(draft.track as unknown as Record<string, number>)[f.key]}
                  onChange={(v) => setValue('track', f.key, v)}
                />
              ))}
            </div>
            <p className="text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
              Lane pitch {fmt(laneWidth(draft.track), 3)} · channel floor at{' '}
              {fmt(floorTopY(draft.track), 3)} · straight wall{' '}
              {fmt(wallStraightHeight(draft.track), 3)}
            </p>
          </Section>

          <Section title="Connector clip">
            <div className="grid grid-cols-2 gap-x-3">
              {CONNECTOR_FIELDS.map((f) => (
                <DimensionField
                  key={f.key}
                  field={f}
                  value={(draft.connector as unknown as Record<string, number>)[f.key]}
                  onChange={(v) => setValue('connector', f.key, v)}
                />
              ))}
            </div>
          </Section>

          <Section title="Assembly">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Connector inset" hint="How far the clip reaches into each piece.">
                <LengthInput
                  value={draft.assembly.connectorInset}
                  step={1}
                  min={5}
                  onChange={(v) => setValue('assembly', 'connectorInset', v)}
                />
              </Field>
              <Field label="Fit clearance" hint="Slop between clip and slot so prints assemble.">
                <LengthInput
                  value={draft.assembly.fitClearance}
                  step={0.05}
                  min={0}
                  max={1}
                  onChange={(v) => setValue('assembly', 'fitClearance', v)}
                />
              </Field>
              <Field label="Default straight length">
                <LengthInput
                  value={draft.assembly.defaultStraightLength}
                  step={5}
                  min={20}
                  onChange={(v) => setValue('assembly', 'defaultStraightLength', v)}
                />
              </Field>
              <Field
                label="Transition flat ends"
                hint="Full-width run each end of a new transition keeps. Shorter tapers more slowly."
              >
                <LengthInput
                  value={draft.assembly.transitionFlatEnd}
                  step={1}
                  min={0}
                  onChange={(v) => setValue('assembly', 'transitionFlatEnd', v)}
                />
              </Field>
              <Field
                label="Transition corner rounding"
                hint="What a new transition rounds its two taper corners to. 0 leaves them square."
              >
                <LengthInput
                  value={draft.assembly.transitionCornerRadius}
                  step={1}
                  min={0}
                  onChange={(v) => setValue('assembly', 'transitionCornerRadius', v)}
                />
              </Field>
            </div>
          </Section>
        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-3"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <button
            className="tm-btn"
            onClick={() => setDraft(DEFAULT_DIMENSIONS)}
            disabled={isDefault}
            title="Put every field back to its original value"
          >
            <RotateCcw size={13} />
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button className="tm-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="tm-btn tm-btn-primary" onClick={save} disabled={!dirty}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** One row of the track or connector grid. Angles and counts keep their own units. */
function DimensionField({
  field,
  value,
  onChange,
}: {
  field: DimField
  value: number
  onChange: (v: number) => void
}) {
  return (
    <Field label={field.label}>
      {field.kind ? (
        <NumberInput
          value={value}
          step={field.step ?? 0.1}
          min={0}
          suffix={field.kind === 'angle' ? '°' : ''}
          onChange={onChange}
        />
      ) : (
        <LengthInput value={value} step={field.step ?? 0.1} min={0} onChange={onChange} />
      )}
    </Field>
  )
}
