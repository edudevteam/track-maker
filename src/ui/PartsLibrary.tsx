import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  bankedName,
  bendName,
  DEFAULT_BANK_ANGLE,
  junctionName,
  transitionName,
  useProject,
} from '../store/useProject'
import { BankedFields } from './BankedFields'
import type { BankedSpec } from '../geometry/banked'
import { LeanSection } from './BankedFields'
import { bedLength, portLean, rollIntoBank } from '../lib/levelling'
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
import { junctionSide } from '../geometry/junction'
import {
  bendFrameAt,
  bendLayout,
  canHaveBase,
  effectiveBase,
  gentleRollLength,
  MAX_BEND_ANGLE,
  MAX_EDGE_GRADE,
  MAX_ROLL,
  MIN_TWIST,
  minBendRadius,
  rollEdge,
  rollLayout,
  splitRoll,
} from '../geometry/bend'
import type { BendBase, BendMode, PartSpec, PieceKind } from '../types'

/** Lanes are free-typed, so they need sane bounds. Widths are whole lanes. */
export const MAX_LANES = 8
/** A straight still has to hold a connector pocket at each end. Millimetres. */
const MIN_STRAIGHT_LENGTH = 20
const MAX_STRAIGHT_LENGTH = 1000
/** The common straight lengths, offered here and in Part Details. Millimetres. */
export const LENGTH_PRESETS = [50, 100, 150, 200]
const CURVE_ANGLES = [15, 30, 45, 90]
/** The common bend angles, degrees. Twice one of these turns a climb into a drop. */
const BEND_ANGLES = [10, 15, 20, 30]
const DEFAULT_BEND_ANGLE = 15
const DEFAULT_BEND_RADIUS = 150
const MAX_BEND_RADIUS = 800
const MAX_SLOPE = 600
/** The common roll angles, degrees — the same as the banked curves they lead into. */
const ROLL_ANGLES = [15, 30, 45, 60]
const DEFAULT_ROLL = 30
/** The longest roll offered, all told, mm — it prints as however many pieces that takes. */
const MAX_ROLL_LENGTH = 4000

type Turn = 'left' | 'right'

const CATALOGUE: { kind: PieceKind; name: string; blurb: string }[] = [
  { kind: 'straight', name: 'Straight', blurb: 'A flat run of any length.' },
  { kind: 'curve', name: 'Curve', blurb: 'A turn on a fixed radius.' },
  { kind: 'transition', name: 'Transition', blurb: 'Opens one width into the next.' },
  { kind: 'junction', name: 'Junction', blurb: 'Opens one or both sides.' },
  { kind: 'bend', name: 'Bend', blurb: 'Tips the track up or down, or rolls it into a bank.' },
  { kind: 'banked', name: 'Banked curve', blurb: 'A level turn whose road leans in.' },
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
  const topSpeed = useProject((s) => s.topSpeed)
  const gravity = useProject((s) => s.gravity)
  const printer = useProject((s) => s.printer)
  const { fmt, val } = useUnits()

  const [kind, setKind] = useState<PieceKind>('straight')
  const [lanes, setLanes] = useState(1)
  const [lanesB, setLanesB] = useState(2)
  const [length, setLength] = useState(dims.assembly.defaultStraightLength)
  const [radius, setRadius] = useState(120)
  const [angleDeg, setAngleDeg] = useState(45)
  const [turn, setTurn] = useState<Turn>('left')
  const [bendAngle, setBendAngle] = useState(DEFAULT_BEND_ANGLE)
  const [bendRadius, setBendRadius] = useState(DEFAULT_BEND_RADIUS)
  const [bendSlope, setBendSlope] = useState(0)
  const [bendBase, setBendBase] = useState<BendBase>('none')
  const [bendMode, setBendMode] = useState<BendMode>('pitch')
  const [rollDeg, setRollDeg] = useState(DEFAULT_ROLL)
  // A roll's length is worked out for it until it is typed over.
  const [twistSet, setTwist] = useState<number | null>(null)
  const bend = { radius: bendRadius, angleDeg: bendAngle, slope: bendSlope, base: bendBase, mode: bendMode, rollDeg }
  const [bankTurn, setBankTurn] = useState<Omit<BankedSpec, 'lanes'>>({
    bankAngle: DEFAULT_BANK_ANGLE,
    bankBase: true,
    radius: 250,
    angleDeg: 90,
  })
  const banked: BankedSpec = { ...bankTurn, lanes }
  // A junction is a square whose side follows from its lanes, so the only thing
  // to pick is which of its walls are open.
  const [openLeft, setOpenLeft] = useState(true)
  const [openRight, setOpenRight] = useState(true)
  const junctionLen = junctionSide(dims, lanes)
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

  const base = {
    lanes,
    lanesB,
    length,
    slope: 0,
    base: 'none' as BendBase,
    bankAngle: DEFAULT_BANK_ANGLE,
    bankBase: true,
    bendMode: 'pitch' as BendMode,
    rollDeg: DEFAULT_ROLL,
    rollStart: 0,
    easeFrom: 0,
    easeTo: 1,
    cornerRadius: corner,
    flatEnd: flat,
    radius,
    angleDeg,
    openLeft: false,
    openRight: false,
  }

  const spec: PartSpec =
    kind === 'curve'
      ? { ...base, kind, angleDeg: turn === 'left' ? angleDeg : -angleDeg, name: `Curve ${angleDeg}°` }
      : kind === 'transition'
        ? { ...base, kind, length: taperLen, name: transitionName(lanes, lanesB) }
        : kind === 'junction'
          ? { ...base, kind, length: junctionLen, openLeft, openRight, name: junctionName(openLeft, openRight) }
          : kind === 'bend'
              ? {
                  ...base,
                  kind,
                  // A roll's length is its twist; a pitch's is worked out from its arc.
                  length: bendLayout(dims, bend).length,
                  radius: Math.max(bendRadius, minBendRadius(dims)),
                  angleDeg: bendAngle,
                  slope: bendSlope,
                  base: effectiveBase(bend),
                  bendMode,
                  rollDeg,
                  name: bendName(bendAngle, bendBase, bendMode, rollDeg),
                }
            : kind === 'banked'
              ? { ...base, ...banked, kind, name: bankedName(banked) }
              : { ...base, kind, name: `Straight ${fmt(length, 0)}` }

  const add = () => {
    if (kind === 'bend' && bendMode === 'roll') {
      // A long roll goes in as its pieces, one after another.
      let end: { pieceId: string; port: 'b' } | null = null
      rollParts.forEach((part, k) => {
        const name = `${spec.name}${rollParts.length > 1 ? ` (${k + 1}/${rollParts.length})` : ''}`
        const id = addPiece({ ...spec, ...part, name }, end ? { attachTo: end } : {})
        end = { pieceId: id, port: 'b' }
      })
    } else addPiece({ ...spec })
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
  // Joining onto an end that leans, a Roll can bring it back level.
  const lean = willJoin && host ? portLean(host, activePort!.port, dims, { ...spec, kind: 'bend' }) : 0
  const levelTo = lean ? lean : null
  // A roll starts from however far the end it joins leans, and is sized and
  // split from there.
  const fromDeg = -lean
  // The roll's length all told, both level connector sections included.
  const autoTwist = gentleRollLength(dims, lanes, fromDeg, fromDeg + rollDeg, topSpeed, gravity)
  const twist = Math.max(2 * dims.assembly.connectorInset + MIN_TWIST, twistSet ?? autoTwist)
  const based = bendBase !== 'none'
  const rollParts = splitRoll(dims, { lanes, fromDeg, changeDeg: rollDeg, total: twist, based }, bedLength(printer.size))
  // The whole run as one piece, for what its outside edge does.
  const edge = rollEdge(
    rollLayout(dims, { lanes, rollDeg, length: twist - 2 * dims.assembly.connectorInset, base: bendBase, rollStart: fromDeg }),
    gravity,
  )
  const rollPlan: RollPlan = {
    ...edge,
    speed: topSpeed,
    auto: autoTwist,
    isAuto: twistSet === null,
    pieces: rollParts.length,
    // What prints: the twist and both connector sections.
    each: (rollParts[0]?.length ?? 0) + 2 * dims.assembly.connectorInset,
  }
  // Picking a Bend for a leaning end starts on what it most likely is for: levelling out.
  useEffect(() => {
    if (kind !== 'bend' || levelTo === null) return
    setBendMode('roll')
    setRollDeg(levelTo)
    setBendBase('a')
    // Only when the part or the end changes, not as the fields are edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, activePort?.pieceId, activePort?.port])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <h2 className="text-[13px] font-semibold">Parts library</h2>
          <button className="tm-btn px-1.5 py-1" onClick={onClose} aria-label="Close">
            <X size={13} />
          </button>
        </div>

        {/* Usual height on a roomy screen; on a short window the two columns
            scroll on their own while the header and the Add button stay put. */}
        <div className="flex min-h-[min(286px,calc(100dvh-9rem))] flex-1 overflow-hidden">
          <div
            className="w-[186px] shrink-0 overflow-y-auto border-r p-2"
            style={{ borderColor: 'var(--color-line)' }}
          >
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

          <div className="min-w-0 flex-1 overflow-y-auto p-3">
            {kind === 'banked' ? null : kind === 'bend' && bendMode === 'roll' ? (
              <LeanSection lanes={lanes} lean={Math.abs(rollDeg)} base={bendBase !== 'none'} />
            ) : (
            <Preview
              kind={kind}
              lanes={lanes}
              lanesB={lanesB}
              rounding={cornerLimit > 0 ? corner / cornerLimit : 0}
              taperSpan={Math.max(0, taperLen - 2 * flat) / Math.max(1, taperLen)}
              openSpan={(laneWidth(dims.track) * lanes) / Math.max(1, junctionLen)}
              openLeft={openLeft}
              openRight={openRight}
              angleDeg={angleDeg}
              turn={turn}
              bend={bend}
            />
            )}

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
            ) : kind === 'junction' ? (
              <>
                <OpenSidesField
                  left={openLeft}
                  right={openRight}
                  onChange={(l, r) => {
                    setOpenLeft(l)
                    setOpenRight(r)
                  }}
                />
                <JunctionSizeNote lanes={lanes} />
              </>
            ) : kind === 'banked' ? (
              <BankedFields
                spec={banked}
                onChange={({ lanes: l, ...patch }) => {
                  if (l !== undefined) setLanes(l)
                  setBankTurn((b) => ({ ...b, ...patch }))
                }}
              />
            ) : kind === 'bend' ? (
              <BendFields
                angleDeg={bendAngle}
                radius={bendRadius}
                slope={bendSlope}
                base={bendBase}
                mode={bendMode}
                rollDeg={rollDeg}
                twist={twist}
                onAngle={setBendAngle}
                onRadius={setBendRadius}
                onSlope={setBendSlope}
                onBase={setBendBase}
                onMode={setBendMode}
                onRoll={setRollDeg}
                onTwist={setTwist}
                levelTo={levelTo}
                rollPlan={rollPlan}
                onTwistAuto={() => setTwist(null)}
              />
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
          className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
            {willJoin
              ? kind === 'banked' && host && rollIntoBank(host, activePort!.port, { ...spec, color: host.color }, dims, {
                  speed: topSpeed,
                  gravity,
                  bed: bedLength(printer.size),
                }).length
                ? 'Rolls go in first to lean gently into the bank, then the curve.'
                : 'Joins onto the highlighted end.'
              : 'Lands loose on the workplane.'}
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
 * go below the minimum in Settings ▸ Dimensions, which leaves a clip slot to sit in.
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

/**
 * What size the junction comes out, and why it is not simply the track's width.
 * There is nothing to set here — the tile is square and its side follows from
 * the lanes — but the extra pitch is surprising enough to be worth saying.
 */
export function JunctionSizeNote({ lanes }: { lanes: number }) {
  const dims = useProject((s) => s.dims)
  const { fmt } = useUnits()
  const side = junctionSide(dims, lanes)
  return (
    <Field label="Size" hint="A lane pitch wider than the track, so a clip fits on every side.">
      <p className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
        {fmt(side)} square, with a {fmt(laneWidth(dims.track) * Math.max(1, Math.round(lanes)))} way
        on and off each side.
      </p>
    </Field>
  )
}

/**
 * Which walls a junction has open. A part with neither open is a straight with
 * extra fields, so picking one side off always leaves the other on.
 */
export function OpenSidesField({
  left,
  right,
  onChange,
}: {
  left: boolean
  right: boolean
  onChange: (left: boolean, right: boolean) => void
}) {
  const options: { label: string; left: boolean; right: boolean }[] = [
    { label: 'Left', left: true, right: false },
    { label: 'Right', left: false, right: true },
    { label: 'Both', left: true, right: true },
  ]
  return (
    <Field label="Open sides" hint="Left and right as the driver sees them, running towards side B.">
      <div className="grid grid-cols-3 gap-1">
        {options.map((o) => (
          <button
            key={o.label}
            className="tm-btn px-0"
            aria-pressed={left === o.left && right === o.right}
            style={
              left === o.left && right === o.right ? { borderColor: 'var(--color-accent)' } : undefined
            }
            onClick={() => onChange(o.left, o.right)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  )
}

/** A roll's outside edge, and how it prints. */
export interface RollPlan {
  climb: number
  grade: number
  liftSpeed: number
  /** The car's Top speed, to hold the lift-off speed against. */
  speed: number
  /** The length worked out for it, when there is one to offer. */
  auto?: number
  isAuto?: boolean
  /** How many pieces it prints as, and how long each is. */
  pieces?: number
  each?: number
}

/**
 * What a roll does to the outside edge — which climbs as the road leans over —
 * and how it prints. Amber when the climb is steep or a car at Top speed would
 * lift off.
 */
function RollReadout({ plan }: { plan: RollPlan }) {
  const { fmt } = useUnits()
  const steep = plan.grade > MAX_EDGE_GRADE + 1e-6
  const lifts = plan.liftSpeed < plan.speed
  const warn = steep || lifts
  return (
    <p
      className="mb-2 rounded border p-2 text-[11px]"
      style={
        warn
          ? { borderColor: '#d97706', background: 'color-mix(in srgb, #d97706 12%, transparent)' }
          : { borderColor: 'var(--color-line)', color: 'var(--color-ink-2)' }
      }
    >
      The outside edge climbs {fmt(plan.climb, 0)}, at most {(plan.grade * 100).toFixed(0)}%. A car stays on up to{' '}
      {Number.isFinite(plan.liftSpeed) ? `${Math.round(plan.liftSpeed)} mm/s` : 'any speed'}
      {lifts ? ` — below your ${Math.round(plan.speed)} mm/s Top speed, so it would lift off` : ''}
      {steep && !lifts ? ' — steeper than the 15% a gentle roll keeps to' : ''}.
      {plan.pieces && plan.pieces > 1
        ? ` Prints as ${plan.pieces} pieces of ${fmt(plan.each ?? 0, 0)}, each its share of one smooth curve.`
        : ''}
    </p>
  )
}

/**
 * A bend's shape: which way it tips the track, how far, and how sharply. Shared
 * by the library and Part Details.
 */
export function BendFields({
  angleDeg,
  radius,
  slope,
  base,
  mode,
  rollDeg,
  twist,
  onAngle,
  onRadius,
  onSlope,
  onBase,
  onMode,
  onRoll,
  onTwist,
  levelTo = null,
  rollPlan,
  onTwistAuto,
}: {
  angleDeg: number
  radius: number
  slope: number
  base: BendBase
  mode: BendMode
  rollDeg: number
  twist: number
  onAngle: (deg: number) => void
  onRadius: (mm: number) => void
  onSlope: (mm: number) => void
  onBase: (base: BendBase) => void
  onMode: (mode: BendMode) => void
  onRoll: (deg: number) => void
  onTwist: (mm: number) => void
  /**
   * The lean that brings the road back level from the end side A joins — or
   * null when that end is level, or there is no end to join.
   */
  levelTo?: number | null
  /** What the roll does to the outside edge, and — in the library — how it prints. */
  rollPlan?: RollPlan
  /** Put the roll's length back to the one worked out for it. */
  onTwistAuto?: () => void
}) {
  const dims = useProject((s) => s.dims)
  const { fmt } = useUnits()
  const turn = Math.abs(angleDeg)
  const sign = angleDeg < 0 ? -1 : 1
  const l = bendLayout(dims, { radius, angleDeg, slope, base })
  const baseable = canHaveBase({ angleDeg })
  const kindField = (
    <Field label="Bend" hint="Pitch tips the nose up or down. Roll leans the road over to one side, into a bank.">
      <Segmented<BendMode>
        value={mode}
        onChange={onMode}
        options={[
          { value: 'pitch', label: 'Pitch' },
          { value: 'roll', label: 'Roll' },
        ]}
      />
    </Field>
  )
  if (mode === 'roll') {
    const lean = Math.abs(rollDeg)
    const way = rollDeg < 0 ? -1 : 1
    const levelling = levelTo !== null && base !== 'none' && Math.abs(rollDeg - levelTo) < 0.05
    return (
      <>
        {kindField}
        <Field
          label="Lean"
          hint={
            levelling
              ? `Rolls the ${Math.abs(levelTo!).toFixed(0)}° lean it joins back to level, ending flat on the floor, ready for ordinary track.`
              : levelTo !== null
                ? `The end it joins leans ${Math.abs(levelTo).toFixed(0)}°. Level out brings it back flat.`
                : 'Lean left to bank into a left turn, right for a right. To come back out of a bank, highlight its end and pick Level out.'
          }
        >
          <Segmented<'left' | 'right' | 'level'>
            value={levelling ? 'level' : way < 0 ? 'right' : 'left'}
            onChange={(v) => {
              if (v === 'level') {
                if (levelTo === null) return
                onRoll(levelTo)
                onBase('a')
              } else onRoll((v === 'left' ? 1 : -1) * lean)
            }}
            options={[
              { value: 'left', label: 'Lean left' },
              { value: 'right', label: 'Lean right' },
              ...(levelTo !== null ? [{ value: 'level' as const, label: 'Level out' }] : []),
            ]}
          />
        </Field>
        {!levelling && (
        <Field label="Angle" hint="The same as the banked curve it leads into.">
          <div className="mb-1.5 grid grid-cols-4 gap-1">
            {ROLL_ANGLES.map((a) => (
              <button
                key={a}
                className="tm-btn px-0"
                style={Math.abs(lean - a) < 0.05 ? { borderColor: 'var(--color-accent)' } : undefined}
                onClick={() => onRoll(way * a)}
              >
                {a}°
              </button>
            ))}
          </div>
          <NumberInput
            value={lean}
            onChange={(v) => onRoll(way * Math.min(MAX_ROLL, Math.max(1, v)))}
            step={5}
            min={1}
            max={MAX_ROLL}
            suffix="°"
          />
        </Field>
        )}
        <Field
          label="Roll length"
          hint={
            rollPlan?.auto !== undefined
              ? 'The whole roll, end to end. It holds level for a connector section at each end and leans over steadily between, through its own joints. Longer is gentler on the car.'
              : `This piece's twist, between its two ${fmt(dims.assembly.connectorInset, 0)} connector sections.`
          }
        >
          {rollPlan?.auto !== undefined && onTwistAuto ? (
            <div className="grid grid-cols-2 gap-1">
              <button
                className="tm-btn px-0"
                style={rollPlan.isAuto ? { borderColor: 'var(--color-accent)' } : undefined}
                onClick={onTwistAuto}
                title="Long enough for the outside edge to climb gently and a car at Top speed to stay down"
              >
                Fit · {fmt(rollPlan.auto, 0)}
              </button>
              <LengthInput value={twist} onChange={onTwist} step={10} min={MIN_TWIST} max={MAX_ROLL_LENGTH} />
            </div>
          ) : (
            <LengthInput value={twist} onChange={onTwist} step={10} min={MIN_TWIST} max={MAX_ROLL_LENGTH} />
          )}
        </Field>
        {rollPlan && <RollReadout plan={rollPlan} />}
        <Field
          label="Solid base"
          hint={
            base !== 'none'
              ? 'Filled down to the floor under the leaning road, its low edge on the floor, so it prints flat and holds itself up.'
              : 'The road only — it needs holding up, and supports under it when printed.'
          }
        >
          <Segmented<'on' | 'off'>
            value={base !== 'none' ? 'on' : 'off'}
            onChange={(v) => onBase(v === 'on' ? 'a' : 'none')}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Field>
      </>
    )
  }
  return (
    <>
      {kindField}
      <Field
        label="Direction"
        hint="Up tips the road upwards, as at the foot of a hill; down tips it back, as at the top."
      >
        <Segmented<'up' | 'down'>
          value={sign < 0 ? 'down' : 'up'}
          onChange={(v) => onAngle((v === 'down' ? -1 : 1) * turn)}
          options={[
            { value: 'up', label: 'Up' },
            { value: 'down', label: 'Down' },
          ]}
        />
      </Field>
      <Field
        label="Angle"
        hint="Relative to the end it joins. Twice the slope turns a climb straight into a drop."
      >
        <div className="mb-1.5 grid grid-cols-4 gap-1">
          {BEND_ANGLES.map((a) => (
            <button
              key={a}
              className="tm-btn px-0"
              style={Math.abs(turn - a) < 0.05 ? { borderColor: 'var(--color-accent)' } : undefined}
              onClick={() => onAngle(sign * a)}
            >
              {a}°
            </button>
          ))}
        </div>
        <NumberInput
          value={turn}
          onChange={(v) => onAngle(sign * Math.min(MAX_BEND_ANGLE, Math.max(1, v)))}
          step={5}
          min={1}
          max={MAX_BEND_ANGLE}
          suffix="°"
        />
      </Field>
      <Field
        label="Radius"
        hint={`${fmt(l.length, 0)} along the road, with a level ${fmt(l.inset, 0)} connector section at each end.`}
      >
        <LengthInput
          value={radius}
          onChange={onRadius}
          step={10}
          min={minBendRadius(dims)}
          max={MAX_BEND_RADIUS}
        />
      </Field>
      <Field label="Slope length" hint="A straight run at the angle, built into the part. 0 for none.">
        <LengthInput value={slope} onChange={(v) => onSlope(Math.max(0, v))} step={10} min={0} max={MAX_SLOPE} />
      </Field>
      <Field
        label="Solid base"
        hint={
          baseable
            ? 'Filled underneath down to a flat base, so it prints flat and holds itself up.'
            : 'Only a bend up has an underside to fill.'
        }
      >
        <Segmented<BendBase>
          value={baseable ? base : 'none'}
          onChange={(v) => baseable && onBase(v)}
          options={[
            { value: 'none', label: 'None' },
            { value: 'a', label: 'Under A' },
            { value: 'b', label: 'Under B' },
          ]}
        />
        {baseable && base !== 'none' && (
          <p className="mt-1 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
            {base === 'a'
              ? 'Side A sits level on the base and the track climbs away from it.'
              : 'The track comes down to side B, which sits level on the base.'}
          </p>
        )}
      </Field>
    </>
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
      {kind === 'junction' && (
        <>
          <path d="M3 13h20" stroke="var(--color-track)" strokeWidth={7} strokeLinecap="round" fill="none" />
          <path d="M13 3v20" stroke="var(--color-track)" strokeWidth={7} strokeLinecap="round" fill="none" />
        </>
      )}
      {kind === 'banked' && (
        <>
          <path d="M4 22a18 18 0 0 1 18-18" stroke="var(--color-track)" strokeWidth={7} strokeLinecap="round" fill="none" />
          <path d="M9 24a14 14 0 0 1 14-14" stroke="#2f7fd1" strokeWidth={3} strokeLinecap="round" fill="none" />
        </>
      )}
      {kind === 'bend' && (
        <path d="M3 20h7q5 0 9-5l4-5" stroke="var(--color-track)" strokeWidth={6} strokeLinecap="round" fill="none" />
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
  openSpan,
  openLeft,
  openRight,
  angleDeg,
  turn,
  bend,
}: {
  kind: PieceKind
  lanes: number
  lanesB: number
  /** Corner rounding as a fraction of what the taper has room for. */
  rounding: number
  /** How much of the length the taper covers, 0 to 1. */
  taperSpan: number
  /** How much of a junction's length the side opening covers, 0 to 1. */
  openSpan: number
  openLeft: boolean
  openRight: boolean
  angleDeg: number
  turn: Turn
  bend: { radius: number; angleDeg: number; slope: number; base: BendBase }
}) {
  const dims = useProject((s) => s.dims)
  // A lane is 11px on screen, clamped so an 8-wide piece still fits the box.
  const bandFor = (n: number) => Math.min(46, 6 + n * 11)
  const band = bandFor(lanes)

  if (kind === 'junction') {
    // The run across the box with a branch coming off each open side, drawn the
    // width it will actually take. Left is up here, as it is looking down on the
    // track with side B to the right.
    const span = 140 * Math.min(Math.max(openSpan, 0.05), 0.9)
    return (
      <div
        className="mb-3 grid h-[104px] place-items-center rounded border"
        style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-line)' }}
      >
        <svg width={190} height={92} viewBox="0 0 190 92" aria-hidden>
          {openLeft && (
            <path d={`M95 46V4`} stroke="var(--color-track)" strokeWidth={span} fill="none" opacity={0.55} />
          )}
          {openRight && (
            <path d={`M95 46v42`} stroke="var(--color-track)" strokeWidth={span} fill="none" opacity={0.55} />
          )}
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
          <text x={170} y={49} fontSize={9} fill="var(--color-ink-2)">
            B
          </text>
          <text x={13} y={49} fontSize={9} fill="var(--color-ink-2)">
            A
          </text>
        </svg>
      </div>
    )
  }

  if (kind === 'bend') {
    // Seen from the side, to scale, side A on the left and turned the way it
    // will sit: a base under B tips it so B is level.
    const l = bendLayout(dims, bend)
    const steps = 48
    const q = l.base === 'b' ? -l.sign * l.turn : 0
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const p = bendFrameAt(l, (l.length * i) / steps).position
      return { x: p.x * Math.cos(q) - p.y * Math.sin(q), y: p.x * Math.sin(q) + p.y * Math.cos(q) }
    })
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const scale = Math.min(140 / Math.max(1, x1 - x0), 64 / Math.max(1, y1 - y0))
    const sx = (x: number) => 25 + (x - x0) * scale + (140 - (x1 - x0) * scale) / 2
    const sy = (y: number) => 80 - (y - y0) * scale
    const road = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join('')
    const first = pts[0]
    const last = pts[pts.length - 1]
    return (
      <div
        className="mb-3 grid h-[104px] place-items-center rounded border"
        style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-line)' }}
      >
        <svg width={190} height={92} viewBox="0 0 190 92" aria-hidden>
          {l.base !== 'none' && (
            <path
              d={`${road}L${sx(last.x).toFixed(1)} 84L${sx(first.x).toFixed(1)} 84Z`}
              fill="var(--color-track)"
              opacity={0.55}
            />
          )}
          <path d={road} stroke="var(--color-track)" strokeWidth={6} fill="none" />
          <text x={sx(first.x) - 12} y={sy(first.y) + 3} fontSize={9} fill="var(--color-ink-2)">
            A
          </text>
          <text x={sx(last.x) + 5} y={sy(last.y) + 3} fontSize={9} fill="var(--color-ink-2)">
            B
          </text>
        </svg>
      </div>
    )
  }

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
