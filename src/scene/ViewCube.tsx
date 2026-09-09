import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { GizmoViewcube, Line } from '@react-three/drei'
import { useTheme } from '../store/useTheme'

/** drei draws the cube as a unit box scaled by 60, so its half-extent is 30. */
const HALF = 30
/** Push the outline a hair outside the faces so it never z-fights with them. */
const EDGE = HALF + 0.35

/**
 * The twelve edges of the cube, as point pairs for a segmented line.
 */
function cubeEdges(r: number): [number, number, number][] {
  const c: [number, number, number][] = [
    [-r, -r, -r],
    [r, -r, -r],
    [r, -r, r],
    [-r, -r, r],
    [-r, r, -r],
    [r, r, -r],
    [r, r, r],
    [-r, r, r],
  ]
  const pairs: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0], // bottom
    [4, 5], [5, 6], [6, 7], [7, 4], // top
    [0, 4], [1, 5], [2, 6], [3, 7], // verticals
  ]
  return pairs.flatMap(([a, b]) => [c[a], c[b]])
}

/**
 * Soft drop shadow behind the cube.
 *
 * The gizmo group rotates with the camera, so anything off-origin would swing
 * around the cube. This sits *at* the origin as a billboard and carries its
 * offset inside the texture instead, which keeps the shadow falling down-right
 * on screen no matter how the model is orbited.
 */
function CubeShadow({ opacity }: { opacity: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    // Draw the source square off-canvas and let only its blurred shadow land in
    // view, so there is no hard edge peeking out from behind the cube.
    ctx.shadowColor = 'rgba(15, 23, 42, 0.5)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetX = 400
    ctx.fillStyle = '#000'
    ctx.fillRect(76 - 400, 80, 132, 132)
    return new THREE.CanvasTexture(canvas)
  }, [])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite scale={[104, 104, 1]} renderOrder={-1} raycast={() => null}>
      <spriteMaterial map={texture} transparent opacity={opacity} depthTest={false} depthWrite={false} />
    </sprite>
  )
}

/**
 * Orientation cube for the top-right gizmo, styled after the Fusion viewport
 * in `_plan/media/CAD-Tool-01-Full-CAD-View.png`: a white-grey box with thin
 * grey edges and a soft drop shadow.
 *
 * The cube names the faces; the axis directions are shown separately by the
 * corner triad in `AxisTriad`, which keeps this one uncluttered.
 */
export function ViewCube() {
  const theme = useTheme((s) => s.theme)
  const dark = theme === 'dark'

  const face = dark ? '#39414c' : '#ffffff'
  const line = dark ? '#aab2bc' : '#a7aeb6'
  const text = dark ? '#e9edf2' : '#4b525a'
  const hover = dark ? '#4a9eea' : '#2f7fd1'

  const points = useMemo(() => cubeEdges(EDGE), [])

  /*
    The canvas runs ACES tone mapping, which pulls pure white down to a light
    grey — fine for the model, wrong for a gizmo that is meant to read as a flat
    white box. drei builds the cube's six face materials itself, so the only way
    in is to walk the group afterwards and opt them out of tone mapping. Rerun it
    whenever the theme colours change, since that rebuilds the face textures.
  */
  const cube = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    cube.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (!m) return
      for (const mat of Array.isArray(m) ? m : [m]) mat.toneMapped = false
    })
  }, [face, text, line, hover])

  return (
    <group>
      <CubeShadow opacity={dark ? 0.5 : 0.32} />
      <group ref={cube}>
        <GizmoViewcube
          color={face}
          textColor={text}
          strokeColor={line}
          hoverColor={hover}
          font="bold 21px Inter var, Inter, system-ui, Arial, sans-serif"
        />
      </group>
      <Line
        points={points}
        segments
        color={line}
        lineWidth={1.6}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-4}
        raycast={() => null}
        frustumCulled={false}
      />
    </group>
  )
}
