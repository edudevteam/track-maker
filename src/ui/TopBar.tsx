import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, Moon, Redo2, Save, Sun, Trash2, Undo2 } from 'lucide-react'
import { useProject } from '../store/useProject'
import { useTheme } from '../store/useTheme'
import { downloadBlob } from '../export/exporters'
import {
  PROJECT_FILE_EXT,
  ProjectParseError,
  parseProject,
  projectFileName,
  projectToBlob,
} from '../export/project'
import type { TrackType } from '../types'

const TRACK_TYPES: { value: TrackType; label: string; enabled: boolean }[] = [
  { value: 'car', label: 'Car Track', enabled: true },
  { value: 'marble', label: 'Marble Run', enabled: false },
]

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

export function TopBar({ onExport }: { onExport: () => void }) {
  const projectName = useProject((s) => s.projectName)
  const setProjectName = useProject((s) => s.setProjectName)
  const trackType = useProject((s) => s.trackType)
  const setTrackType = useProject((s) => s.setTrackType)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const clearAll = useProject((s) => s.clearAll)
  const loadProject = useProject((s) => s.loadProject)
  const canUndo = useProject((s) => s.history.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const { theme, toggle } = useTheme()

  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const save = () => {
    const s = useProject.getState()
    const filename = projectFileName(s.projectName)
    downloadBlob(projectToBlob(s), filename)
    setNotice({ kind: 'ok', text: `Saved ${filename}` })
  }

  const pickFile = () => {
    // Opening replaces the whole build, and there is no autosave to fall back on.
    if (useProject.getState().pieces.length && !window.confirm('Open a project? The current build is replaced.')) return
    fileInput.current?.click()
  }

  const readFile = async (file: File) => {
    try {
      const doc = parseProject(await file.text())
      loadProject(doc)
      setNotice({
        kind: 'ok',
        text: `Opened ${doc.name} — ${doc.pieces.length} piece${doc.pieces.length === 1 ? '' : 's'}`,
      })
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof ProjectParseError ? err.message : 'That file could not be read.',
      })
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        save()
      } else if (key === 'o') {
        e.preventDefault()
        pickFile()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header
      className="relative flex h-[46px] shrink-0 items-center gap-3 border-b px-3"
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

      <div className="h-5 w-px" style={{ background: 'var(--color-line)' }} />

      <button className="tm-btn" onClick={save} title={`Save ${projectFileName(projectName)} (⌘S)`}>
        <Save size={14} />
      </button>
      <button className="tm-btn" onClick={pickFile} title={`Open a ${PROJECT_FILE_EXT} project (⌘O)`}>
        <FolderOpen size={14} />
      </button>
      <input
        ref={fileInput}
        type="file"
        accept={`${PROJECT_FILE_EXT},application/json`}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset first, so picking the same file twice in a row still fires.
          e.target.value = ''
          if (file) void readFile(file)
        }}
      />

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

      {notice && (
        <div
          className="absolute left-3 top-full z-40 mt-1 rounded-[6px] border px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{
            background: 'var(--color-surface)',
            borderColor: notice.kind === 'error' ? '#d9534f' : 'var(--color-line)',
            color: notice.kind === 'error' ? '#d9534f' : 'var(--color-ink-2)',
          }}
          role="status"
        >
          {notice.text}
        </div>
      )}
    </header>
  )
}
