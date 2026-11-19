import { useProject } from '../store/useProject'
import { Field, NumberInput, Segmented } from './controls'
import { LengthInput, useUnits } from './units'
import {
  balancedSpeed,
  bankedLayout,
  MAX_BANK_ANGLE,
  MIN_BANK_ANGLE,
  minBankedRadius,
  type BankedSpec,
} from '../geometry/banked'
import { trackProfile } from '../geometry/trackProfile'

const LEAN_COLOUR = '#2f7fd1'
const ANGLE_COLOUR = '#d97706'
const BANK_ANGLES = [15, 30, 45, 60]
const SWEEPS = [30, 45, 90, 180]
const MAX_RADIUS = 1200

/**
 * A section seen end-on, to scale, leaning by `lean` degrees about its low
 * edge's foot: the ordinary section, turned. Optionally the fill under it, and
 * the angle marked against the floor. Inside of the turn — or the side it
 * leans towards — on the left.
 */
export function LeanSection({ lanes, lean, base }: { lanes: number; lean: number; base: boolean }) {
  const dims = useProject((s) => s.dims)
  const profile = trackProfile(dims, lanes, false)
  const halfW = Math.max(...profile.map((p) => p.x))
  const a = (lean * Math.PI) / 180
  // Profile +x on the left of the drawing; turn about the left foot, so the
  // right side lifts.
  const turn = (p: { x: number; y: number }) => {
    const x = halfW - p.x
    return { x: x * Math.cos(a) - p.y * Math.sin(a), y: x * Math.sin(a) + p.y * Math.cos(a) }
  }
  const pts = profile.map(turn)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const [x0, x1] = [Math.min(...xs, 0), Math.max(...xs)]
  const top = Math.max(...ys)
  const W = 270
  const H = 104
  const scale = Math.min((W - 40) / (x1 - x0), (H - 20) / top)
  const left = (W - (x1 - x0) * scale) / 2
  const sx = (x: number) => left + (x - x0) * scale
  const sy = (y: number) => H - 10 - y * scale
  const path = (ps: { x: number; y: number }[]) =>
    ps.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join('')
  const far = turn({ x: -halfW, y: 0 })
  const r = 26
  return (
    <div
      className="mb-3 rounded border"
      style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-line)' }}
    >
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} aria-label="The track seen end-on, leaning" role="img">
        <path d={`M${sx(x0 - 10)} ${sy(0)}H${sx(x1 + 10)}`} stroke="var(--color-ink-2)" strokeWidth={0.75} opacity={0.6} />
        {base && (
          <path
            d={`M${sx(0)} ${sy(0)}L${sx(far.x)} ${sy(far.y)}L${sx(far.x)} ${sy(0)}Z`}
            fill={LEAN_COLOUR}
            opacity={0.25}
          />
        )}
        <path d={`${path(pts)}Z`} fill={LEAN_COLOUR} opacity={0.75} />
        {lean > 0.05 && (
          <>
            <path
              d={`M${sx(0) + r} ${sy(0)}A${r} ${r} 0 0 0 ${(sx(0) + r * Math.cos(a)).toFixed(1)} ${(sy(0) - r * Math.sin(a)).toFixed(1)}`}
              stroke={ANGLE_COLOUR}
              strokeWidth={1.5}
              fill="none"
            />
            <text x={sx(0) + r + 4} y={sy(0) - 4} fontSize={10} fill={ANGLE_COLOUR} fontWeight={700}>
              {Math.round(lean)}°
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

/** The banked curve's settings: how far it leans, its base, then the turn. */
export function BankedFields({
  spec,
  onChange,
}: {
  spec: BankedSpec
  onChange: (patch: Partial<BankedSpec>) => void
}) {
  const dims = useProject((s) => s.dims)
  const gravity = useProject((s) => s.gravity)
  const { fmt } = useUnits()
  const l = bankedLayout(dims, spec)
  const minRadius = minBankedRadius(dims, spec)
  const turn = spec.angleDeg < 0 ? 'right' : 'left'
  const sweep = Math.abs(spec.angleDeg)

  return (
    <>
      <LeanSection lanes={spec.lanes} lean={(l.bank * 180) / Math.PI} base={spec.bankBase} />
      <Field
        label="Bank angle"
        hint={`Leans in towards the inside of the turn, the same all the way round, so a Roll at this angle — or a straight — clips on at either end. A car holds its line with no grip at ${Math.round(balancedSpeed(l, gravity))} mm/s in the rolling preview: v = √(r·g·tan θ).`}
      >
        <div className="mb-1.5 grid grid-cols-4 gap-1">
          {BANK_ANGLES.map((a) => (
            <button
              key={a}
              className="tm-btn px-0"
              style={Math.abs(spec.bankAngle - a) < 0.05 ? { borderColor: 'var(--color-accent)' } : undefined}
              onClick={() => onChange({ bankAngle: a })}
            >
              {a}°
            </button>
          ))}
        </div>
        <NumberInput
          value={spec.bankAngle}
          onChange={(v) => onChange({ bankAngle: Math.min(MAX_BANK_ANGLE, Math.max(MIN_BANK_ANGLE, v)) })}
          step={5}
          min={MIN_BANK_ANGLE}
          max={MAX_BANK_ANGLE}
          suffix="°"
        />
      </Field>
      <Field
        label="Solid base"
        hint={
          spec.bankBase
            ? 'Filled down to the floor under the leaning road, so it prints flat and holds itself up.'
            : 'The road only, leaning — it needs holding up, and supports under it when printed.'
        }
      >
        <Segmented<'on' | 'off'>
          value={spec.bankBase ? 'on' : 'off'}
          onChange={(v) => onChange({ bankBase: v === 'on' })}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Field>
      <Field label="Radius" hint={`To the middle of the track. Tightest ${fmt(minRadius, 0)}.`}>
        <LengthInput
          value={Math.max(spec.radius, minRadius)}
          onChange={(radius) => onChange({ radius })}
          step={10}
          min={minRadius}
          max={MAX_RADIUS}
        />
      </Field>
      <Field label="Sweep">
        <div className="mb-1.5 grid grid-cols-4 gap-1">
          {SWEEPS.map((a) => (
            <button
              key={a}
              className="tm-btn px-0"
              style={Math.abs(sweep - a) < 0.05 ? { borderColor: 'var(--color-accent)' } : undefined}
              onClick={() => onChange({ angleDeg: (turn === 'left' ? 1 : -1) * a })}
            >
              {a}°
            </button>
          ))}
        </div>
        <NumberInput
          value={sweep}
          onChange={(v) => onChange({ angleDeg: (turn === 'left' ? 1 : -1) * Math.min(180, Math.max(1, v)) })}
          step={5}
          min={1}
          max={180}
          suffix="°"
        />
      </Field>
      <Field label="Direction" hint="It always leans in towards the inside of the turn.">
        <Segmented<'left' | 'right'>
          value={turn}
          onChange={(v) => onChange({ angleDeg: (v === 'left' ? 1 : -1) * sweep })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Field>
    </>
  )
}
