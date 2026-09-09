import { useEffect } from 'react'
import { RotateCcw, X } from 'lucide-react'
import {
  useProject,
  DEFAULT_SKY_TOP,
  DEFAULT_SKY_BOTTOM,
  DEFAULT_SOLID_COLOR,
} from '../store/useProject'
import { themeBackground, useTheme } from '../store/useTheme'
import { ColorInput, Field, Segmented } from './controls'

/** One colour behind the grid, or two blended from top to bottom. */
type Kind = 'single' | 'double'

/**
 * What sits behind the workplane. Unlike Dimensions this edits live — a colour is
 * only worth picking while you can see it on the scene — so the dialog closes
 * rather than saving.
 *
 * An untouched project keeps the store's 'theme' mode, which follows the light or
 * dark theme. That reads as Single here, with the theme's own colour in the
 * field; picking any colour commits to it and the tracking stops. Reset puts it
 * back.
 */
export function BackgroundDialog({ onClose }: { onClose: () => void }) {
  const background = useProject((s) => s.background)
  const setBackground = useProject((s) => s.setBackground)
  const skyTop = useProject((s) => s.skyTop)
  const skyBottom = useProject((s) => s.skyBottom)
  const setSkyColors = useProject((s) => s.setSkyColors)
  const solidColor = useProject((s) => s.solidColor)
  const setSolidColor = useProject((s) => s.setSolidColor)
  const theme = useTheme((s) => s.theme)

  const kind: Kind = background === 'sky' ? 'double' : 'single'
  const first = background === 'sky' ? skyTop : background === 'theme' ? themeBackground(theme) : solidColor

  const setFirst = (v: string) => {
    if (kind === 'double') setSkyColors(v, skyBottom)
    else {
      setSolidColor(v)
      setBackground('solid')
    }
  }

  // The first colour carries across the switch, so Double only adds a second one.
  const setKind = (k: Kind) => {
    if (k === kind) return
    if (k === 'double') {
      setSkyColors(first, skyBottom)
      setBackground('sky')
    } else {
      setSolidColor(first)
      setBackground('solid')
    }
  }

  const isDefault =
    background === 'theme' &&
    skyTop === DEFAULT_SKY_TOP &&
    skyBottom === DEFAULT_SKY_BOTTOM &&
    solidColor === DEFAULT_SOLID_COLOR

  const reset = () => {
    setBackground('theme')
    setSkyColors(DEFAULT_SKY_TOP, DEFAULT_SKY_BOTTOM)
    setSolidColor(DEFAULT_SOLID_COLOR)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Background"
        className="flex max-h-full w-full max-w-[380px] flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <h2 className="text-[13px] font-semibold">Background</h2>
          <button className="tm-btn px-1.5 py-1" onClick={onClose} title="Close">
            <X size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="tm-section">
            <Segmented<Kind>
              value={kind}
              onChange={setKind}
              options={[
                { value: 'single', label: 'Single' },
                { value: 'double', label: 'Double' },
              ]}
            />
            <div className="mt-2.5">
              <Field label={kind === 'double' ? 'Top' : 'Colour'}>
                <ColorInput value={first} onChange={setFirst} />
              </Field>
              {/* Kept in place rather than hidden, so the dialog holds its shape
                  and the second colour is visible before Double is picked. */}
              <Field label="Bottom">
                <ColorInput
                  value={skyBottom}
                  disabled={kind !== 'double'}
                  onChange={(v) => setSkyColors(skyTop, v)}
                />
              </Field>
            </div>
          </div>
        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-3"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <button
            className="tm-btn"
            onClick={reset}
            disabled={isDefault}
            title="Put the background back to following the theme"
          >
            <RotateCcw size={13} />
            Reset
          </button>
          <button className="tm-btn tm-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
