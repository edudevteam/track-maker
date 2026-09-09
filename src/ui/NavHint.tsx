import { useEffect, useState } from 'react'
import { navState } from '../scene/Viewport'

/**
 * The navigation hint in the bottom-right of the workplane: a mouse with the
 * button you are holding lit up, and the camera move it is doing named above it.
 *
 * The mapping is OrbitControls' own — left drag orbits, right drag pans, wheel
 * or middle drag zooms — so the graphic reads as documentation of the mouse the
 * user already has in their hand.
 */

/** How far the pointer has to travel before a left press counts as an orbit. */
const DRAG_PX = 3
/** How long the wheel stays lit after the last notch, so a flick still registers. */
const WHEEL_HOLD_MS = 500

type NavAction = 'Rotate' | 'Zoom' | 'Pan'
type Region = 'left' | 'wheel' | 'right'

const REGION: Record<NavAction, Region> = { Rotate: 'left', Zoom: 'wheel', Pan: 'right' }

export function NavHint() {
  const [action, setAction] = useState<NavAction | null>(null)

  useEffect(() => {
    // Null when no button is down on the canvas; otherwise the button number.
    let held: number | null = null
    let startX = 0
    let startY = 0
    let wheelTimer: number | undefined

    // Only presses that land on the WebGL canvas drive the camera; a click on a
    // panel or a menu is somebody else's.
    const onViewport = (t: EventTarget | null) => t instanceof HTMLCanvasElement

    const onDown = (e: PointerEvent) => {
      if (!onViewport(e.target) || navState.gizmoDragging) return
      held = e.button
      startX = e.clientX
      startY = e.clientY
      if (e.button === 1) setAction('Zoom')
      else if (e.button === 2) setAction('Pan')
      // A left press waits for movement — a plain click only selects a part.
    }

    const onMove = (e: PointerEvent) => {
      if (held !== 0 || navState.gizmoDragging) return
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_PX) return
      setAction('Rotate')
    }

    const onUp = () => {
      if (held === null) return
      held = null
      setAction(null)
    }

    const onWheel = (e: WheelEvent) => {
      if (!onViewport(e.target)) return
      setAction('Zoom')
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => setAction(null), WHEEL_HOLD_MS)
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('wheel', onWheel, { passive: true })
    // Releasing outside the window never reports an up event.
    window.addEventListener('blur', onUp)
    return () => {
      window.clearTimeout(wheelTimer)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onUp)
    }
  }, [])

  const lit = action ? REGION[action] : null

  return (
    <div
      className="pointer-events-none absolute right-4 bottom-4 z-10 flex items-center gap-2.5"
      aria-hidden
    >
      <span className="tm-label">Workplane</span>
      <div className="relative">
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11px]
            font-medium whitespace-nowrap text-white transition-opacity duration-150"
          style={{
            bottom: 'calc(100% + 6px)',
            background: 'var(--color-accent)',
            opacity: action ? 1 : 0,
          }}
        >
          {action ?? ''}
        </div>
        <div
          className="rounded-lg border px-3 py-2 shadow-sm"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        >
          <Mouse lit={lit} />
        </div>
      </div>
    </div>
  )
}

/** The mouse itself: outline, two buttons and a wheel, with one region lit. */
function Mouse({ lit }: { lit: Region | null }) {
  const fill = (region: Region) =>
    lit === region ? 'var(--color-accent)' : 'transparent'

  return (
    <svg width={30} height={45} viewBox="0 0 36 54" fill="none">
      {/* Button faces sit under the outline so the strokes stay crisp. */}
      <path
        d="M18 1C9.7 1 3 7.7 3 16v6h15V1Z"
        fill={fill('left')}
        fillOpacity={0.85}
        style={{ transition: 'fill 120ms' }}
      />
      <path
        d="M18 1c8.3 0 15 6.7 15 15v6H18V1Z"
        fill={fill('right')}
        fillOpacity={0.85}
        style={{ transition: 'fill 120ms' }}
      />
      <path
        d="M18 1C9.7 1 3 7.7 3 16v22c0 8.3 6.7 15 15 15s15-6.7 15-15V16c0-8.3-6.7-15-15-15Z"
        stroke="var(--color-ink-2)"
        strokeWidth={1.6}
      />
      {/* Split between the two buttons, and the line they sit above. */}
      <path d="M3 22h30" stroke="var(--color-ink-2)" strokeWidth={1.6} />
      <path d="M18 1v8" stroke="var(--color-ink-2)" strokeWidth={1.6} />
      <rect
        x={14.6}
        y={8}
        width={6.8}
        height={13}
        rx={3.4}
        fill={fill('wheel')}
        stroke="var(--color-ink-2)"
        strokeWidth={1.6}
        style={{ transition: 'fill 120ms' }}
      />
    </svg>
  )
}
