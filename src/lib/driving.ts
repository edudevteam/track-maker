import { laneWidth, type Dimensions } from '../geometry/dimensions'
import { transitionHalfWidthAt } from '../geometry/transition'
import { wallMetrics } from '../geometry/trackProfile'
import type { Piece, PortId, VehicleSize } from '../types'

/**
 * Driving the car rather than watching it roll.
 *
 * The car still rides the connected centreline — arc length along the piece it is
 * on, handed off at the joints — so nothing here can tunnel through a wall or
 * drop out of a banked corner. What driving adds is a throttle and a steering
 * angle: the throttle drives the speed along that centreline, and the steering
 * slides the car across the channel between the walls.
 *
 * Every number is a real vehicle's, divided by the scale the car is drawn at.
 * That is what makes a 1:28 car and a 1:64 car handle the same: both do a scale
 * 60 km/h, the big one simply covers more millimetres doing it.
 */

/** What the keys are asking for. Read every frame; never a React value. */
export interface DriveInput {
  /** 0 – 1. */
  throttle: number
  /** 0 – 1. Brakes to a stop first, then reverses. */
  brake: number
  /** -1 hard left to +1 hard right. */
  steer: number
  handbrake: boolean
}

export const driveInput: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false }

/** The keys each control answers to. `code` is used, so the row is the row whatever the layout. */
export const DRIVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
} as const

const ALL_DRIVE_CODES = new Set<string>(Object.values(DRIVE_KEYS).flat())

/**
 * Listen for the driving keys until the returned function is called.
 *
 * Held keys are tracked rather than the last one pressed, so releasing the
 * throttle while still turning leaves the car turning, and the arrows and WASD
 * are the same control rather than two.
 */
export function bindDriveKeys(): () => void {
  const held = new Set<string>()

  const down = (codes: readonly string[]) => codes.some((c) => held.has(c))
  const sync = () => {
    driveInput.throttle = down(DRIVE_KEYS.forward) ? 1 : 0
    driveInput.brake = down(DRIVE_KEYS.back) ? 1 : 0
    driveInput.steer = (down(DRIVE_KEYS.right) ? 1 : 0) - (down(DRIVE_KEYS.left) ? 1 : 0)
    driveInput.handbrake = down(DRIVE_KEYS.handbrake)
  }

  const typing = (t: EventTarget | null) =>
    t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)

  const onDown = (e: KeyboardEvent) => {
    if (typing(e.target) || !ALL_DRIVE_CODES.has(e.code)) return
    // Arrows scroll the page and space presses whatever has focus, otherwise.
    e.preventDefault()
    held.add(e.code)
    sync()
  }
  const onUp = (e: KeyboardEvent) => {
    if (!held.delete(e.code)) return
    sync()
  }
  // A key released while the window is out of focus never reports an up event,
  // which would otherwise leave the throttle pinned open on the way back.
  const releaseAll = () => {
    held.clear()
    sync()
  }

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', releaseAll)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
    window.removeEventListener('blur', releaseAll)
    releaseAll()
  }
}

/**
 * How fast the car itself goes flat out, mm/s — the starting point for **Top
 * speed** in the driving bar, which is where it is changed.
 *
 * It is the car's own speed across the track, and nothing else: the number set
 * here is the number the readout climbs to. It used to be stated as the speed of
 * the real vehicle the model copies, which made for a tidy theory and an
 * unreadable bar — a car doing 174mm/s was labelled 40km/h, and neither figure
 * explained the other.
 */
export const DEFAULT_TOP_SPEED = 500

/** What the driving bar will wind Top speed between, mm/s, and by how much. */
export const TOP_SPEED_RANGE = { min: 25, max: 5000, step: 25 }

/**
 * Seconds the engine's full pull alone would take to reach top speed. Not the
 * time the car actually takes, which is longer and has no end: drag grows with
 * speed, so the car closes on top speed rather than arriving at it.
 *
 * Power is worked out from this, so a car asked for twice the top speed gets
 * twice the pull to reach it and still launches the same way.
 */
const LAUNCH = 3.5
/** Reverse tops out at this share of the forward speed. */
const REVERSE_SHARE = 0.3
/** Reverse gear, as a share of the engine's pull forwards. */
const REVERSE_POWER = 0.6
/** Braking, as a share of gravity. About what a road car pulls on a dry surface. */
const BRAKE_G = 0.85
/** The handbrake, as a share of gravity. Locked wheels, so short of the brakes. */
const HANDBRAKE_G = 0.5
/** Rolling resistance of a road tyre. Steeper than 1 in 66 and a parked car rolls. */
const ROLLING = 0.015
/** Full lock, measured from straight ahead. */
const MAX_STEER_DEG = 33
/** Seconds of held key to wind the rack from straight to whatever lock it has. */
const STEER_TIME = 0.45
/** And to let it back to straight, which a self-centring rack does rather quicker. */
const STEER_RETURN_TIME = 0.3
/** Full lock is a crawling-speed thing; it winds down to this share of it flat out. */
const STEER_AT_SPEED = 0.25
/** Below this share of top speed the body is drawn straighter than the wheels are turned. */
const YAW_SETTLES_AT = 0.06
/** Seconds the car takes to settle into the angle the wheels are asking of it. */
const YAW_LAG = 0.18

/** What the car can do at the size it is drawn. */
export interface Performance {
  /** Forward, mm/s. */
  topSpeed: number
  /** Backwards, mm/s. */
  reverseSpeed: number
  /** Engine acceleration, mm/s². */
  power: number
  /**
   * Drag, as the deceleration a speed of 1mm/s would cause — so the real thing is
   * that times the speed squared. Set so the engine and the drag come into
   * balance at exactly top speed, which is what stops a long descent turning the
   * car into a projectile: gravity has to out-pull a resistance that grows.
   */
  drag: number
  /** How many times bigger the real vehicle is than the model. */
  scale: number
  /**
   * Gravity as the car experiences it, mm/s².
   *
   * The one place the car's size still comes into the driving. A model is a
   * scale copy of a vehicle and a ramp is a scale copy of a hill, so the world
   * it is driving through is scaled too. Left at its real value a 1:64 car would
   * take a ramp at sixty-four times the acceleration the real vehicle does,
   * which is exactly what the rolling preview does and exactly why that preview
   * reads as a marble run rather than as driving.
   */
  gravity: number
}

/**
 * What the car can do: `flatOut` straight off the **Top speed** setting, with
 * the engine, the drag and the reverse gear worked back from it.
 *
 * The one thing size still decides is gravity. `real` is the vehicle the model
 * copies and `drawn` is the size it is on the track, and a model whose own units
 * could not be settled has no real size of its own, so the reference saloon
 * stands in — the same fallback the scale buttons use.
 */
export function performanceOf(
  real: VehicleSize,
  drawn: VehicleSize,
  gravity: number,
  flatOut = DEFAULT_TOP_SPEED,
): Performance {
  const scale = Math.max(1, real.length / Math.max(drawn.length, 1e-3))
  const topSpeed = Math.max(1, flatOut)
  const g = gravity / scale
  const power = topSpeed / LAUNCH
  return {
    topSpeed,
    reverseSpeed: topSpeed * REVERSE_SHARE,
    power,
    drag: Math.max(0, power - ROLLING * g) / (topSpeed * topSpeed),
    scale,
    gravity: g,
  }
}

/**
 * The car's speed after `dt`, mm/s along its nose — forward positive, reversing
 * negative. `slope` is the downhill component of the direction the nose points,
 * so a car left facing down a ramp rolls away whether it is being driven or not.
 *
 * Resistance is applied as a step that can bring the car to rest but never push
 * it back the way it came, so a stopped car stays stopped — and a car left on a
 * slope gentle enough for the tyres to hold it does too.
 */
export function stepSpeed(input: DriveInput, speed: number, slope: number, perf: Performance, dt: number): number {
  let v = speed + perf.gravity * slope * dt

  // The engine pulls the same however fast the car is going; where it stops is
  // decided by the drag below, not by the throttle backing off.
  if (input.throttle > 0) v += input.throttle * perf.power * dt

  // Down is the brakes while the car is moving forward, and reverse once it has
  // stopped — with a gear of its own, so a car cannot be reversed flat out.
  if (input.brake > 0 && v <= 0) {
    v -= input.brake * perf.power * REVERSE_POWER * (1 - clamp01(-v / perf.reverseSpeed)) * dt
  }

  let resist = ROLLING * perf.gravity + perf.drag * v * v
  if (input.brake > 0 && v > 0) resist += input.brake * BRAKE_G * perf.gravity
  if (input.handbrake) resist += HANDBRAKE_G * perf.gravity
  const step = resist * dt
  return Math.abs(v) <= step ? 0 : v - Math.sign(v) * step
}

/**
 * Where the steering has turned to after `dt`, radians. Positive is to the car's
 * right. Lock winds off with speed, the way a real rack does through its ratio —
 * without it the car would be undriveable at anything above a crawl.
 *
 * The rack turns at a share of whatever lock it has rather than at a fixed
 * degrees per second, so winding on takes the same fraction of a second at any
 * speed. A fixed rate arrives instantly where the lock is only a few degrees
 * wide, which is what makes a key-press read as a flick rather than as steering.
 */
export function steerTowards(current: number, input: DriveInput, speed: number, perf: Performance, dt: number): number {
  const lock = degToRad(MAX_STEER_DEG) * (1 - (1 - STEER_AT_SPEED) * clamp01(Math.abs(speed) / perf.topSpeed))
  const want = input.steer * lock
  const rate = (lock / (input.steer === 0 ? STEER_RETURN_TIME : STEER_TIME)) * dt
  return Math.abs(want - current) <= rate ? want : current + Math.sign(want - current) * rate
}

/**
 * How far the car's nose has come off the track's own direction after `dt`,
 * radians — where it is going rather than where its wheels are pointed.
 *
 * It follows the wheels rather than matching them: a car has to be turned, and
 * it settles back straight after the wheels do. That lag is most of what makes a
 * corner read as one thing rather than as a step sideways, and the chase camera
 * inherits it, since it looks the way the nose is pointing.
 *
 * A stopped car with the wheels turned is still sitting square on the track, so
 * the angle it is heading for fades out as it slows.
 */
export function stepYaw(current: number, steer: number, speed: number, perf: Performance, dt: number): number {
  const want = steer * clamp01(Math.abs(speed) / (perf.topSpeed * YAW_SETTLES_AT))
  return current + (want - current) * (1 - Math.exp(-dt / YAW_LAG))
}

/**
 * Which opening a junction hands the car out of, or null to carry straight on.
 *
 * The turn is taken on the driver's asking: holding left or right as the car
 * goes over the middle of the opening puts it onto whatever is joined there.
 * Nothing else does it — an opening with nothing attached, or a wall that is not
 * open, leaves the car on the run it is already on, which is also what happens
 * when the keys are not asking for anything.
 *
 * `from` and `to` are where along the centreline the car was and now is, so the
 * turn is taken once, as the middle of the opening goes by, rather than for
 * every frame spent inside it.
 */
export function junctionExit(
  piece: Piece,
  from: number,
  to: number,
  dir: 1 | -1,
  steer: number,
): PortId | null {
  if (piece.kind !== 'junction' || steer === 0) return null
  const middle = Math.max(1, piece.length) / 2
  if ((from - middle) * (to - middle) > 0) return null
  // Left and right are the driver's, and a car going the other way down the
  // piece has them the other way round from the part's own.
  const wantsLeft = steer < 0
  const port: PortId = wantsLeft === (dir > 0) ? 'l' : 'r'
  if (port === 'l' ? !piece.openLeft : !piece.openRight) return null
  return piece.links[port] ? port : null
}

/**
 * Half the flat channel floor at arc length `s` along a piece, mm — the room
 * between the two ramps the walls rise from.
 */
export function channelHalfWidth(d: Dimensions, piece: Piece, s: number): number {
  const half =
    piece.kind === 'transition'
      ? transitionHalfWidthAt(
          d,
          {
            lanesA: piece.lanes,
            lanesB: piece.lanesB,
            length: Math.max(1, piece.length),
            cornerRadius: piece.cornerRadius,
            flatEnd: piece.flatEnd,
          },
          s,
        )
      : (laneWidth(d.track) * Math.max(1, Math.round(piece.lanes))) / 2
  return wallMetrics(d.track, half).rampBottomX
}

/**
 * How far either side of the centreline the car can sit before a wheel is up the
 * ramp, mm. Zero on a single lane under a die-cast car, which fills it — steering
 * is something a wider piece gives you.
 */
export function lateralRoom(d: Dimensions, piece: Piece, s: number, carWidth: number): number {
  return Math.max(0, channelHalfWidth(d, piece, s) - carWidth / 2)
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const degToRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Millimetres a second as kilometres an hour, and as miles an hour — the car's
 * own speed across the track, said two other ways. Small numbers, because it is
 * a small car, and that is the point of them.
 */
export const kph = (mmPerSecond: number) => (Math.abs(mmPerSecond) * 3.6) / 1000
export const mph = (mmPerSecond: number) => kph(mmPerSecond) / 1.609344
