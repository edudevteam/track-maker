import type { VehicleSize } from '../types'

/**
 * Model scales a vehicle can be sized to.
 *
 * A scale is a pure statement about the car: 1:64 means the car is drawn a
 * sixty-fourth of the real vehicle's size. It says nothing about the track, so
 * picking one never moves a track dimension — a 1:32 car in a channel cut for
 * 1:64 simply overhangs it, which is a thing worth being able to see.
 *
 * Working out a scaled size needs to know how big the real vehicle is, which is
 * something only the model file can say, and only when its units are known.
 * `REFERENCE_VEHICLE` is what stands in when they are not.
 */

export interface CarScale {
  /** `1:64` — also what the picked scale is stored as. */
  id: string
  /** The number after the colon. A 1:64 car is a sixty-fourth of the real one. */
  denominator: number
  /** What the scale is usually called, where it has a name. */
  note: string
}

export const CAR_SCALES: CarScale[] = [
  { id: '1:64', denominator: 64, note: 'Die cast' },
  { id: '1:32', denominator: 32, note: 'Slot car' },
  { id: '1:28', denominator: 28, note: 'RC' },
]

/**
 * The real vehicle a scale is measured against when the model cannot say — a
 * mid-size saloon, mm. It is also exactly what the Block placeholder is, so a
 * block at 1:32 is the size a 1:32 car of ordinary proportions would be.
 */
export const REFERENCE_VEHICLE: VehicleSize = { length: 4500, width: 1800, height: 1450 }

/** The real vehicle shrunk to a scale. */
export function sizeAtScale(real: VehicleSize, denominator: number): VehicleSize {
  return {
    length: real.length / denominator,
    width: real.width / denominator,
    height: real.height / denominator,
  }
}

/**
 * Which scale a size is already at, so the picker can show one as chosen. A
 * hand-typed size usually sits between two, and then none is.
 */
export function scaleOf(real: VehicleSize, size: VehicleSize, tolerance = 0.005): CarScale | null {
  return (
    CAR_SCALES.find((s) => {
      const want = sizeAtScale(real, s.denominator)
      return (['length', 'width', 'height'] as const).every(
        (k) => Math.abs(size[k] - want[k]) <= want[k] * tolerance,
      )
    }) ?? null
  )
}

/**
 * The millimetres-per-unit that makes a model come out a plausible road vehicle.
 *
 * A file says nothing about its own units, and the three that turn up in
 * practice are metres (glTF's own convention), centimetres and millimetres. They
 * are three orders of magnitude apart, so which one was meant is never in doubt:
 * only one of them puts a car between a quad bike and an articulated lorry.
 *
 * The candidates are those units and nothing else, which is what makes a null
 * possible: walking every power of ten instead would find a scale for any number
 * at all, and read a 1mm speck as a ten-metre lorry. The one addition is a
 * millionth — a metres model exported under a thousandth-scale root node, which
 * is what an exporter asked to "scale to millimetres" can leave behind.
 *
 * Null means nothing sensible fits, and then the model's real size is unknown.
 */
export function guessMmPerUnit(lengthInFileUnits: number): number | null {
  if (!(lengthInFileUnits > 0) || !Number.isFinite(lengthInFileUnits)) return null

  // A quad bike to an articulated lorry, mm. Anything outside is not a vehicle.
  const SHORTEST = 1500
  const LONGEST = 25000
  /** What a scale has to beat to be picked: nearest a mid-size car, log-wise. */
  const TYPICAL = 4500

  /** Millimetres, centimetres, inches, metres, and metres under a 0.001 node. */
  const candidates = [1, 10, 25.4, 1000, 1e6]

  let best: number | null = null
  let bestMiss = Infinity
  for (const mmPerUnit of candidates) {
    const mm = lengthInFileUnits * mmPerUnit
    if (mm < SHORTEST || mm > LONGEST) continue
    const miss = Math.abs(Math.log(mm / TYPICAL))
    if (miss < bestMiss) {
      bestMiss = miss
      best = mmPerUnit
    }
  }
  return best
}
