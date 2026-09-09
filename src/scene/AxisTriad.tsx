import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/** The whole triad is drawn at two-thirds size, so it reads as a quiet corner
 *  marker rather than a second gizmo competing with the view cube. */
const SCALE = 2 / 3
/** Length of the plain part of each arrow, before the head. */
const SHAFT = 32
/** Radius of the shaft. */
const SHAFT_R = 2.2
/** Cone head at the tip of each arrow. */
const HEAD = 15
const HEAD_R = 6.2
/** Gap between the tip of the head and the letter sitting past it. */
const LABEL_GAP = 11

/**
 * A single axis letter, drawn to a canvas so it needs no font download.
 */
function AxisLabel({ color, text, position }: { color: string; text: string; position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.font = '42px Inter var, Inter, system-ui, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(text, 32, 34)
    return new THREE.CanvasTexture(canvas)
  }, [text, color])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite position={position} scale={[17, 17, 1]} raycast={() => null}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  )
}

/**
 * One arrow: shaft, cone head, and the letter past the tip.
 *
 * Built pointing along local +Y — the axis three.js gives cylinders and cones —
 * and swung onto the world axis it belongs to by the caller's rotation.
 */
function Arrow({ color, label, rotation }: { color: string; label: string; rotation: [number, number, number] }) {
  return (
    <group rotation={rotation}>
      <mesh position={[0, SHAFT / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, SHAFT + HEAD / 2, 0]} raycast={() => null}>
        <coneGeometry args={[HEAD_R, HEAD, 18]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <AxisLabel color={color} text={label} position={[0, SHAFT + HEAD + LABEL_GAP, 0]} />
    </group>
  )
}

/**
 * Corner axis indicator: three labelled arrows that turn with the camera, so the
 * current heading is readable at a glance without hunting for the view cube.
 *
 * Axes follow the CAD convention the grid and the view cube already use — red X
 * left to right, green Y front to back, blue Z vertical. The scene itself is
 * Y-up, so each arrow is swung onto the world axis carrying its direction: Z
 * onto world up, Y onto world −Z, which keeps the frame right-handed.
 */
export function AxisTriad() {
  return (
    <group scale={SCALE}>
      <Arrow color="#e0342c" label="X" rotation={[0, 0, -Math.PI / 2]} />
      <Arrow color="#1faa33" label="Y" rotation={[-Math.PI / 2, 0, 0]} />
      <Arrow color="#2f6fe0" label="Z" rotation={[0, 0, 0]} />
    </group>
  )
}
