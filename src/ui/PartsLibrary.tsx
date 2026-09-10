import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { transitionName, useProject } from '../store/useProject'
import { Field, NumberInput, Segmented } from './controls'
import { LengthInput, useUnits } from './units'
import { laneWidth } from '../geometry/dimensions'
import {
  defaultTransitionLength,
  maxFlatEnd,
  minFlatEnd,
  minTransitionLength,
  transitionCornerLimit,
} from '../geometry/transition'
import type { PartSpec, PieceKind } from '../types'

/** Lanes are free-typed, so they need sane bounds. Widths are whole lanes. */
export const MAX_LANES = 8
/** A straight still has to hold a connector pocket at each end. Millimetres. */
const MIN_STRAIGHT_LENGTH = 20
const MAX_STRAIGHT_LENGTH = 1000
/** The common straight lengths, offered here and in Part Details. Millimetres. */
export const LENGTH_PRESETS = [50, 100, 150, 200]
const CURVE_ANGLES = [15, 30, 45, 90]

type Turn = 'left' | 'right'

const CATALOGUE: { kind: PieceKind; name: string; blurb: string }[] = [
  { kind: 'straight', name: 'Straight', blurb: 'A flat run of any length.' },
  { kind: 'curve', name: 'Curve', blurb: 'A turn on a fixed radius.' },
  { kind: 'transition', name: 'Transition', blurb: 'Opens one width into the next.' },
]

/**
 * The pop-up parts library. Pick a part, set its width — and its length or
 * sweep — then drop it on the workplane. Everything else about the piece is
 * edited afterwards in the floating Part Details box.
 */
export function PartsLibrary({ onClose }: { onClose: () => void }) {
  const addPiece = useProject((s) => s.addPiece)
  const dims = useProject((s) => s.dims)
  const snapToPort = useProject((s) => s.snapToPort)
  const activePort = useProject((s) => s.activePort)
  const pieces = useProject((s) => s.pieces)
  const { fmt, val } = useUnits()

  const [kind, setKind] = useState<PieceKind>('straight')
  const [lanes, setLanes] = useState(1)
  const [lanesB, setLanesB] = useState(2)
  const [length, setLength] = useState(dims.assembly.defaultStraightLength)
  const [radius, setRadius] = useState(120)
  const [angleDeg, setAngleDeg] = useState(45)
  const [turn, setTurn] = useState<Turn>('left')
  // A transition sizes itself to the step it has to make, until it is typed over.
  const [taperLength, setTaperLength] = useState<number | null>(null)
  const [cornerRadius, setCornerRadius] = useState<number | null>(null)
  const [flatEnd, setFlatEnd] = useState<number | null>(null)
  const autoTaper = defaultTransitionLength(dims, lanes, lanesB)
  const taperLen = taperLength ?? autoTaper
  const flat = Math.min(
    Math.max(flatEnd ?? dims.assembly.transitionFlatEnd, minFlatEnd(dims)),
    maxFlatEnd(taperLen),
  )
  const taper = { lanesA: lanes, lanesB, length: taperLen, flatEnd: flat }
  const cornerLimit = transitionCornerLimit(dims, taper)
  // Starts at whatever Dimensions says a new transition should round to.
  const corner = Math.min(Math.max(cornerRadius ?? dims.assembly.transitionCornerRadius, 0), cornerLimit)

  const spec: PartSpec =
    kind === 'curve'
      ? {
          kind,
          lanes,
          lanesB,
          length,
          cornerRadius: corner,
          flatEnd: flat,
          radius,
          angleDeg: turn === 'left' ? angleDeg : -angleDeg,
          name: `Curve ${angleDeg}°`,
        }
      : kind === 'transition'
        ? {
            kind,
            lanes,
            lanesB,
            length: taperLen,
            cornerRadius: corner,
            flatEnd: flat,
            radius,
            angleDeg,
            name: transitionName(lanes, lanesB),
          }
        : {
            kind,
            lanes,
            lanesB,
            length,
            cornerRadius: corner,
            flatEnd: flat,
            radius,
            angleDeg,
            name: `Straight ${fmt(length, 0)}`,
          }

  const add = () => {
    addPiece({ ...spec })
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') add()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const host = activePort && pieces.find((p) => p.id === activePort.pieceId)
  const willJoin = snapToPort && !!host && !host.links[activePort!.port]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[620px] overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <h2 className="text-[13px] font-semibold">Parts library</h2>
          <button className="tm-btn px-1.5 py-1" onClick={onClose} aria-label="Close">
            <X size={13} />
          </button>
        </div>

        <div className="flex min-h-[286px]">
          <div className="w-[186px] shrink-0 border-r p-2" style={{ borderColor: 'var(--color-line)' }}>
            <span className="tm-label mb-1.5 block px-1">Parts</span>
            <div className="space-y-1">
              {CATALOGUE.map((part) => {
                const active = kind === part.kind
                return (
                  <button
                    key={part.kind}
                    onClick={() => setKind(part.kind)}
                    aria-pressed={active}
                    className="flex w-full items-center gap-2 rounded border p-1.5 text-left transition"
                    style={{
                      background: active
                        ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
                        : 'var(--color-surface-2)',
                      borderColor: active ? 'var(--color-accent)' : 'var(--color-line)',
                    }}
                  >
                    <PartIcon kind={part.kind} />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium">{part.name}</span>
                      <span className="block text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
                        {part.blurb}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-w-0 flex-1 p-3">
            <Preview
              kind={kind}
              lanes={lanes}
              lanesB={lanesB}
              rounding={cornerLimit > 0 ? corner / cornerLimit : 0}
              taperSpan={Math.max(0, taperLen - 2 * flat) / Math.max(1, taperLen)}
              angleDeg={angleDeg}
              turn={turn}
            />

            {kind === 'transition' ? (
              <div className="grid grid-cols-2 gap-2">
                <LaneField label="Width at A" lanes={lanes} onChange={setLanes} />
                <LaneField label="Width at B" lanes={lanesB} onChange={setLanesB} />
              </div>
            ) : (
              <Field
                label="Width · lanes"
                hint={`${fmt(laneWidth(dims.track) * lanes)} across${lanes > 1 ? ' · inner walls removed' : ''}`}
              >
                <div className="mb-1.5 grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      className="tm-btn px-0"
                      style={lanes === n ? { borderColor: 'var(--color-accent)' } : undefined}
                      onClick={() => setLanes(n)}
                    >
                      {n === 1 ? 'Single' : `${n}×`}
                    </button>
                  ))}
                </div>
                <NumberInput
                  value={lanes}
                  onChange={(v) => setLanes(Math.max(1, Math.round(v)))}
                  step={1}
                  min={1}
                  max={MAX_LANES}
                  digits={0}
                  clampWhileTyping
                  suffix="×"
                />
              </Field>
            )}

            {kind === 'transition' ? (
              <>
                <Field
                  label="Length"
                  hint={
                    lanes === lanesB
                      ? 'Both ends are the same width — pick different ones to get a taper.'
                      : `${fmt(laneWidth(dims.track) * lanes)} opening to ${fmt(laneWidth(dims.track) * lanesB)}.`
                  }
                >
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      className="tm-btn px-0"
                      style={taperLength === null ? { borderColor: 'var(--color-accent)' } : undefined}
                      onClick={() => setTaperLength(null)}
                    >
                      Fit · {val(autoTaper, 0)}
                    </button>
                    <LengthInput
                      value={taperLen}
                      onChange={setTaperLength}
                      step={5}
                      min={minTransitionLength(dims)}
                      max={MAX_STRAIGHT_LENGTH}
                    />
                  </div>
                </Field>
                <TaperField length={taperLen} value={flat} onChange={setFlatEnd} />
                <CornerRoundingField value={corner} limit={cornerLimit} onChange={setCornerRadius} />
              </>
            ) : kind === 'straight' ? (
              <Field label="Length">
                <div className="mb-1.5 grid grid-cols-4 gap-1">
                  {LENGTH_PRESETS.map((l) => (
                    <button
                      key={l}
                      className="tm-btn px-0"
                      style={length === l ? { borderColor: 'var(--color-accent)' } : undefined}
                      onClick={() => setLength(l)}
                    >
                      {val(l, 0)}
                    </button>
                  ))}
                </div>
                <LengthInput
                  value={length}
                  onChange={setLength}
                  step={5}
                  min={MIN_STRAIGHT_LENGTH}
                  max={MAX_STRAIGHT_LENGTH}
                />
              </Field>
            ) : (
              <>
                <Field label={`Radius · ${fmt(radius, 0)}`}>
                  <input
                    type="range"
                    min={60}
                    max={400}
                    step={5}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full accent-[var(--color-accent)]"
                  />
                </Field>
                <Field label="Sweep">
                  <div className="mb-1.5 grid grid-cols-4 gap-1">
                    {CURVE_ANGLES.map((a) => (
                      <button
                        key={a}
                        className="tm-btn px-0"
                        style={angleDeg === a ? { borderColor: 'var(--color-accent)' } : undefined}
                        onClick={() => setAngleDeg(a)}
                      >
                        {a}°
                      </button>
                    ))}
                  </div>
                  <NumberInput
                    value={angleDeg}
                    onChange={(v) => setAngleDeg(Math.min(180, Math.max(1, v)))}
                    step={5}
                    min={1}
                    max={180}
                    suffix="°"
                  />
                </Field>
                <Field label="Direction">
                  <Segmented<Turn>
                    value={turn}
                    onChange={setTurn}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'right', label: 'Right' },
                    ]}
                  />
                </Field>
              </>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-2 border-t px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
            {willJoin ? 'Joins onto the highlighted end.' : 'Lands loose on the workplane.'}
          </span>
          <button className="tm-btn tm-btn-primary" onClick={add}>
            <Plus size={13} /> Add {spec.name}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * How much of each end of a transition stays full width. The shorter the ends,
 * the more of the piece the taper gets, and the more slowly it opens. It cannot
 * go below half a clip — the clip would run out of slot to sit in.
 */
export function TaperField({
  length,
  value,
  onChange,
}: {
  length: number
  value: number
  onChange: (mm: number) => void
}) {
  const dims = useProject((s) => s.dims)
  const { fmt } = useUnits()

  const min = minFlatEnd(dims)
  const max = maxFlatEnd(length)
  const shown = Math.min(Math.max(value, min), max)
  const run = Math.max(0, length - 2 * shown)

  return (
    <Field
      label="Flat ends"
      hint={`${fmt(run)} of taper — ${Math.round((run / Math.max(1, length)) * 100)}% of the piece.`}
    >
      <div className="mb-1.5 grid grid-cols-3 gap-1">
        {(
          [
            ['Slowest', min],
            ['Standard', dims.assembly.connectorInset],
            ['Short', max],
          ] as const
        ).map(([label, mm]) => {
          const target = Math.min(Math.max(mm, min), max)
          return (
            <button
              key={label}
              className="tm-btn px-0"
              style={Math.abs(shown - target) < 0.05 ? { borderColor: 'var(--color-accent)' } : undefined}
              onClick={() => onChange(target)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <LengthInput value={shown} onChange={onChange} step={1} min={min} max={max} />
    </Field>
  )
}

/**
 * How hard the transition's two taper corners are rounded off. Square at 0,
 * and at the limit the two fillets meet and the taper is one smooth S — past
 * that they would have to overlap, so the limit is what the field allows.
 */
export function CornerRoundingField({
  value,
  limit,
  onChange,
}: {
  value: number
  limit: number
  onChange: (mm: number) => void
}) {
  const { fmt } = useUnits()

  if (limit <= 0) {
    return (
      <Field label="Corner rounding" hint="Both ends are the same width, so there are no corners.">
        <p className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
          Nothing to round.
        </p>
      </Field>
    )
  }

  const shown = Math.min(Math.max(value, 0), limit)
  return (
    <Field label="Corner rounding" hint={`Square at 0, one smooth S at ${fmt(limit, 1)}.`}>
      <div className="mb-1.5 grid grid-cols-3 gap-1">
        {(
          [
            ['Square', 0],
            ['Soft', limit / 2],
            ['Full', limit],
          ] as const
        ).map(([label, r]) => (
          <button
            key={label}
            className="tm-btn px-0"
            style={Math.abs(shown - r) < 0.05 ? { borderColor: 'var(--color-accent)' } : undefined}
            onClick={() => onChange(r)}
          >
            {label}
          </button>
        ))}
      </div>
      <LengthInput value={shown} onChange={onChange} step={1} min={0} max={limit} />
    </Field>
  )
}

/** One end's width, for the transition's pair of pickers. */
function LaneField({
  label,
  lanes,
  onChange,
}: {
  label: string
  lanes: number
  onChange: (n: number) => void
}) {
  const { fmt } = useUnits()
  const dims = useProject((s) => s.dims)
  return (
    <Field label={label} hint={`${fmt(laneWidth(dims.track) * lanes)} across`}>
      <NumberInput
        value={lanes}
        onChange={(v) => onChange(Math.max(1, Math.round(v)))}
        step={1}
        min={1}
        max={MAX_LANES}
        digits={0}
        clampWhileTyping
        suffix="×"
      />
    </Field>
  )
}

/** The small glyph beside a part in the list. */
export function PartIcon({ kind }: { kind: PieceKind }) {
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" className="shrink-0" aria-hidden>
      {kind === 'straight' && (
        <path d="M3 13h20" stroke="var(--color-track)" strokeWidth={7} strokeLinecap="round" fill="none" />
      )}
      {kind === 'curve' && (
        <path
          d="M4 22a18 18 0 0 1 18-18"
          stroke="var(--color-track)"
          strokeWidth={7}
          strokeLinecap="round"
          fill="none"
        />
      )}
      {kind === 'transition' && (
        <path d="M3 10.5h8l4-5h8v15h-8l-4-5H3z" fill="var(--color-track)" />
      )}
    </svg>
  )
}

/** A top-down sketch of the part as configured — width in lanes, sweep and direction. */
function Preview({
  kind,
  lanes,
  lanesB,
  rounding,
  taperSpan,
  angleDeg,
  turn,
}: {
  kind: PieceKind
  lanes: number
  lanesB: number
  /** Corner rounding as a fraction of what the taper has room for. */
  rounding: number
  /** How much of the length the taper covers, 0 to 1. */
  taperSpan: number
  angleDeg: number
  turn: Turn
}) {
  // A lane is 11px on screen, clamped so an 8-wide piece still fits the box.
  const bandFor = (n: number) => Math.min(46, 6 + n * 11)
  const band = bandFor(lanes)

  if (kind === 'transition') {
    const a = band / 2
    const b = bandFor(lanesB) / 2
    // Narrow run, taper, wide run — the part seen from above. The taper is drawn
    // as a cubic whose handles pull flat as the corners are rounded off, which
    // reads the same way the filleted wall does.
    // 25 to 165 across the box is the whole part; the taper takes its share of
    // that, centred, so a slower taper reads as one on the sketch too.
    const span = 140 * Math.min(Math.max(taperSpan, 0), 1)
    const t0 = 95 - span / 2
    const t1 = 95 + span / 2
    const pull = (span / 2) * Math.min(Math.max(rounding, 0), 1)
    const wall = (from: number, to: number, ya: number, yb: number) => {
      const dir = Math.sign(to - from) || 1
      return pull < 0.5
        ? `L${to} ${yb}`
        : `C${from + dir * pull} ${ya},${to - dir * pull} ${yb},${to} ${yb}`
    }
    const outline =
      `M25 ${46 - a}H${t0}${wall(t0, t1, 46 - a, 46 - b)}H165V${46 + b}H${t1}` +
      `${wall(t1, t0, 46 + b, 46 + a)}H25Z`
    return (
      <div
        className="mb-3 grid h-[104px] place-items-center rounded border"
        style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-line)' }}
      >
        <svg width={190} height={92} viewBox="0 0 190 92" aria-hidden>
          <path d={outline} fill="var(--color-track)" />
          <path
            d={`M${t0} ${46 - a}V${46 + a}M${t1} ${46 - b}V${46 + b}`}
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            opacity={0.65}
            fill="none"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      className="mb-3 grid h-[104px] place-items-center rounded border"
      style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-line)' }}
    >
      <svg width={190} height={92} viewBox="0 0 190 92" aria-hidden>
        {kind === 'straight' ? (
          <>
            <path d="M25 46h140" stroke="var(--color-track)" strokeWidth={band} fill="none" />
            {laneLines(lanes).map((t) => (
              <path
                key={t}
                d={`M25 ${46 + (t - 0.5) * band}h140`}
                stroke="var(--color-surface)"
                strokeWidth={1.5}
                opacity={0.65}
                fill="none"
              />
            ))}
          </>
        ) : (
          <path d={arcPath(angleDeg, turn)} stroke="var(--color-track)" strokeWidth={band} fill="none" />
        )}
      </svg>
    </div>
  )
}

/** Fractions across the band where the removed inner walls used to sit. */
function laneLines(lanes: number): number[] {
  return Array.from({ length: Math.max(0, lanes - 1) }, (_, i) => (i + 1) / lanes)
}

/**
 * An arc of `angleDeg` starting at the bottom of the box and turning left or
 * right, in SVG's y-down coordinates.
 */
function arcPath(angleDeg: number, turn: Turn): string {
  const cx = 95
  const cy = 22
  const r = 46
  const dir = turn === 'left' ? -1 : 1
  const a = (Math.min(180, Math.max(1, angleDeg)) * Math.PI) / 180
  const x0 = cx
  const y0 = cy + r
  const x1 = cx + dir * r * Math.sin(a)
  const y1 = cy + r * Math.cos(a)
  // Sweeping right climbs anticlockwise on screen; sweeping left climbs clockwise.
  const sweep = dir === 1 ? 0 : 1
  return `M${x0} ${y0}A${r} ${r} 0 0 ${sweep} ${x1} ${y1}`
}
