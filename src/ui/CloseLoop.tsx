import { useEffect, useMemo, useState } from 'react'
import { Check, Link2, TriangleAlert, X } from 'lucide-react'
import { transitionName, useProject } from '../store/useProject'
import { Field, NumberInput, Segmented } from './controls'
import { CornerRoundingField, MAX_LANES, PartIcon, TaperField } from './PartsLibrary'
import { LengthInput, useUnits } from './units'
import { laneWidth, type Dimensions } from '../geometry/dimensions'
import { lanesAt } from '../geometry/parts'
import {
  maxFlatEnd,
  minFlatEnd,
  minTransitionLength,
  transitionCornerLimit,
} from '../geometry/transition'
import {
  fitOf,
  measureGap,
  score,
  suggestPart,
  widthNote,
  FIT_ANGLE_TOLERANCE,
  FIT_GAP_TOLERANCE,
  RADIUS_LIMITS,
  SPAN_LIMITS,
  SWEEP_LIMITS,
  type Fit,
  type Gap,
  type PortRef,
} from '../lib/closure'
import type { PartSpec, PieceKind } from '../types'

const KINDS: { kind: PieceKind; name: string; blurb: string }[] = [
  { kind: 'straight', name: 'Straight', blurb: 'Runs the ends together.' },
  { kind: 'curve', name: 'Curve', blurb: 'Turns one end round to the other.' },
  { kind: 'transition', name: 'Transition', blurb: 'Closes a change of width.' },
]

/**
 * The part that finishes a loop.
 *
 * Two open ends have been picked in the viewport; this measures the hole between
 * them and offers the parts that could fill it, each sized to the gap and marked
 * with whether it really closes it. A part that does not is still worth having —
 * it lands on the first end with its far end free, so the run can be worked out
 * from there — so nothing here is hidden, only labelled.
 */
export function CloseLoop({ ends, onClose }: { ends: { a: PortRef; b: PortRef }; onClose: () => void }) {
  const pieces = useProject((s) => s.pieces)
  const dims = useProject((s) => s.dims)
  const closeGap = useProject((s) => s.closeGap)
  const select = useProject((s) => s.select)
  const { fmt, val } = useUnits()

  const gap = useMemo(() => measureGap(pieces, ends.a, ends.b, dims), [pieces, ends, dims])

  // Whichever part comes closest to closing it is the one already picked.
  const [kind, setKind] = useState<PieceKind>(() => (gap ? bestKind(gap, dims) : 'straight'))
  const [edits, setEdits] = useState<Partial<PartSpec>>({})

  const pick = (next: PieceKind) => {
    setKind(next)
    setEdits({})
  }

  const spec = gap ? shaped({ ...suggestPart(kind, gap, dims), ...edits }, dims) : null
  const fit = gap && spec ? fitOf(spec, gap, dims) : null
  const step = gap && spec ? widthNote(spec, gap) : null
  const closes = !!gap && (!gap.sameRun || !!fit?.exact)

  const add = () => {
    if (!gap || !spec) return
    const id = closeGap(ends.a, ends.b, { ...spec, name: partName(spec, fmt) })
    if (id) select([id])
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

  const nameA = pieces.find((p) => p.id === ends.a.pieceId)?.name ?? 'one end'
  const nameB = pieces.find((p) => p.id === ends.b.pieceId)?.name ?? 'the other'

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
          <h2 className="text-[13px] font-semibold">Close the loop</h2>
          <button className="tm-btn px-1.5 py-1" onClick={onClose} aria-label="Close">
            <X size={13} />
          </button>
        </div>

        {!gap || !spec ? (
          <p className="p-4 text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
            Those two ends can no longer be measured. Pick them again.
          </p>
        ) : (
          <>
            <div
              className="border-b px-3 py-2.5 text-[11.5px] leading-snug"
              style={{ borderColor: 'var(--color-line)', color: 'var(--color-ink-2)' }}
            >
              <p>
                <span className="font-medium" style={{ color: 'var(--color-ink)' }}>
                  {nameA}
                </span>{' '}
                to{' '}
                <span className="font-medium" style={{ color: 'var(--color-ink)' }}>
                  {nameB}
                </span>{' '}
                — {fmt(gap.distance)} apart, {describeTurn(gap.turnDeg)}
                {Math.abs(gap.rise) > 0.05 && `, ${fmt(Math.abs(gap.rise))} ${gap.rise > 0 ? 'up' : 'down'}`}.
              </p>
              <p className="mt-0.5">
                {gap.sameRun
                  ? 'Both ends are on one run, so nothing can move to meet the part — it has to span the gap as it is.'
                  : 'Two separate runs, so the far one swings round to meet whatever part you pick.'}
              </p>
              {gap.sameRun && Math.abs(gap.rise) > 0.05 && (
                <p className="mt-0.5">
                  No part turns out of the workplane, so a gap with a rise in it cannot be closed by one.
                </p>
              )}
            </div>

            <div className="flex min-h-[286px]">
              <div className="w-[186px] shrink-0 border-r p-2" style={{ borderColor: 'var(--color-line)' }}>
                <span className="tm-label mb-1.5 block px-1">Fill it with</span>
                <div className="space-y-1">
                  {KINDS.map((part) => (
                    <KindButton
                      key={part.kind}
                      {...part}
                      active={kind === part.kind}
                      fit={fitOf(shaped(suggestPart(part.kind, gap, dims), dims), gap, dims)}
                      sameRun={gap.sameRun}
                      onClick={() => pick(part.kind)}
                    />
                  ))}
                </div>
              </div>

              <div className="min-w-0 flex-1 p-3">
                <FitBadge closes={closes} exact={!!fit?.exact} fit={fit} sameRun={gap.sameRun} />
                {step && (
                  <p className="mb-2 text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
                    {step}
                  </p>
                )}

                {kind === 'transition' ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <LaneField
                        label="Width at A"
                        lanes={spec.lanes}
                        onChange={(lanes) => setEdits((e) => ({ ...e, lanes }))}
                      />
                      <LaneField
                        label="Width at B"
                        lanes={spec.lanesB}
                        onChange={(lanesB) => setEdits((e) => ({ ...e, lanesB }))}
                      />
                    </div>
                    <Field label="Length">
                      <LengthInput
                        value={spec.length}
                        onChange={(length) => setEdits((e) => ({ ...e, length }))}
                        step={5}
                        min={minTransitionLength(dims)}
                        max={SPAN_LIMITS.max}
                      />
                    </Field>
                    <TaperField
                      length={spec.length}
                      value={spec.flatEnd}
                      onChange={(flatEnd) => setEdits((e) => ({ ...e, flatEnd }))}
                    />
                    <CornerRoundingField
                      value={spec.cornerRadius}
                      limit={transitionCornerLimit(dims, {
                        lanesA: spec.lanes,
                        lanesB: spec.lanesB,
                        length: spec.length,
                        flatEnd: spec.flatEnd,
                      })}
                      onChange={(cornerRadius) => setEdits((e) => ({ ...e, cornerRadius }))}
                    />
                  </>
                ) : kind === 'straight' ? (
                  <>
                    <LaneField
                      label="Width · lanes"
                      lanes={spec.lanes}
                      onChange={(lanes) => setEdits((e) => ({ ...e, lanes }))}
                    />
                    <Field label="Length" hint={`Fit is ${val(suggestPart('straight', gap, dims).length, 1)}.`}>
                      <LengthInput
                        value={spec.length}
                        onChange={(length) => setEdits((e) => ({ ...e, length }))}
                        step={5}
                        min={SPAN_LIMITS.min}
                        max={SPAN_LIMITS.max}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <LaneField
                      label="Width · lanes"
                      lanes={spec.lanes}
                      onChange={(lanes) => setEdits((e) => ({ ...e, lanes }))}
                    />
                    <Field label="Radius">
                      <LengthInput
                        value={spec.radius}
                        onChange={(radius) => setEdits((e) => ({ ...e, radius }))}
                        step={5}
                        min={RADIUS_LIMITS.min}
                        max={RADIUS_LIMITS.max}
                      />
                    </Field>
                    <Field label="Sweep">
                      <NumberInput
                        value={Math.abs(spec.angleDeg)}
                        onChange={(v) =>
                          setEdits((e) => ({
                            ...e,
                            angleDeg: Math.sign(spec.angleDeg || 1) * Math.min(SWEEP_LIMITS.max, Math.max(SWEEP_LIMITS.min, v)),
                          }))
                        }
                        step={1}
                        min={SWEEP_LIMITS.min}
                        max={SWEEP_LIMITS.max}
                        suffix="°"
                      />
                    </Field>
                    <Field label="Direction">
                      <Segmented<'left' | 'right'>
                        value={spec.angleDeg < 0 ? 'right' : 'left'}
                        onChange={(t) =>
                          setEdits((e) => ({
                            ...e,
                            angleDeg: (t === 'right' ? -1 : 1) * Math.abs(spec.angleDeg),
                          }))
                        }
                        options={[
                          { value: 'left', label: 'Left' },
                          { value: 'right', label: 'Right' },
                        ]}
                      />
                    </Field>
                  </>
                )}

                <button className="tm-btn w-full" onClick={() => setEdits({})}>
                  Back to the fitted size
                </button>
              </div>
            </div>

            <div
              className="flex items-center justify-between gap-2 border-t px-3 py-2.5"
              style={{ borderColor: 'var(--color-line)' }}
            >
              <span className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
                {closes
                  ? 'Both ends are joined and clipped.'
                  : 'Lands on the first end with its far end left open.'}
              </span>
              <button className="tm-btn tm-btn-primary" onClick={add}>
                <Link2 size={13} /> {closes ? 'Close with' : 'Add'} {partName(spec, fmt)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** One part in the list, with how near its fitted size comes to closing the gap. */
function KindButton({
  kind,
  name,
  blurb,
  active,
  fit,
  sameRun,
  onClick,
}: {
  kind: PieceKind
  name: string
  blurb: string
  active: boolean
  fit: Fit
  sameRun: boolean
  onClick: () => void
}) {
  const { fmt } = useUnits()
  const closes = !sameRun || fit.exact
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full items-center gap-2 rounded border p-1.5 text-left transition"
      style={{
        background: active ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'var(--color-surface-2)',
        borderColor: active ? 'var(--color-accent)' : 'var(--color-line)',
      }}
    >
      <PartIcon kind={kind} />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium">{name}</span>
        <span className="block text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          {closes ? blurb : missLabel(fit, fmt)}
        </span>
      </span>
    </button>
  )
}

/** Whether the part as configured closes the gap, and by how much it misses. */
function FitBadge({
  closes,
  exact,
  fit,
  sameRun,
}: {
  closes: boolean
  exact: boolean
  fit: Fit | null
  sameRun: boolean
}) {
  const { fmt } = useUnits()
  const good = closes
  return (
    <div
      className="mb-2.5 flex items-start gap-1.5 rounded border px-2 py-1.5 text-[11.5px] leading-snug"
      style={{
        borderColor: good ? 'var(--color-accent)' : 'var(--color-line)',
        background: good
          ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
          : 'var(--color-surface-2)',
      }}
    >
      {good ? <Check size={13} className="mt-[1px] shrink-0" /> : <TriangleAlert size={13} className="mt-[1px] shrink-0" />}
      <span>
        {exact
          ? 'Closes the gap exactly.'
          : good && !sameRun
            ? 'Closes the gap — the far run swings round to meet it.'
            : fit
              ? missSentence(fit, fmt)
              : 'Does not close the gap.'}
      </span>
    </div>
  )
}

/** One end's width. */
function LaneField({ label, lanes, onChange }: { label: string; lanes: number; onChange: (n: number) => void }) {
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

/** Hold a typed-over part inside what its own fields allow. */
function shaped(spec: PartSpec, dims: Dimensions): PartSpec {
  if (spec.kind !== 'transition') return spec
  const length = Math.max(spec.length, minTransitionLength(dims))
  const flatEnd = Math.min(Math.max(spec.flatEnd, minFlatEnd(dims)), maxFlatEnd(length))
  const limit = transitionCornerLimit(dims, {
    lanesA: spec.lanes,
    lanesB: spec.lanesB,
    length,
    flatEnd,
  })
  return { ...spec, length, flatEnd, cornerRadius: Math.min(Math.max(spec.cornerRadius, 0), limit) }
}

/**
 * The part to start on.
 *
 * Whatever spans the gap as it stands wins, since that leaves the rest of the
 * build where it is. Failing that: two separate runs can be swung together, so
 * anything closes them and the plainest part that matches the two widths is the
 * better opening offer; two ends of one run cannot, so the nearest miss is.
 */
function bestKind(gap: Gap, dims: Dimensions): PieceKind {
  const scored = KINDS
    // A transition between two ends of the same width has nothing to open, so it
    // is never the part to start on — it stays in the list to be picked.
    .filter(({ kind }) => kind !== 'transition' || gap.lanesA !== gap.lanesB)
    .map(({ kind }) => {
      const spec = shaped(suggestPart(kind, gap, dims), dims)
      // A step at either joint is a real cost, so a part that spans the gap but
      // lands on the wrong width loses to one that does both.
      const fit = fitOf(spec, gap, dims)
      return { kind, fit, miss: score(fit) + (widthNote(spec, gap) ? 0.5 : 0) }
    })
    .sort((x, y) => x.miss - y.miss)

  const spans = scored.find((s) => s.fit.exact)
  if (spans) return spans.kind
  if (!gap.sameRun) return gap.lanesA === gap.lanesB ? 'straight' : 'transition'
  return scored[0].kind
}

/** What the finished part is called, the way the parts library names them. */
function partName(spec: PartSpec, fmt: (mm: number, digits?: number) => string): string {
  if (spec.kind === 'curve') return `Curve ${Math.abs(spec.angleDeg).toFixed(0)}°`
  if (spec.kind === 'transition') return transitionName(lanesAt(spec, 'a'), lanesAt(spec, 'b'))
  return `Straight ${fmt(spec.length, 0)}`
}

type Fmt = (mm: number, digits?: number) => string

/** How far a part is off, short enough to sit under its name in the list. */
function missLabel(fit: Fit, fmt: Fmt): string {
  if (fit.gap <= FIT_GAP_TOLERANCE) return `${fit.angleDeg.toFixed(0)}° out`
  const short = `${fmt(fit.gap, 1)} short`
  return fit.angleDeg <= FIT_ANGLE_TOLERANCE ? short : `${short} · ${fit.angleDeg.toFixed(0)}° out`
}

/** The same miss, written out. */
function missSentence(fit: Fit, fmt: Fmt): string {
  const near = fit.gap <= FIT_GAP_TOLERANCE
  const square = fit.angleDeg <= FIT_ANGLE_TOLERANCE
  if (near) return `Reaches the far end, but points ${fit.angleDeg.toFixed(1)}° away from it.`
  if (square) return `Points the right way, but stops ${fmt(fit.gap)} short of the far end.`
  return `Stops ${fmt(fit.gap)} short of the far end, and ${fit.angleDeg.toFixed(1)}° off it.`
}

/** The turn between the two ends, in words. */
function describeTurn(turnDeg: number): string {
  if (Math.abs(turnDeg) < 0.5) return 'facing the same way'
  // At a half turn the two ends face each other, and left and right come to the
  // same heading — which way round the part goes is the part's business.
  if (Math.abs(turnDeg) > 179.5) return 'facing back the way it came'
  return `turning ${Math.abs(turnDeg).toFixed(0)}° ${turnDeg > 0 ? 'left' : 'right'}`
}
