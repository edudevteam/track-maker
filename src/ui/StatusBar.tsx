import * as THREE from 'three'
import { Grid3x3, Package, Target } from 'lucide-react'
import { useProject } from '../store/useProject'
import { VIEW_DIRECTIONS, viewApi } from '../scene/Viewport'
import { unitSuffix } from '../lib/units'

export function StatusBar() {
  const showGrid = useProject((s) => s.showGrid)
  const toggleGrid = useProject((s) => s.toggleGrid)
  const showPrintVolume = useProject((s) => s.showPrintVolume)
  const togglePrintVolume = useProject((s) => s.togglePrintVolume)
  const showPorts = useProject((s) => s.showPorts)
  const togglePorts = useProject((s) => s.togglePorts)
  const pieces = useProject((s) => s.pieces)
  const snapToPort = useProject((s) => s.snapToPort)
  const units = useProject((s) => s.units)

  const openEnds = pieces.reduce((n, p) => n + (p.links.a ? 0 : 1) + (p.links.b ? 0 : 1), 0)

  return (
    <footer
      className="flex h-[30px] shrink-0 items-center gap-1 border-t px-2 text-[11.5px]"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <Toggle active={showGrid} onClick={toggleGrid} icon={<Grid3x3 size={13} />} label="Grid" />
      <Toggle
        active={showPrintVolume}
        onClick={togglePrintVolume}
        icon={<Package size={13} />}
        label="Print area"
      />
      <Toggle active={showPorts} onClick={togglePorts} icon={<Target size={13} />} label="Ends" />

      <div className="mx-1 h-4 w-px" style={{ background: 'var(--color-line)' }} />

      {Object.entries(VIEW_DIRECTIONS).map(([name, dir]) => (
        <button
          key={name}
          className="rounded px-2 py-1 transition hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => viewApi?.setView(dir.clone() as THREE.Vector3)}
        >
          {name}
        </button>
      ))}
      <button
        className="rounded px-2 py-1 transition hover:bg-black/5 dark:hover:bg-white/10"
        onClick={() => viewApi?.frameAll()}
      >
        Fit
      </button>

      <div className="flex-1" />

      <span style={{ color: 'var(--color-ink-2)' }}>
        {pieces.length} piece{pieces.length === 1 ? '' : 's'} · {openEnds} open end
        {openEnds === 1 ? '' : 's'} · snap {snapToPort ? 'on' : 'off'} · {unitSuffix(units)}
      </span>
    </footer>
  )
}

function Toggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded px-2 py-1 transition"
      style={
        active
          ? { background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-accent)' }
          : { color: 'var(--color-ink-2)' }
      }
      title={`${label}: ${active ? 'on' : 'off'}`}
    >
      {icon}
      {label}
    </button>
  )
}
