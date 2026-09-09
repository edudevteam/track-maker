import { useEffect, useState } from 'react'
import { TopBar } from './ui/TopBar'
import { Toolbar } from './ui/Toolbar'
import { PartDetails } from './ui/PartDetails'
import { AllParts } from './ui/AllParts'
import { StatusBar } from './ui/StatusBar'
import { ExportDialog } from './ui/ExportDialog'
import { DimensionsDialog } from './ui/DimensionsDialog'
import { BackgroundDialog } from './ui/BackgroundDialog'
import { PartsLibrary } from './ui/PartsLibrary'
import { Viewport, viewApi } from './scene/Viewport'
import { ViewTools } from './ui/ViewTools'
import { NavHint } from './ui/NavHint'
import { useProject } from './store/useProject'

export function App() {
  const [exporting, setExporting] = useState(false)
  const [library, setLibrary] = useState(false)
  const [dimensions, setDimensions] = useState(false)
  const [background, setBackground] = useState(false)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const removeSelected = useProject((s) => s.removeSelected)
  const duplicateSelected = useProject((s) => s.duplicateSelected)
  const repeatLastPart = useProject((s) => s.repeatLastPart)
  const setTool = useProject((s) => s.setTool)
  const toggleGrid = useProject((s) => s.toggleGrid)

  const dialogOpen = exporting || library || dimensions || background

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog owns the keyboard while it is up — it has its own handlers.
      if (dialogOpen) return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeSelected()
        return
      }
      if (mod) return
      switch (e.key.toLowerCase()) {
        case 'v':
          setTool('select')
          break
        case 'g':
          setTool('move')
          break
        case 'r':
          setTool('rotate')
          break
        case 'c':
          setTool('connect')
          break
        case 'x':
          setTool('disconnect')
          break
        case 'a':
          setLibrary(true)
          break
        case 't':
          repeatLastPart()
          break
        case 'h':
          viewApi?.home()
          break
        case 'f':
          viewApi?.frameSelected()
          break
        case '#':
          toggleGrid()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, removeSelected, duplicateSelected, repeatLastPart, setTool, toggleGrid, dialogOpen])

  return (
    <div className="flex h-full flex-col">
      <TopBar
        onExport={() => setExporting(true)}
        onOpenDimensions={() => setDimensions(true)}
        onOpenBackground={() => setBackground(true)}
      />
      <Toolbar onAddPart={() => setLibrary(true)} />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <Viewport />
          {/* The panels stack down the left edge over the workplane. */}
          <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-24px)] w-[268px] flex-col gap-2 overflow-y-auto">
            <PartDetails />
            <AllParts />
          </div>
          <ViewTools />
          <NavHint />
        </main>
      </div>
      <StatusBar />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {library && <PartsLibrary onClose={() => setLibrary(false)} />}
      {dimensions && <DimensionsDialog onClose={() => setDimensions(false)} />}
      {background && <BackgroundDialog onClose={() => setBackground(false)} />}
    </div>
  )
}
