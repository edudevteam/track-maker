import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Grid } from '@react-three/drei'
import { useTheme } from '../store/useTheme'

/** Half-extent of the ground plane, in millimetres. */
const HALF = 1200
/**
 * Axis and border lines sit just above the grid so they never z-fight it, and
 * far below the 6.05mm slab so a track piece still hides the axis beneath it.
 */
const LIFT = 0.2

/**
 * Ground plane in the style of the Fusion viewport (`_plan/media/CAD-Tool-01`).
 *
 * Three things make that grid read the way it does: it is a *bounded* square
 * with a visible border rather than a plane fading to nothing, the cell lines
 * are a pale grey with slightly darker lines every 100mm, and the two ground
 * axes are drawn in red and green through the origin.
 *
 * Axes follow the CAD convention the view cube uses: red is X (left to right),
 * green is Y (front to back), blue is Z (vertical). The scene is Y-up, so the
 * green ground axis runs along world Z and the blue axis is world up.
 *
 * The axes and the border are plain hairlines sharing one buffer, which is both
 * what the reference shows and one draw call.
 */
export function CadGrid() {
  const theme = useTheme((s) => s.theme)
  const dark = theme === 'dark'

  const cell = dark ? '#2b323b' : '#e4e7ea'
  const section = dark ? '#3b4551' : '#ced3d9'
  const border = dark ? '#4c5764' : '#bcc2c9'
  // Same hues as the view cube's tripod, a shade lighter so the grid stays calm:
  // red is X (left to right), green is Y (front to back, world Z in a Y-up scene).
  const axisX = dark ? '#b8514b' : '#e0574f'
  const axisY = dark ? '#3d9a4a' : '#3fb050'

  const geometry = useMemo(() => {
    const pos: number[] = []
    const col: number[] = []
    const seg = (a: [number, number, number], b: [number, number, number], hex: string) => {
      const c = new THREE.Color(hex)
      pos.push(...a, ...b)
      col.push(c.r, c.g, c.b, c.r, c.g, c.b)
    }

    const corners: [number, number, number][] = [
      [-HALF, LIFT, -HALF],
      [HALF, LIFT, -HALF],
      [HALF, LIFT, HALF],
      [-HALF, LIFT, HALF],
    ]
    corners.forEach((c, i) => seg(c, corners[(i + 1) % 4], border))

    seg([-HALF, LIFT, 0], [HALF, LIFT, 0], axisX)
    seg([0, LIFT, -HALF], [0, LIFT, HALF], axisY)

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [border, axisX, axisY])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group>
      <Grid
        args={[HALF * 2, HALF * 2]}
        cellSize={10}
        cellThickness={0.55}
        cellColor={cell}
        sectionSize={100}
        sectionThickness={0.9}
        sectionColor={section}
        fadeDistance={6000}
        fadeStrength={0}
        infiniteGrid={false}
        followCamera={false}
        side={2 /* THREE.DoubleSide — the grid stays visible from below */}
        position={[0, -0.05, 0]}
      />
      <lineSegments geometry={geometry} raycast={() => null}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
    </group>
  )
}
