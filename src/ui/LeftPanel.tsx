import { useState } from 'react'
import {
  Box,
  Car as CarIcon,
  Eye,
  EyeOff,
  Link2,
  Link2Off,
  Lock,
  Move3d,
  MousePointer2,
  Rotate3d,
  Unlock,
} from 'lucide-react'
import { useProject } from '../store/useProject'
import { Section, Segmented, Toggle } from './controls'
import type { ToolId } from '../types'

const TOOLS: { id: ToolId; icon: typeof MousePointer2; label: string; hint: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', hint: 'Click a piece to select it' },
  { id: 'move', icon: Move3d, label: 'Move', hint: 'Drag the handle to move the assembly' },
  { id: 'rotate', icon: Rotate3d, label: 'Rotate', hint: 'Spin the assembly about the handle' },
  { id: 'connect', icon: Link2, label: 'Connect', hint: 'Click two ends to join them' },
  { id: 'disconnect', icon: Link2Off, label: 'Disconnect', hint: 'Click a joined end to free it' },
]

const CURVE_ANGLES = [15, 30, 45, 90]

export function LeftPanel() {
  const tool = useProject((s) => s.tool)
  const setTool = useProject((s) => s.setTool)
  const snapToPort = useProject((s) => s.snapToPort)
  const setSnapToPort = useProject((s) => s.setSnapToPort)
  const addPiece = useProject((s) => s.addPiece)
  const dims = useProject((s) => s.dims)
  const dropCar = useProject((s) => s.dropCar)
  const car = useProject((s) => s.car)
  const setCar = useProject((s) => s.setCar)

  const [lanes, setLanes] = useState(1)
  const [length, setLength] = useState(dims.assembly.defaultStraightLength)
  const [radius, setRadius] = useState(120)

  return (
    <aside
      className="flex w-[228px] shrink-0 flex-col overflow-y-auto border-r"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <Section title="Tools">
        <div className="grid grid-cols-5 gap-1">
          {TOOLS.map((t) => {
            const Icon = t.icon
            const active = tool === t.id
            return (
              <button
                key={t.id}
                title={`${t.label} — ${t.hint}`}
                onClick={() => setTool(t.id)}
                className="grid h-[34px] place-items-center rounded border transition"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                  borderColor: active ? 'var(--color-accent)' : 'var(--color-line)',
                  color: active ? '#fff' : 'var(--color-ink)',
                }}
              >
                <Icon size={15} />
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
          {TOOLS.find((t) => t.id === tool)?.hint}
        </p>
      </Section>

      <Section title="Placement">
        <Toggle
          checked={snapToPort}
          onChange={setSnapToPort}
          label="Snap to selected end"
          hint={
            snapToPort
              ? 'New pieces attach to the highlighted end.'
              : 'New pieces land loose, away from the build.'
          }
        />
      </Section>

      <Section title="Add track">
        <div className="mb-2">
          <span className="tm-label mb-1 block">Width</span>
          <Segmented
            value={lanes}
            onChange={setLanes}
            options={[1, 2, 3, 4].map((n) => ({
              value: n,
              label: n === 1 ? 'Single' : `${n}×`,
              title: n === 1 ? 'Single track' : `${n} lanes wide, inner walls removed`,
            }))}
          />
        </div>

        <div className="mb-2">
          <span className="tm-label mb-1 block">Straight · length</span>
          <div className="mb-1.5 flex gap-1">
            {[50, 100, 150, 200].map((l) => (
              <button
                key={l}
                className="tm-btn flex-1 px-0"
                style={length === l ? { borderColor: 'var(--color-accent)' } : undefined}
                onClick={() => setLength(l)}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            className="tm-btn tm-btn-primary w-full"
            onClick={() => addPiece({ kind: 'straight', lanes, length, name: `Straight ${length}mm` })}
          >
            <Box size={13} /> Add straight
          </button>
        </div>

        <div>
          <span className="tm-label mb-1 block">Curve · radius {radius}mm</span>
          <input
            type="range"
            min={60}
            max={400}
            step={5}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="mb-1.5 w-full accent-[var(--color-accent)]"
          />
          <div className="grid grid-cols-4 gap-1">
            {CURVE_ANGLES.map((a) => (
              <button
                key={a}
                className="tm-btn px-0"
                title={`${a}° left turn — hold Shift for a right turn`}
                onClick={(e) =>
                  addPiece({
                    kind: 'curve',
                    lanes,
                    radius,
                    angleDeg: e.shiftKey ? -a : a,
                    name: `Curve ${a}°`,
                  })
                }
              >
                {a}°
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
            Shift-click for a right-hand turn.
          </p>
        </div>
      </Section>

      <Section title="Car">
        <button className="tm-btn w-full" onClick={dropCar}>
          <CarIcon size={13} /> Drop car on track
        </button>
        {car.pieceId && (
          <div className="mt-2 flex gap-1">
            <button className="tm-btn flex-1" onClick={() => setCar({ running: !car.running })}>
              {car.running ? 'Pause' : 'Run'}
            </button>
            <button
              className="tm-btn flex-1"
              onClick={() => setCar({ pieceId: null, running: false, s: 0, v: 0 })}
            >
              Remove
            </button>
          </div>
        )}
      </Section>

      <Outliner />
    </aside>
  )
}

function Outliner() {
  const pieces = useProject((s) => s.pieces)
  const selection = useProject((s) => s.selection)
  const select = useProject((s) => s.select)
  const updatePiece = useProject((s) => s.updatePiece)

  return (
    <Section title={`Browser · ${pieces.length} ${pieces.length === 1 ? 'body' : 'bodies'}`}>
      {!pieces.length && (
        <p className="text-[11.5px]" style={{ color: 'var(--color-ink-2)' }}>
          Nothing yet. Add a straight to start the build.
        </p>
      )}
      <ul className="space-y-[2px]">
        {pieces.map((p) => {
          const active = selection.pieceIds.includes(p.id)
          const joins = (p.links.a ? 1 : 0) + (p.links.b ? 1 : 0)
          return (
            <li key={p.id}>
              <div
                className="flex items-center gap-1.5 rounded px-1.5 py-1 transition"
                style={active ? { background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)' } : undefined}
              >
                <span
                  className="h-[10px] w-[10px] shrink-0 rounded-[2px]"
                  style={{ background: p.color }}
                />
                <button
                  className="min-w-0 flex-1 truncate text-left text-[12px]"
                  onClick={(e) => select([p.id], e.shiftKey)}
                  title={`${p.name} · ${p.lanes} lane${p.lanes > 1 ? 's' : ''} · ${joins}/2 joined`}
                >
                  {p.name}
                  <span className="ml-1" style={{ color: 'var(--color-ink-2)' }}>
                    {p.lanes > 1 ? `${p.lanes}×` : ''}
                  </span>
                </button>
                <button
                  className="opacity-60 hover:opacity-100"
                  title={p.locked ? 'Unlock' : 'Lock'}
                  onClick={() => updatePiece(p.id, { locked: !p.locked })}
                >
                  {p.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                <button
                  className="opacity-60 hover:opacity-100"
                  title={p.visible ? 'Hide' : 'Show'}
                  onClick={() => updatePiece(p.id, { visible: !p.visible })}
                >
                  {p.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
