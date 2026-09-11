import { useEffect, useState } from 'react'
import { useProject } from '../store/useProject'
import { bindDriveKeys, driveInput, kph, mph, TOP_SPEED_RANGE } from '../lib/driving'
import { NumberInput } from './controls'
import { carPose } from '../scene/carPose'

/**
 * The readout across the bottom of the workplane while the simulator has the
 * car: which keys are down, how fast it is going, and the way back out.
 *
 * Every number on it is about the car on the track and nothing else: the
 * millimetres a second it is covering, said as kilometres and miles an hour, and
 * the top speed it is allowed in exactly those same three units. They are small
 * numbers, because a die-cast car flat out is doing well under a walking pace,
 * but they are true of the thing on screen and they agree with each other.
 *
 * It also owns the driving keys — they are listened for exactly as long as this
 * is on screen, so nothing is left holding the throttle open after the simulator
 * is switched off.
 *
 * The car's speed is written by the scene every frame, and read from here a few
 * times a second. Sixty React renders a second to move a number two digits is
 * work nobody sees.
 */

/** How often the readout catches up with the car, ms. */
const TICK = 90

export function DriveHud() {
  const toggleSimulator = useProject((s) => s.toggleSimulator)
  const dropCar = useProject((s) => s.dropCar)
  const [read, setRead] = useState({ speed: 0 })
  const [keys, setKeys] = useState({ up: false, down: false, left: false, right: false, hand: false })

  useEffect(() => bindDriveKeys(), [])

  // Typing in the top speed box holds the keyboard, and the driving keys stand
  // aside for it — so a click back onto the track has to hand them back, or the
  // car would sit there ignoring the throttle with no sign of why.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof HTMLCanvasElement && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  useEffect(() => {
    const tick = () => {
      setRead({ speed: carPose.valid ? carPose.speed : 0 })
      setKeys({
        up: driveInput.throttle > 0,
        down: driveInput.brake > 0,
        left: driveInput.steer < 0,
        right: driveInput.steer > 0,
        hand: driveInput.handbrake,
      })
    }
    tick()
    const timer = window.setInterval(tick, TICK)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
      <div
        className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2
          rounded-lg border px-3 py-2 shadow-sm"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
      >
        <Keys {...keys} />

        {/* What the model itself is doing — the speed of the object on screen. */}
        <div className="flex flex-col gap-0.5" style={{ minWidth: 150 }}>
          <div className="flex items-baseline gap-3">
            <Reading value={kph(read.speed)} unit="km/h" />
            <Reading value={mph(read.speed)} unit="mph" />
          </div>
          <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--color-ink-2)' }}>
            {read.speed < -0.5 ? 'reverse · ' : ''}
            {Math.abs(read.speed).toFixed(0)} mm/s
          </span>
        </div>

        <TopSpeed />

        <div className="flex items-center gap-1">
          <button className="tm-btn h-[26px] px-2 text-[11px]" onClick={dropCar}>
            R Restart
          </button>
          <button className="tm-btn h-[26px] px-2 text-[11px]" onClick={toggleSimulator}>
            Esc Leave
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * How fast the car is allowed to go, in the same millimetres a second the
 * readout beside it counts up in — so the number set here is the number the
 * readout reaches, and the kilometres and miles an hour under it are the ones
 * that appear over there.
 */
function TopSpeed() {
  const topSpeed = useProject((s) => s.topSpeed)
  const setTopSpeed = useProject((s) => s.setTopSpeed)
  const { min, max, step } = TOP_SPEED_RANGE

  // Snap to the nearest step on the way, so a typed 137 goes to 150 rather than
  // carrying the odd number up and down for ever.
  const nudge = (by: number) => setTopSpeed(Math.round(topSpeed / step) * step + by)

  return (
    <div className="flex flex-col gap-0.5" style={{ minWidth: 162 }}>
      <span className="tm-label">Top speed</span>
      <div className="flex items-center gap-1">
        <Step label="−" onClick={() => nudge(-step)} disabled={topSpeed <= min} />
        <div style={{ width: 90 }}>
          <NumberInput
            value={topSpeed}
            onChange={setTopSpeed}
            step={step}
            min={min}
            max={max}
            digits={0}
            suffix="mm/s"
          />
        </div>
        <Step label="+" onClick={() => nudge(step)} disabled={topSpeed >= max} />
      </div>
      <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--color-ink-2)' }}>
        {figures(kph(topSpeed))} km/h · {figures(mph(topSpeed))} mph
      </span>
    </div>
  )
}

function Step({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      className="tm-btn grid h-[26px] w-[22px] place-items-center p-0 text-[13px]"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === '+' ? 'Faster' : 'Slower'}
    >
      {label}
    </button>
  )
}

/**
 * Enough figures to see the number move. A die-cast car tops out under one
 * kilometre an hour, so a whole number would read zero right up to flat out.
 */
const figures = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(2))

/** One speed and the unit it is in. Fixed width, so the bar does not shuffle. */
function Reading({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        className="text-right text-[19px] leading-none font-semibold tabular-nums"
        style={{ color: 'var(--color-ink)', minWidth: 44 }}
      >
        {figures(value)}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
        {unit}
      </span>
    </div>
  )
}

/** The four keys, lit as they are held. WASD is drawn; the arrows do the same. */
function Keys({
  up,
  down,
  left,
  right,
  hand,
}: {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  hand: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-0.5" aria-hidden>
      <Key label="W" lit={up} />
      <div className="flex gap-0.5">
        <Key label="A" lit={left} />
        <Key label="S" lit={down} />
        <Key label="D" lit={right} />
      </div>
      <div
        className="mt-0.5 h-1 w-full rounded-full transition-colors"
        style={{ background: hand ? 'var(--color-accent)' : 'var(--color-line)' }}
      />
    </div>
  )
}

function Key({ label, lit }: { label: string; lit: boolean }) {
  return (
    <span
      className="grid h-[19px] w-[19px] place-items-center rounded border text-[10px] font-medium transition-colors"
      style={{
        background: lit ? 'var(--color-accent)' : 'var(--color-surface-2)',
        borderColor: lit ? 'var(--color-accent)' : 'var(--color-line)',
        color: lit ? '#fff' : 'var(--color-ink-2)',
      }}
    >
      {label}
    </span>
  )
}
