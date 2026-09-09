import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { X } from 'lucide-react'
import { useProject } from '../store/useProject'
import { Field, Section, Segmented, Toggle } from './controls'
import { downloadBlob, exportParts, type ExportFormat, type ExportPart } from '../export/exporters'
import { getConnectorGeometry, getTrackGeometry } from '../geometry/cache'
import { laneOffsets } from '../geometry/parts'
import { localPortFrame, pieceMatrix } from '../lib/ports'
import { ownsConnector } from '../lib/connectors'
import type { PortId } from '../types'

const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const pieces = useProject((s) => s.pieces)
  const dims = useProject((s) => s.dims)
  const selection = useProject((s) => s.selection)
  const projectName = useProject((s) => s.projectName)

  const [format, setFormat] = useState<ExportFormat>('3mf')
  const [scope, setScope] = useState<'all' | 'selected'>(selection.pieceIds.length ? 'selected' : 'all')
  const [includeConnectors, setIncludeConnectors] = useState(true)
  const [zUp, setZUp] = useState(true)
  const [busy, setBusy] = useState(false)

  const parts = useMemo(() => {
    const chosen = scope === 'selected' ? pieces.filter((p) => selection.pieceIds.includes(p.id)) : pieces
    const out: ExportPart[] = []
    for (const piece of chosen) {
      const matrix = pieceMatrix(piece)
      out.push({
        name: piece.name,
        geometry: getTrackGeometry(piece, dims),
        matrix,
        color: piece.color,
      })
      if (!includeConnectors) continue
      const connGeom = getConnectorGeometry(dims, dims.connector.length)
      for (const port of ['a', 'b'] as PortId[]) {
        if (!ownsConnector(piece, port)) continue
        const frame = localPortFrame(piece, port)
        const outward = X_AXIS.clone().applyQuaternion(frame.quaternion)
        const lateral = Z_AXIS.clone().applyQuaternion(frame.quaternion)
        const origin = frame.position.clone().addScaledVector(outward, -dims.connector.length / 2)
        origin.y = dims.assembly.fitClearance
        const offsets = laneOffsets(piece, dims)
        offsets.forEach((v, lane) => {
          const local = new THREE.Matrix4().compose(
            origin.clone().addScaledVector(lateral, v),
            frame.quaternion,
            new THREE.Vector3(1, 1, 1),
          )
          out.push({
            name:
              offsets.length > 1
                ? `${piece.name} clip ${port.toUpperCase()} lane ${lane + 1}`
                : `${piece.name} clip ${port.toUpperCase()}`,
            geometry: connGeom,
            matrix: matrix.clone().multiply(local),
            color: piece.connectorColor,
          })
        })
      }
    }
    return out
  }, [pieces, dims, selection.pieceIds, scope, includeConnectors])

  const triangles = useMemo(
    () =>
      parts.reduce((n, p) => {
        const idx = p.geometry.getIndex()
        return n + (idx ? idx.count : p.geometry.getAttribute('position').count) / 3
      }, 0),
    [parts],
  )

  const run = () => {
    if (!parts.length) return
    setBusy(true)
    // Let the button repaint as disabled before the (synchronous) export runs.
    setTimeout(() => {
      try {
        const blob = exportParts(parts, format, zUp)
        const safe = projectName.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-') || 'track'
        downloadBlob(blob, `${safe}.${format}`)
        onClose()
      } finally {
        setBusy(false)
      }
    }, 0)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[380px] overflow-hidden rounded-lg border shadow-2xl"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-3 py-2.5"
          style={{ borderColor: 'var(--color-line)' }}
        >
          <h2 className="text-[13px] font-semibold">Export for printing</h2>
          <button className="tm-btn px-1.5 py-1" onClick={onClose}>
            <X size={13} />
          </button>
        </div>

        <Section title="Format">
          <Segmented<ExportFormat>
            value={format}
            onChange={setFormat}
            options={[
              { value: '3mf', label: '3MF', title: 'Keeps per-part colour' },
              { value: 'stl', label: 'STL', title: 'Binary STL, one merged solid' },
              { value: 'obj', label: 'OBJ', title: 'Named groups per part' },
            ]}
          />
          <p className="mt-1.5 text-[10.5px]" style={{ color: 'var(--color-ink-2)' }}>
            {format === '3mf' && 'One object per part with its colour, ready for a multi-material slicer.'}
            {format === 'stl' && 'Binary STL. Colour is not carried in the file.'}
            {format === 'obj' && 'Wavefront OBJ with a named group per part.'}
          </p>
        </Section>

        <Section title="Contents">
          <Field label="Scope">
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all' as const, label: `All (${pieces.length})` },
                { value: 'selected' as const, label: `Selected (${selection.pieceIds.length})` },
              ]}
            />
          </Field>
          <Toggle checked={includeConnectors} onChange={setIncludeConnectors} label="Include connector clips" />
          <Toggle
            checked={zUp}
            onChange={setZUp}
            label="Z up"
            hint="Rotates the model so it lands flat in the slicer."
          />
        </Section>

        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <span className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
            {parts.length} part{parts.length === 1 ? '' : 's'} · {Math.round(triangles).toLocaleString()} triangles
          </span>
          <button className="tm-btn tm-btn-primary" onClick={run} disabled={!parts.length || busy}>
            {busy ? 'Exporting…' : `Download .${format}`}
          </button>
        </div>
      </div>
    </div>
  )
}
