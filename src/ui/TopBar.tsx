import { Download, Moon, Redo2, Sun, Trash2, Undo2 } from 'lucide-react'
import { useProject } from '../store/useProject'
import { useTheme } from '../store/useTheme'
import type { TrackType } from '../types'

const TRACK_TYPES: { value: TrackType; label: string; enabled: boolean }[] = [
  { value: 'car', label: 'Car Track', enabled: true },
  { value: 'marble', label: 'Marble Run', enabled: false },
]

export function TopBar({ onExport }: { onExport: () => void }) {
  const projectName = useProject((s) => s.projectName)
  const setProjectName = useProject((s) => s.setProjectName)
  const trackType = useProject((s) => s.trackType)
  const setTrackType = useProject((s) => s.setTrackType)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const clearAll = useProject((s) => s.clearAll)
  const canUndo = useProject((s) => s.history.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const { theme, toggle } = useTheme()

  return (
    <header
      className="flex h-[46px] shrink-0 items-center gap-3 border-b px-3"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
    >
      <div className="flex items-center gap-2 pr-1">
        <div
          className="grid h-[26px] w-[26px] place-items-center rounded-[6px] font-bold text-white"
          style={{ background: 'var(--color-track)' }}
        >
          T
        </div>
        <span className="text-[14px] font-semibold tracking-tight">Track Maker</span>
      </div>

      <div className="h-5 w-px" style={{ background: 'var(--color-line)' }} />

      <input
        className="tm-input max-w-[220px]"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        aria-label="Project name"
      />

      <select
        className="tm-input max-w-[150px]"
        value={trackType}
        onChange={(e) => setTrackType(e.target.value as TrackType)}
        aria-label="Track type"
      >
        {TRACK_TYPES.map((t) => (
          <option key={t.value} value={t.value} disabled={!t.enabled}>
            {t.label}
            {t.enabled ? '' : ' (soon)'}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      <button className="tm-btn" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
        <Undo2 size={14} />
      </button>
      <button className="tm-btn" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
        <Redo2 size={14} />
      </button>
      <button className="tm-btn" onClick={clearAll} title="Clear the build">
        <Trash2 size={14} />
      </button>

      <div className="h-5 w-px" style={{ background: 'var(--color-line)' }} />

      <button className="tm-btn" onClick={toggle} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
        {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
      </button>

      <button className="tm-btn tm-btn-primary" onClick={onExport}>
        <Download size={14} />
        Export
      </button>
    </header>
  )
}
