import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList } from 'lucide-react'
import { useProject } from '../store/useProject'
import { Field } from './controls'
import { LengthInput, useUnits } from './units'
import { computePrintVolume } from '../lib/printVolume'
import type { Vec3 } from '../types'

const GAP = 6
const MARGIN = 8
/** Long enough to cross the gap between the button and the panel below it. */
const CLOSE_DELAY_MS = 160

/**
 * The build readout in the toolbar: footprint, height, piece count, printer and
 * plates needed. It hangs under its button on hover rather than opening a
 * dialog, and stays up while the pointer is on either one — the custom build
 * volume fields inside it are editable, so it cannot close the moment the
 * pointer leaves the button.
 */
export function BuildDetails() {
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  const open = useCallback(() => {
    window.clearTimeout(timer.current)
    const r = anchorRef.current?.getBoundingClientRect()
    if (r) setAt({ x: r.left + r.width / 2, y: r.bottom + GAP })
  }, [])

  // Leaving the button for the panel (or back) passes through the gap between
  // them, so closing waits a beat to see where the pointer landed.
  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setAt(null), CLOSE_DELAY_MS)
  }, [])

  const keepOpen = useCallback(() => window.clearTimeout(timer.current), [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Anything that moves the button out from under the pointer dismisses it.
  useEffect(() => {
    if (!at) return
    const hide = () => setAt(null)
    window.addEventListener('resize', hide)
    return () => window.removeEventListener('resize', hide)
  }, [at])

  // Nudge the panel back inside the window if centring pushed it off an edge.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el || !at) return
    el.style.transform = 'translateX(-50%)'
    const r = el.getBoundingClientRect()
    let dx = 0
    if (r.left < MARGIN) dx = MARGIN - r.left
    else if (r.right > window.innerWidth - MARGIN) dx = window.innerWidth - MARGIN - r.right
    if (dx) el.style.transform = `translateX(calc(-50% + ${dx}px))`
  }, [at])

  return (
    <div
      ref={anchorRef}
      onPointerEnter={(e) => e.pointerType === 'mouse' && open()}
      onPointerLeave={close}
      onFocus={open}
      onBlur={close}
    >
      <button
        aria-label="Build details"
        aria-expanded={!!at}
        onClick={() => (at ? close() : open())}
        className="tm-btn grid h-[34px] w-[34px] place-items-center px-0"
      >
        <ClipboardList size={15} />
      </button>
      {at &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Build details"
            className="fixed z-50 w-[248px] rounded-[6px] border shadow-lg"
            style={{
              left: at.x,
              top: at.y,
              transform: 'translateX(-50%)',
              background: 'var(--color-surface)',
              borderColor: 'var(--color-line)',
              color: 'var(--color-ink)',
            }}
            onPointerEnter={keepOpen}
            onPointerLeave={close}
          >
            <Body />
          </div>,
          document.body,
        )}
    </div>
  )
}

function Body() {
  const printer = useProject((s) => s.printer)
  const customSize = useProject((s) => s.customPrinterSize)
  const setCustomSize = useProject((s) => s.setCustomPrinterSize)
  const pieces = useProject((s) => s.pieces)
  const dims = useProject((s) => s.dims)
  const { suffix, val } = useUnits()

  const result = useMemo(
    () => computePrintVolume(pieces, dims, printer.size),
    [pieces, dims, printer.size],
  )

  return (
    <div className="p-2.5">
      <h2 className="mb-1.5 text-[11.5px] font-semibold">Build details</h2>
      {result.bounds ? (
        <dl className="space-y-1 text-[11.5px]">
          <Row
            label="Footprint"
            value={`${val(result.size[0], 1)} × ${val(result.size[2], 1)} ${suffix}`}
          />
          <Row label="Height" value={`${val(result.size[1], 1)} ${suffix}`} />
          <Row label="Pieces" value={String(pieces.length)} />
          <Row label="Printer" value={printer.name} />
          <Row
            label="Plates needed"
            value={`${result.cells.length} × ${val(printer.size[0], 0)}×${val(
              printer.size[2],
              0,
            )}×${val(printer.size[1], 0)}${suffix}`}
          />
        </dl>
      ) : (
        <p className="text-[11.5px]" style={{ color: 'var(--color-ink-2)' }}>
          Add track to see how much build volume it needs.
        </p>
      )}

      {printer.id === 'custom' && (
        <div className="mt-2.5 border-t pt-2" style={{ borderColor: 'var(--color-line)' }}>
          <p className="mb-1 text-[10.5px] font-semibold" style={{ color: 'var(--color-ink-2)' }}>
            Custom build volume
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['X', 'Y (height)', 'Z'] as const).map((label, i) => (
              <Field key={label} label={label}>
                <LengthInput
                  value={customSize[i]}
                  step={5}
                  min={20}
                  onChange={(v) => {
                    const next = [...customSize] as Vec3
                    next[i] = v
                    setCustomSize(next)
                  }}
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      <p className="mt-2 text-[10.5px] leading-snug" style={{ color: 'var(--color-ink-2)' }}>
        The printer and the print-box preview are set in Settings ▸ Print.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt style={{ color: 'var(--color-ink-2)' }}>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
