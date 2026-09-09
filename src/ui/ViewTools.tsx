import type { ReactNode } from 'react'
import { Focus, Home } from 'lucide-react'
import { useProject } from '../store/useProject'
import { viewApi } from '../scene/Viewport'
import { Tooltip } from './controls'

/**
 * The two round buttons that sit under the navigation cube in the top-right of
 * the workplane. The cube gizmo is centred 76px in from the top and right edges
 * and reaches about 52px out from there when it is turned corner-on, so the
 * stack starts just clear of that and shares the cube's centre line.
 */
const CUBE_MARGIN = 76
const BUTTON = 34

export function ViewTools() {
  const hasSelection = useProject((s) => s.selection.pieceIds.length > 0)

  return (
    <div
      className="pointer-events-none absolute z-10 flex flex-col items-center gap-2"
      style={{ top: CUBE_MARGIN + 54, right: CUBE_MARGIN - BUTTON / 2 }}
    >
      <Round label="Home" hint="Back to the default view" shortcut="H" onClick={() => viewApi?.home()}>
        <Home size={15} />
      </Round>
      <Round
        label="Fit Selected"
        hint="Zoom in on the selected part"
        shortcut="F"
        onClick={() => viewApi?.frameSelected()}
        disabled={!hasSelection}
      >
        <Focus size={15} />
      </Round>
    </div>
  )
}

function Round({
  label,
  hint,
  shortcut,
  onClick,
  disabled,
  children,
}: {
  label: string
  hint: string
  shortcut: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip title={label} body={hint} shortcut={shortcut} className="pointer-events-auto">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="tm-btn rounded-full p-0 shadow-sm"
        style={{ width: BUTTON, height: BUTTON }}
      >
        {children}
      </button>
    </Tooltip>
  )
}
