import type { ReactNode } from 'react'
import {
  ArrowDownToLine,
  Car,
  Copy,
  Link2,
  Link2Off,
  Magnet,
  MousePointer2,
  Move,
  Plus,
  Redo2,
  Rotate3d,
  Spline,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useProject, vehicleLabel } from '../store/useProject'
import { BuildDetails } from './BuildDetails'
import { Tooltip } from './controls'
import type { ToolId } from '../types'

/** A steering wheel drawn in the lucide style — lucide has no icon for one. */
function SteeringWheel({ size = 15 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
      <path d="M2 12h7" />
      <path d="M15 12h7" />
      <path d="M12 15v7" />
    </svg>
  )
}

interface ModeSpec {
  id: ToolId
  icon: typeof MousePointer2
  label: string
  hint: string
  shortcut: string
}

/** Shortcuts here must match the key handler in `App.tsx`. */
const MODES: ModeSpec[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', hint: 'Click a piece to select it', shortcut: 'V' },
  { id: 'move', icon: Move, label: 'Move', hint: 'Drag the handle to move the assembly', shortcut: 'G' },
  { id: 'rotate', icon: Rotate3d, label: 'Rotate', hint: 'Spin the assembly about the handle', shortcut: 'R' },
]

const JOINTS: ModeSpec[] = [
  { id: 'connect', icon: Link2, label: 'Connect', hint: 'Click two ends to join them', shortcut: 'C' },
  {
    id: 'close',
    icon: Spline,
    label: 'Close Loop',
    hint: 'Click two open ends, then pick the part that fills the gap',
    shortcut: 'L',
  },
  {
    id: 'disconnect',
    icon: Link2Off,
    label: 'Disconnect',
    hint: 'Click a joined end to free it',
    shortcut: 'X',
  },
]

/**
 * The horizontal ribbon under the top bar: history, the parts button, the
 * modal tools, the joint tools and the build readout, each in its own group.
 */
export function Toolbar({ onAddPart }: { onAddPart: () => void }) {
  const tool = useProject((s) => s.tool)
  const setTool = useProject((s) => s.setTool)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const canUndo = useProject((s) => s.history.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const duplicateSelected = useProject((s) => s.duplicateSelected)
  const removeSelected = useProject((s) => s.removeSelected)
  const dropToWorkplane = useProject((s) => s.dropToWorkplane)
  const hasSelection = useProject((s) => s.selection.pieceIds.length > 0)
  const snapToPort = useProject((s) => s.snapToPort)
  const setSnapToPort = useProject((s) => s.setSnapToPort)
  const vehicle = useProject((s) => s.vehicle)
  const carModels = useProject((s) => s.carLibrary.models)
  const showVehicle = useProject((s) => s.showVehicle)
  const toggleVehicle = useProject((s) => s.toggleVehicle)
  const hasPieces = useProject((s) => s.pieces.length > 0)

  return (
    <div
      className="flex shrink-0 items-stretch gap-2 overflow-x-auto border-b px-3 py-1.5"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <Group>
        <Action label="Undo" hint="Step back one change" shortcut="⌘Z" onClick={undo} disabled={!canUndo}>
          <Undo2 size={15} />
        </Action>
        <Action label="Redo" hint="Step forward again" shortcut="⇧⌘Z" onClick={redo} disabled={!canRedo}>
          <Redo2 size={15} />
        </Action>
      </Group>

      <Group>
        <Tooltip title="Parts library" body="Pick a part and its width, then drop it on the workplane" shortcut="A">
          <button className="tm-btn tm-btn-orange h-[34px] px-2.5" onClick={onAddPart}>
            <Plus size={14} /> Add Part
          </button>
        </Tooltip>
      </Group>

      <Group>
        {MODES.map((t) => (
          <Mode key={t.id} {...t} active={tool === t.id} onClick={() => setTool(t.id)} />
        ))}
        <Action
          label="Duplicate"
          hint="Copy the selection onto the highlighted end, or loose when none is picked"
          shortcut="⌘D"
          onClick={duplicateSelected}
          disabled={!hasSelection}
        >
          <Copy size={15} />
        </Action>
        <Action
          label="Drop to workplane"
          hint={
            hasSelection
              ? 'Sit the bottom of the selected assembly on the workplane'
              : 'Sit the bottom of the whole build on the workplane'
          }
          shortcut="D"
          onClick={dropToWorkplane}
          disabled={!hasPieces}
        >
          <ArrowDownToLine size={15} />
        </Action>
        <Action
          label="Delete"
          hint="Remove the selected pieces"
          shortcut="⌫"
          onClick={removeSelected}
          disabled={!hasSelection}
          danger
        >
          <Trash2 size={15} />
        </Action>
      </Group>

      <Group>
        {JOINTS.map((t) => (
          <Mode key={t.id} {...t} active={tool === t.id} onClick={() => setTool(t.id)} />
        ))}
        <Latch
          label="Snap to selected end"
          hint={
            snapToPort
              ? 'On — new pieces attach to the highlighted end.'
              : 'Off — new pieces land loose, away from the build.'
          }
          active={snapToPort}
          onClick={() => setSnapToPort(!snapToPort)}
        >
          <Magnet size={15} />
        </Latch>
      </Group>

      <Group>
        <BuildDetails />
      </Group>

      <Group>
        <Latch
          label={`${vehicleLabel(carModels, vehicle)} on the track`}
          hint={
            showVehicle
              ? 'Shown — click to hide it. It keeps its place on the track.'
              : hasPieces
                ? 'Hidden — click to show it and let it run.'
                : 'Add a part first, then the vehicle has somewhere to sit.'
          }
          active={showVehicle}
          disabled={!hasPieces}
          onClick={toggleVehicle}
        >
          <Car size={15} />
        </Latch>
        <Tooltip title="Simulator" body="Under development.">
          <button
            aria-label="Simulator"
            aria-disabled
            onClick={() => {}}
            className="grid h-[34px] w-[34px] place-items-center rounded border opacity-45 transition"
            style={{
              background: 'var(--color-surface-2)',
              borderColor: 'var(--color-line)',
              color: 'var(--color-ink)',
            }}
          >
            <SteeringWheel />
          </button>
        </Tooltip>
      </Group>

      <div className="flex min-w-0 flex-1 items-center pl-1">
        <p className="truncate text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          {[...MODES, ...JOINTS].find((t) => t.id === tool)?.hint}
        </p>
      </div>
    </div>
  )
}

/** A bordered cluster of related buttons. Each button names itself on hover. */
function Group({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-[6px] border p-1"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
    >
      {children}
    </div>
  )
}

/** A tool that stays on until another is picked. */
function Mode({
  icon: Icon,
  label,
  hint,
  shortcut,
  active,
  onClick,
}: ModeSpec & { active: boolean; onClick: () => void }) {
  return (
    <Tooltip title={label} body={hint} shortcut={shortcut}>
      <button
        aria-label={`${label} tool`}
        aria-pressed={active}
        onClick={onClick}
        className="grid h-[34px] w-[34px] place-items-center rounded border transition"
        style={{
          background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
          borderColor: active ? 'var(--color-accent)' : 'var(--color-line)',
          color: active ? '#fff' : 'var(--color-ink)',
        }}
      >
        <Icon size={15} />
      </button>
    </Tooltip>
  )
}

/** A setting that stays on or off, lit the same way an active tool is. */
function Latch({
  label,
  hint,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  hint: string
  shortcut?: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip title={label} body={hint} shortcut={shortcut}>
      <button
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className="grid h-[34px] w-[34px] place-items-center rounded border transition disabled:opacity-45"
        style={{
          background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
          borderColor: active ? 'var(--color-accent)' : 'var(--color-line)',
          color: active ? '#fff' : 'var(--color-ink)',
        }}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/** A button that does its thing once and hands the mouse back. */
function Action({
  label,
  hint,
  shortcut,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  hint: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip title={label} body={hint} shortcut={shortcut}>
      <button
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className="tm-btn grid h-[34px] w-[34px] place-items-center px-0"
        style={danger && !disabled ? { color: '#d9534f' } : undefined}
      >
        {children}
      </button>
    </Tooltip>
  )
}
