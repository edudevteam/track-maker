import { useEffect, useState } from 'react'
import { TopBar } from './ui/TopBar'
import { Toolbar } from './ui/Toolbar'
import { PartDetails } from './ui/PartDetails'
import { AllParts } from './ui/AllParts'
import { StatusBar } from './ui/StatusBar'
import { ExportDialog } from './ui/ExportDialog'
import { DimensionsDialog } from './ui/DimensionsDialog'
import { BackgroundDialog } from './ui/BackgroundDialog'
import { VehicleDialog } from './ui/VehicleDialog'
import { PartsLibrary } from './ui/PartsLibrary'
import { CloseLoop } from './ui/CloseLoop'
import { Viewport, viewApi } from './scene/Viewport'
import { ViewTools } from './ui/ViewTools'
import { NavHint } from './ui/NavHint'
import { useProject } from './store/useProject'

export function App() {
  const [exporting, setExporting] = useState(false)
  const [library, setLibrary] = useState(false)
  const [dimensions, setDimensions] = useState(false)
  const [background, setBackground] = useState(false)
  const [vehicle, setVehicle] = useState(false)
  const loadCarLibrary = useProject((s) => s.loadCarLibrary)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const removeSelected = useProject((s) => s.removeSelected)
  const duplicateSelected = useProject((s) => s.duplicateSelected)
  const dropToWorkplane = useProject((s) => s.dropToWorkplane)
  const setTool = useProject((s) => s.setTool)
  const toggleGrid = useProject((s) => s.toggleGrid)
  const panels = useProject((s) => s.panels)
  // Picking the second open end with the closing tool puts a pair here, which is
  // what raises the part picker.
  const closure = useProject((s) => s.closure)
  const setClosure = useProject((s) => s.setClosure)

  const dialogOpen = exporting || library || dimensions || background || vehicle || !!closure

  // The car models are read once on start-up, so the Vehicle menu is populated
  // before it is opened. Reload in that dialog re-reads them.
  useEffect(() => {
    void loadCarLibrary()
  }, [loadCarLibrary])

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
        case 'l':
          setTool('close')
          break
        case 'a':
          setLibrary(true)
          break
        case 'd':
          dropToWorkplane()
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
  }, [
    undo,
    redo,
    removeSelected,
    duplicateSelected,
    dropToWorkplane,
    setTool,
    toggleGrid,
    dialogOpen,
  ])

  return (
    <div className="flex h-full flex-col">
      <TopBar
        onExport={() => setExporting(true)}
        onOpenDimensions={() => setDimensions(true)}
        onOpenBackground={() => setBackground(true)}
        onOpenVehicle={() => setVehicle(true)}
      />
      <Toolbar onAddPart={() => setLibrary(true)} />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <Viewport />
          {/* The panels stack down the left edge over the workplane. Settings ▸
              Show / Hide takes any of them off; with none left the stack goes too,
              so nothing sits over the viewport catching the pointer. */}
          {(panels.selectedPart || panels.allParts) && (
            <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-24px)] w-[268px] flex-col gap-2 overflow-y-auto">
              {panels.selectedPart && <PartDetails />}
              {panels.allParts && <AllParts />}
            </div>
          )}
          <ViewTools />
          <NavHint />
        </main>
      </div>
      <StatusBar />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {library && <PartsLibrary onClose={() => setLibrary(false)} />}
      {closure && <CloseLoop ends={closure} onClose={() => setClosure(null)} />}
      {dimensions && <DimensionsDialog onClose={() => setDimensions(false)} />}
      {background && <BackgroundDialog onClose={() => setBackground(false)} />}
      {vehicle && <VehicleDialog onClose={() => setVehicle(false)} />}
    </div>
  )
}
