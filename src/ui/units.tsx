import { useProject } from '../store/useProject'
import {
  editEpsilonMm,
  formatLength,
  formatValue,
  fromMm,
  inputDigits,
  toMm,
  unitStep,
  unitSuffix,
} from '../lib/units'
import { NumberInput } from './controls'

/**
 * The unit picked in Settings ▸ Units, with the formatters every panel needs to
 * write a stored millimetre value in it.
 */
export function useUnits() {
  const unit = useProject((s) => s.units)
  return {
    unit,
    suffix: unitSuffix(unit),
    /** A millimetre length written in the current unit, suffix included. */
    fmt: (mm: number, mmDigits?: number) => formatLength(mm, unit, mmDigits),
    /** The same number bare, for a row that prints the unit itself. */
    val: (mm: number, mmDigits?: number) => formatValue(mm, unit, mmDigits),
  }
}

/**
 * A length that is stored in millimetres but typed in the chosen unit. Bounds and
 * the arrow-key step convert with it, and an edit that differs from the stored
 * value by no more than the display rounding is dropped — so switching units back
 * and forth cannot drift a dimension.
 */
export function LengthInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  /** Millimetres. */
  value: number
  /** Called with millimetres. */
  onChange: (mm: number) => void
  /** Millimetres; translated to a step that suits the unit. */
  step?: number
  min?: number
  max?: number
}) {
  const unit = useProject((s) => s.units)
  return (
    <NumberInput
      value={fromMm(value, unit)}
      step={unitStep(step, unit)}
      min={min === undefined ? undefined : fromMm(min, unit)}
      max={max === undefined ? undefined : fromMm(max, unit)}
      digits={inputDigits(unit)}
      suffix={unitSuffix(unit)}
      onChange={(v) => {
        const mm = toMm(v, unit)
        if (Math.abs(mm - value) > editEpsilonMm(unit)) onChange(mm)
      }}
    />
  )
}
