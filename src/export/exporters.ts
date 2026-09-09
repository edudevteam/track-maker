import * as THREE from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { zipSync, strToU8 } from 'fflate'

export type ExportFormat = 'obj' | 'stl' | '3mf'

export interface ExportPart {
  name: string
  geometry: THREE.BufferGeometry
  /** World transform to bake into the exported geometry. */
  matrix: THREE.Matrix4
  color: string
}

/** Y-up (scene) to Z-up (printer/CAD) so parts land the right way in a slicer. */
const Y_TO_Z = new THREE.Matrix4().makeRotationX(Math.PI / 2)

function bake(part: ExportPart, zUp: boolean): THREE.BufferGeometry {
  const g = part.geometry.clone()
  g.applyMatrix4(part.matrix)
  if (zUp) g.applyMatrix4(Y_TO_Z)
  return g
}

function toGroup(parts: ExportPart[], zUp: boolean): THREE.Group {
  const group = new THREE.Group()
  for (const part of parts) {
    const mesh = new THREE.Mesh(
      bake(part, zUp),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(part.color) }),
    )
    mesh.name = part.name
    group.add(mesh)
  }
  return group
}

function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    if (m.material) (m.material as THREE.Material).dispose()
  })
}

export function exportOBJ(parts: ExportPart[], zUp = true): Blob {
  const group = toGroup(parts, zUp)
  const text = new OBJExporter().parse(group)
  disposeGroup(group)
  return new Blob([text], { type: 'model/obj' })
}

export function exportSTL(parts: ExportPart[], zUp = true, binary = true): Blob {
  const group = toGroup(parts, zUp)
  const result = new STLExporter().parse(group, { binary }) as unknown
  disposeGroup(group)
  if (binary) return new Blob([(result as DataView).buffer as ArrayBuffer], { type: 'model/stl' })
  return new Blob([result as string], { type: 'model/stl' })
}

const xmlEscape = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)

/**
 * 3MF `displaycolor` is sRGB. THREE.Color converts to the linear working space
 * on construction, so read it back through sRGB rather than off .r/.g/.b —
 * otherwise every exported colour comes out noticeably darker than authored.
 */
const hex8 = (color: string) =>
  `#${new THREE.Color(color).getHexString(THREE.SRGBColorSpace).toUpperCase()}FF`

/**
 * Writes a 3MF package by hand: an OPC zip holding the content types, the root
 * relationship and one model part. Each exported part becomes its own object
 * with a base material, so colours survive into the slicer.
 */
export function export3MF(parts: ExportPart[], zUp = true): Blob {
  const materials = parts
    .map((p, i) => `      <base name="${xmlEscape(p.name)}" displaycolor="${hex8(p.color)}"/>${i === parts.length - 1 ? '' : ''}`)
    .join('\n')

  const objects: string[] = []
  const items: string[] = []

  parts.forEach((part, i) => {
    const geom = bake(part, zUp)
    const nonIndexed = geom.index ? geom.toNonIndexed() : geom
    const pos = nonIndexed.getAttribute('position')

    // Weld coincident vertices so the 3MF mesh validates as a closed solid.
    const map = new Map<string, number>()
    const verts: number[] = []
    const tris: number[] = []
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v)
      const y = pos.getY(v)
      const z = pos.getZ(v)
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
      let idx = map.get(key)
      if (idx === undefined) {
        idx = verts.length / 3
        map.set(key, idx)
        verts.push(x, y, z)
      }
      tris.push(idx)
    }

    const vXml: string[] = []
    for (let v = 0; v < verts.length; v += 3) {
      vXml.push(`<vertex x="${verts[v].toFixed(5)}" y="${verts[v + 1].toFixed(5)}" z="${verts[v + 2].toFixed(5)}"/>`)
    }
    const tXml: string[] = []
    for (let t = 0; t < tris.length; t += 3) {
      if (tris[t] === tris[t + 1] || tris[t + 1] === tris[t + 2] || tris[t] === tris[t + 2]) continue
      tXml.push(`<triangle v1="${tris[t]}" v2="${tris[t + 1]}" v3="${tris[t + 2]}"/>`)
    }

    const id = i + 2
    objects.push(
      `    <object id="${id}" type="model" pid="1" pindex="${i}" name="${xmlEscape(part.name)}">\n` +
        `      <mesh>\n        <vertices>${vXml.join('')}</vertices>\n` +
        `        <triangles>${tXml.join('')}</triangles>\n      </mesh>\n    </object>`,
    )
    items.push(`    <item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`)
    if (nonIndexed !== geom) nonIndexed.dispose()
    geom.dispose()
  })

  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n` +
    `  <resources>\n    <basematerials id="1">\n${materials}\n    </basematerials>\n` +
    `${objects.join('\n')}\n  </resources>\n  <build>\n${items.join('\n')}\n  </build>\n</model>\n`

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
    `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
    `  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n` +
    `</Types>\n`

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
    `  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n` +
    `</Relationships>\n`

  const zipped = zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      '3D/3dmodel.model': strToU8(model),
    },
    { level: 6 },
  )
  return new Blob([zipped as unknown as BlobPart], { type: 'model/3mf' })
}

export function exportParts(parts: ExportPart[], format: ExportFormat, zUp = true): Blob {
  if (format === 'obj') return exportOBJ(parts, zUp)
  if (format === 'stl') return exportSTL(parts, zUp)
  return export3MF(parts, zUp)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
