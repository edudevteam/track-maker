import { useMemo } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import { useProject } from '../store/useProject'
import { computePrintVolume } from '../lib/printVolume'
import { useTheme } from '../store/useTheme'
import { formatValue, unitSuffix } from '../lib/units'

/**
 * Wraps the assembly in printer-sized boxes so you can read off how many build
 * plates the track needs. A run that overflows one box simply picks up another.
 */
export function PrintVolume() {
  const pieces = useProject((s) => s.pieces)
  const dims = useProject((s) => s.dims)
  const printer = useProject((s) => s.printer)
  const units = useProject((s) => s.units)
  const theme = useTheme((s) => s.theme)

  const result = useMemo(
    () => computePrintVolume(pieces, dims, printer.size),
    [pieces, dims, printer.size],
  )

  const [sx, sy, sz] = printer.size
  const box = useMemo(() => new THREE.BoxGeometry(sx, sy, sz), [sx, sy, sz])
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box])

  const edgeColor = theme === 'dark' ? '#7dd3fc' : '#0369a1'
  const plateColor = theme === 'dark' ? '#1e3a5f' : '#bae6fd'

  if (!result.cells.length) return null

  return (
    <group>
      {result.cells.map((cell, i) => (
        <group key={cell.key} position={cell.center}>
          <mesh geometry={box}>
            <meshBasicMaterial color={edgeColor} transparent opacity={0.05} depthWrite={false} />
          </mesh>
          <lineSegments geometry={edges}>
            <lineBasicMaterial color={edgeColor} transparent opacity={0.85} />
          </lineSegments>
          {/* Build platform at the floor of each box. */}
          <mesh position={[0, -sy / 2 + 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[sx, sz]} />
            <meshBasicMaterial
              color={plateColor}
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Text
            position={[-sx / 2 + 12, sy / 2 + 8, -sz / 2 + 12]}
            fontSize={10}
            color={edgeColor}
            anchorX="left"
            anchorY="bottom"
          >
            {`Plate ${i + 1} · ${formatValue(sx, units, 0)}×${formatValue(
              sz,
              units,
              0,
            )}×${formatValue(sy, units, 0)}${unitSuffix(units)}`}
          </Text>
        </group>
      ))}
    </group>
  )
}
