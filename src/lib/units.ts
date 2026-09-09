import type { Unit } from '../types'

/**
 * Millimetres are the only unit the app stores or builds geometry in. Everything
 * here converts on the way to and from the screen, so picking inches in
 * Settings ▸ Units never touches a saved dimension.
 */
export const MM_PER_INCH = 25.4

export const UNIT_OPTIONS: { value: Unit; label: string; suffix: string }[] = [
  { value: 'mm', label: 'Millimetre (mm)', suffix: 'mm' },
  { value: 'in', label: 'Inch (in)', suffix: 'in' },
]

export const unitSuffix = (u: Unit) => (u === 'in' ? 'in' : 'mm')

export const unitLabel = (u: Unit) => UNIT_OPTIONS.find((o) => o.value === u)?.label ?? 'Millimetre (mm)'

/** The word for the unit, for prose rather than a field suffix. */
export const unitNoun = (u: Unit) => (u === 'in' ? 'inches' : 'millimetres')

export const fromMm = (mm: number, u: Unit) => (u === 'in' ? mm / MM_PER_INCH : mm)
export const toMm = (v: number, u: Unit) => (u === 'in' ? v * MM_PER_INCH : v)

/** An inch is 25.4× coarser than a millimetre, so it needs a decimal place more. */
export const unitDigits = (u: Unit, mmDigits = 2) => (u === 'in' ? mmDigits + 1 : mmDigits)

/** A millimetre length written in the chosen unit, with its suffix. */
export const formatLength = (mm: number, u: Unit, mmDigits = 2) =>
  `${formatValue(mm, u, mmDigits)}${unitSuffix(u)}`

/** The same number without a suffix, for a row that prints the unit once itself. */
export const formatValue = (mm: number, u: Unit, mmDigits = 2) =>
  fromMm(mm, u).toFixed(unitDigits(u, mmDigits))

/** How many decimals a typed field keeps. Enough that a value survives a round trip. */
export const inputDigits = (u: Unit) => (u === 'in' ? 4 : 3)

/**
 * A nudge step suited to the unit — a 0.1mm arrow step would be lost in an inch
 * field, so inch steps land on hundredths and quarters instead.
 */
export function unitStep(mmStep: number, u: Unit): number {
  if (u === 'mm') return mmStep
  if (mmStep <= 0.1) return 0.005
  if (mmStep <= 1) return 0.01
  if (mmStep < 5) return 0.05
  return 0.25
}

/**
 * Smaller than a typed field can express, so an "edit" that is only the display
 * rounding coming back is ignored rather than nudging the stored millimetres.
 */
export const editEpsilonMm = (u: Unit) => (u === 'in' ? 0.002 : 0.0005)

const KEY = 'track-maker.units'

/** The unit is a workshop preference, like the theme, so it outlives a reload. */
export function loadUnits(): Unit {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'mm' || v === 'in') return v
  } catch {
    /* private mode, blocked storage — fall through to millimetres */
  }
  return 'mm'
}

export function saveUnits(u: Unit) {
  try {
    localStorage.setItem(KEY, u)
  } catch {
    /* nothing to persist to; the in-memory value still drives the UI */
  }
}
