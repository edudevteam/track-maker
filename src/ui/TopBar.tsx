import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Box,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Image,
  Moon,
  Printer,
  Redo2,
  Route,
  Ruler,
  Save,
  SlidersHorizontal,
  Sun,
  Undo2,
} from 'lucide-react'
import {
  PANEL_ITEMS,
  PRINTER_PRESETS,
  TRACK_TYPES,
  VEHICLE_TYPES,
  useProject,
  type BackgroundMode,
} from '../store/useProject'
import { useTheme } from '../store/useTheme'
import { UNIT_OPTIONS, unitLabel } from '../lib/units'
import { downloadBlob } from '../export/exporters'
import {
  PROJECT_FILE_EXT,
  ProjectParseError,
  parseProject,
  projectFileName,
  projectToBlob,
} from '../export/project'

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

const BACKGROUND_LABELS: Record<BackgroundMode, string> = {
  theme: 'Single · follows the theme',
  sky: 'Double',
  solid: 'Single',
}

export function TopBar({
  onExport,
  onOpenDimensions,
  onOpenBackground,
}: {
  onExport: () => void
  onOpenDimensions: () => void
  onOpenBackground: () => void
}) {
  const projectName = useProject((s) => s.projectName)
  const setProjectName = useProject((s) => s.setProjectName)
  const trackType = useProject((s) => s.trackType)
  const setTrackType = useProject((s) => s.setTrackType)
  const vehicle = useProject((s) => s.vehicle)
  const setVehicle = useProject((s) => s.setVehicle)
  const units = useProject((s) => s.units)
  const setUnits = useProject((s) => s.setUnits)
  const printer = useProject((s) => s.printer)
  const setPrinter = useProject((s) => s.setPrinter)
  const background = useProject((s) => s.background)
  const panels = useProject((s) => s.panels)
  const togglePanel = useProject((s) => s.togglePanel)
  const showPrintVolume = useProject((s) => s.showPrintVolume)
  const togglePrintVolume = useProject((s) => s.togglePrintVolume)
  const newProject = useProject((s) => s.newProject)
  const loadProject = useProject((s) => s.loadProject)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const canUndo = useProject((s) => s.history.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const { theme, toggle } = useTheme()

  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  // At most one top-bar menu is down at a time.
  const [openMenu, setOpenMenu] = useState<'file' | 'settings' | null>(null)

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

  const startNew = () => {
    if (useProject.getState().pieces.length && !window.confirm('Start a new project? The current build is discarded.'))
      return
    newProject()
    setNotice({ kind: 'ok', text: 'Started a new project' })
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

      <Menu
        label="File"
        open={openMenu === 'file'}
        onOpenChange={(v) => setOpenMenu(v ? 'file' : null)}
      >
        <MenuItem icon={<FilePlus2 size={13} />} label="New" onClick={startNew} />
        <MenuItem
          icon={<Save size={13} />}
          label="Save"
          shortcut="⌘S"
          hint={projectFileName(projectName)}
          onClick={save}
        />
        <MenuItem
          icon={<FolderOpen size={13} />}
          label="Open…"
          shortcut="⌘O"
          hint={`A ${PROJECT_FILE_EXT} project`}
          onClick={pickFile}
        />
        <MenuSeparator />
        <MenuItem icon={<Undo2 size={13} />} label="Undo" shortcut="⌘Z" onClick={undo} disabled={!canUndo} />
        <MenuItem icon={<Redo2 size={13} />} label="Redo" shortcut="⇧⌘Z" onClick={redo} disabled={!canRedo} />
      </Menu>

      <Menu
        label="Settings"
        open={openMenu === 'settings'}
        onOpenChange={(v) => setOpenMenu(v ? 'settings' : null)}
      >
        <Submenu icon={<Route size={13} />} label="Track">
          {TRACK_TYPES.map((t) => (
            <ChoiceItem
              key={t.value}
              label={t.label}
              checked={trackType === t.value}
              disabled={!t.enabled}
              onClick={() => setTrackType(t.value)}
            />
          ))}
        </Submenu>
        <Submenu icon={<Car size={13} />} label="Vehicle">
          {VEHICLE_TYPES.map((v) => (
            <ChoiceItem
              key={v.value}
              label={v.label}
              checked={vehicle === v.value}
              disabled={!v.enabled}
              onClick={() => setVehicle(v.value)}
            />
          ))}
        </Submenu>
        <Submenu icon={<Printer size={13} />} label="Print">
          <CheckItem
            icon={<Box size={13} />}
            label="Wrap track in print boxes"
            checked={showPrintVolume}
            onClick={togglePrintVolume}
          />
          <MenuSeparator />
          <Submenu icon={<Printer size={13} />} label="Printer" hint={printer.name}>
            {PRINTER_PRESETS.map((p) => (
              <ChoiceItem
                key={p.id}
                label={p.name}
                checked={printer.id === p.id}
                onClick={() => setPrinter(p.id)}
              />
            ))}
          </Submenu>
        </Submenu>
        <MenuSeparator />
        <Submenu
          icon={<Eye size={13} />}
          label="Show / Hide"
          hint={panelHint(PANEL_ITEMS.filter((p) => panels[p.value]).length, PANEL_ITEMS.length)}
        >
          {PANEL_ITEMS.map((p) => (
            <CheckItem
              key={p.value}
              icon={<EyeOff size={13} />}
              label={p.label}
              checked={panels[p.value]}
              onClick={() => togglePanel(p.value)}
            />
          ))}
        </Submenu>
        <MenuSeparator />
        <MenuItem
          icon={<Image size={13} />}
          label="Background…"
          hint={BACKGROUND_LABELS[background]}
          onClick={onOpenBackground}
        />
        <Submenu icon={<Ruler size={13} />} label="Units" hint={unitLabel(units)}>
          {UNIT_OPTIONS.map((u) => (
            <ChoiceItem
              key={u.value}
              label={u.label}
              checked={units === u.value}
              onClick={() => setUnits(u.value)}
            />
          ))}
        </Submenu>
        <MenuItem
          icon={<SlidersHorizontal size={13} />}
          label="Dimensions…"
          hint="Track profile, clip and assembly"
          onClick={onOpenDimensions}
        />
      </Menu>

      <div className="h-5 w-px" style={{ background: 'var(--color-line)' }} />

      <input
        className="tm-input max-w-[220px]"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        aria-label="Project name"
      />

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

/** How the Show / Hide row reads when the menu is shut — all shown, or how many. */
function panelHint(shown: number, total: number) {
  if (shown === total) return 'All shown'
  if (shown === 0) return 'All hidden'
  return `${shown} of ${total} shown`
}

/** A named drop-down in the top bar. Closes on Escape, on a pick, or on a click outside. */
function Menu({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string
  open: boolean
  onOpenChange: (v: boolean) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={ref} className="relative">
      <button
        className="tm-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          role="menu"
          // A pick closes the menu. A disabled item fires no click, so it stays open.
          onClick={() => onOpenChange(false)}
          className="absolute top-full left-0 z-40 mt-1 min-w-[214px] rounded-[6px] border p-1 shadow-lg"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  shortcut,
  hint,
  onClick,
  disabled,
}: {
  icon: ReactNode
  label: string
  shortcut?: string
  hint?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition
        enabled:hover:bg-black/5 disabled:opacity-45 dark:enabled:hover:bg-white/5"
    >
      <span className="shrink-0" style={{ color: 'var(--color-ink-2)' }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && (
          <span className="block truncate text-[10px]" style={{ color: 'var(--color-ink-2)' }}>
            {hint}
          </span>
        )}
      </span>
      {shortcut && (
        <span className="shrink-0 font-mono text-[10px]" style={{ color: 'var(--color-ink-2)' }}>
          {shortcut}
        </span>
      )}
    </button>
  )
}

function MenuSeparator() {
  return <div className="my-1 h-px" style={{ background: 'var(--color-line)' }} />
}

/**
 * A menu row that opens a panel of its own to the right on hover. The panel is a
 * child of the row's wrapper and touches it edge to edge — the gap you see is
 * padding inside the wrapper — so the pointer can cross into it without the
 * hover being broken.
 */
function Submenu({
  icon,
  label,
  hint,
  children,
}: {
  icon: ReactNode
  label: string
  /** What the submenu currently resolves to, shown under the label. */
  hint?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        // A pick closes the whole menu; opening a submenu must not.
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onFocus={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition
          hover:bg-black/5 dark:hover:bg-white/5"
        style={open ? { background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' } : undefined}
      >
        <span className="shrink-0" style={{ color: 'var(--color-ink-2)' }}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {hint && (
            <span className="block truncate text-[10px]" style={{ color: 'var(--color-ink-2)' }}>
              {hint}
            </span>
          )}
        </span>
        <ChevronRight size={13} style={{ color: 'var(--color-ink-2)' }} />
      </button>
      {open && (
        <div className="absolute left-full top-0 z-50 -mt-1 pl-1">
          <div
            role="menu"
            className="min-w-[150px] rounded-[6px] border p-1 shadow-lg"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

/** A setting that is simply on or off. A tick sits where the icon would, when on. */
function CheckItem({
  icon,
  label,
  checked,
  onClick,
}: {
  icon: ReactNode
  label: string
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition
        hover:bg-black/5 dark:hover:bg-white/5"
    >
      <span
        className="w-[13px] shrink-0"
        style={{ color: checked ? 'var(--color-accent)' : 'var(--color-ink-2)' }}
      >
        {checked ? <Check size={13} /> : icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

/** One of a set of mutually exclusive settings. The one in force carries a tick. */
function ChoiceItem({
  label,
  checked,
  disabled,
  onClick,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition
        enabled:hover:bg-black/5 disabled:opacity-45 dark:enabled:hover:bg-white/5"
    >
      <span className="w-[13px] shrink-0" style={{ color: 'var(--color-accent)' }}>
        {checked && <Check size={13} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {disabled && (
        <span className="shrink-0 text-[10px]" style={{ color: 'var(--color-ink-2)' }}>
          soon
        </span>
      )}
    </button>
  )
}
