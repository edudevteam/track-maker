import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useProject } from '../store/useProject'
import { Field, NumberInput, Segmented } from './controls'
import { LengthInput, useUnits } from './units'
import { laneWidth } from '../geometry/dimensions'
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
  const [length, setLength] = useState(dims.assembly.defaultStraightLength)
  const [radius, setRadius] = useState(120)
  const [angleDeg, setAngleDeg] = useState(45)
  const [turn, setTurn] = useState<Turn>('left')

  const spec: PartSpec =
    kind === 'straight'
      ? { kind, lanes, length, radius, angleDeg, name: `Straight ${fmt(length, 0)}` }
      : {
          kind,
          lanes,
          length,
          radius,
          angleDeg: turn === 'left' ? angleDeg : -angleDeg,
          name: `Curve ${angleDeg}°`,
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
            <Preview kind={kind} lanes={lanes} angleDeg={angleDeg} turn={turn} />

            <Field label="Width · lanes" hint={`${fmt(laneWidth(dims.track) * lanes)} across${lanes > 1 ? ' · inner walls removed' : ''}`}>
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

            {kind === 'straight' ? (
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

/** The small glyph beside a part in the list. */
function PartIcon({ kind }: { kind: PieceKind }) {
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" className="shrink-0" aria-hidden>
      {kind === 'straight' ? (
        <path d="M3 13h20" stroke="var(--color-track)" strokeWidth={7} strokeLinecap="round" fill="none" />
      ) : (
        <path
          d="M4 22a18 18 0 0 1 18-18"
          stroke="var(--color-track)"
          strokeWidth={7}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  )
}

/** A top-down sketch of the part as configured — width in lanes, sweep and direction. */
function Preview({
  kind,
  lanes,
  angleDeg,
  turn,
}: {
  kind: PieceKind
  lanes: number
  angleDeg: number
  turn: Turn
}) {
  // A lane is 11px on screen, clamped so an 8-wide piece still fits the box.
  const band = Math.min(46, 6 + lanes * 11)

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
