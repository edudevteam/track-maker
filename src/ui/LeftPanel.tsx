import { Car as CarIcon, Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import { useProject } from '../store/useProject'
import { Section } from './controls'

export function LeftPanel() {
  const dropCar = useProject((s) => s.dropCar)
  const car = useProject((s) => s.car)
  const setCar = useProject((s) => s.setCar)

  return (
    <aside
      className="flex w-[228px] shrink-0 flex-col overflow-y-auto border-r"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
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
          Nothing yet. Add a part to start the build.
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
