import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, GizmoHelper, OrbitControls, TransformControls } from '@react-three/drei'
import { useProject } from '../store/useProject'
import { useTheme } from '../store/useTheme'
import { PieceMesh } from './PieceMesh'
import { PrintVolume } from './PrintVolume'
import { Car } from './Car'
import { SkyDome } from './SkyDome'
import { ViewCube } from './ViewCube'
import { AxisTriad } from './AxisTriad'
import { CadGrid } from './CadGrid'
import { localPortFrame, pieceMidpoint, pieceQuaternion } from '../lib/ports'
import type { Piece } from '../types'
import { collectGroup } from '../store/useProject'

export function Viewport() {
  const theme = useTheme((s) => s.theme)
  const showGrid = useProject((s) => s.showGrid)
  const showPrintVolume = useProject((s) => s.showPrintVolume)
  const pieces = useProject((s) => s.pieces)
  const select = useProject((s) => s.select)
  const background = useProject((s) => s.background)
  const skyTop = useProject((s) => s.skyTop)
  const skyBottom = useProject((s) => s.skyBottom)
  const solidColor = useProject((s) => s.solidColor)

  // Near-white in light mode, matching the Fusion viewport the grid is styled after.
  const themeBg = theme === 'dark' ? '#161a20' : '#fafbfc'
  // The sky dome paints the backdrop itself; the clear colour just avoids a flash.
  const bg = background === 'solid' ? solidColor : themeBg

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [240, 190, 260], fov: 40, near: 1, far: 20000 }}
      onPointerMissed={() => select([])}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={[bg]} />
      {background === 'sky' && <SkyDome top={skyTop} bottom={skyBottom} />}
      <hemisphereLight intensity={theme === 'dark' ? 0.5 : 0.8} groundColor={bg} />
      <directionalLight
        position={[300, 500, 250]}
        intensity={theme === 'dark' ? 1.6 : 2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-600}
        shadow-camera-right={600}
        shadow-camera-top={600}
        shadow-camera-bottom={-600}
        shadow-camera-far={2000}
      />
      <directionalLight position={[-250, 200, -200]} intensity={0.35} />
      <Environment preset="city" environmentIntensity={0.25} />

      {showGrid && <CadGrid />}

      {pieces.map((p) => (
        <PieceMesh key={p.id} piece={p} />
      ))}

      {showPrintVolume && <PrintVolume />}
      <Car />
      <Gizmo />

      <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxDistance={6000} minDistance={20} />
      <GizmoHelper alignment="top-right" margin={[76, 76]}>
        <ViewCube />
      </GizmoHelper>
      {/*
        A second HUD layer for the corner axis triad. Its render priority has to
        sit above the cube's: the first layer is the one that draws the main
        scene, and every later one just clears depth and stacks on top.
      */}
      <GizmoHelper alignment="bottom-left" margin={[76, 76]} renderPriority={2}>
        <AxisTriad />
      </GizmoHelper>
      <CameraBridge />
    </Canvas>
  )
}

/**
 * Move / rotate handle for the selection.
 *
 * The anchor decides where the handle sits — the plan calls for grabbing a loose
 * piece from side A, side B, or its middle. Dragging a piece that is linked to
 * others moves the whole connected assembly, so joints never tear apart.
 */
function Gizmo() {
  const tool = useProject((s) => s.tool)
  const selection = useProject((s) => s.selection)
  const pieces = useProject((s) => s.pieces)
  const updatePiece = useProject((s) => s.updatePiece)
  const commit = useProject((s) => s.commit)

  const proxy = useRef<THREE.Object3D>(new THREE.Object3D())
  const [ready, setReady] = useState(false)
  const startRef = useRef<{ matrix: THREE.Matrix4; group: Piece[] } | null>(null)

  const piece = useMemo(
    () => (selection.pieceIds.length === 1 ? pieces.find((p) => p.id === selection.pieceIds[0]) : undefined),
    [selection.pieceIds, pieces],
  )

  // Park the proxy at the requested anchor whenever the selection moves.
  useEffect(() => {
    if (!piece) {
      setReady(false)
      return
    }
    const q = pieceQuaternion(piece)
    let pos: THREE.Vector3
    if (selection.anchor === 'middle') pos = pieceMidpoint(piece)
    else {
      const local = localPortFrame(piece, selection.anchor)
      pos = local.position.clone().applyQuaternion(q).add(new THREE.Vector3(...piece.position))
    }
    proxy.current.position.copy(pos)
    proxy.current.quaternion.copy(q)
    proxy.current.updateMatrixWorld(true)
    setReady(true)
  }, [piece?.id, piece?.position, piece?.rotation, piece?.length, piece?.radius, piece?.angleDeg, selection.anchor])

  if (!piece || !ready || piece.locked) return null
  if (tool !== 'move' && tool !== 'rotate') return null

  const onMouseDown = () => {
    commit()
    const group = collectGroup(pieces, piece.id)
    startRef.current = {
      matrix: proxy.current.matrixWorld.clone(),
      group: pieces.filter((p) => group.has(p.id)),
    }
  }

  const onChange = () => {
    const start = startRef.current
    if (!start) return
    proxy.current.updateMatrixWorld(true)
    const delta = proxy.current.matrixWorld.clone().multiply(start.matrix.clone().invert())
    for (const p of start.group) {
      const before = new THREE.Matrix4().compose(
        new THREE.Vector3(...p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation, 'XYZ')),
        new THREE.Vector3(1, 1, 1),
      )
      const after = delta.clone().multiply(before)
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scl = new THREE.Vector3()
      after.decompose(pos, quat, scl)
      const e = new THREE.Euler().setFromQuaternion(quat, 'XYZ')
      updatePiece(p.id, { position: [pos.x, pos.y, pos.z], rotation: [e.x, e.y, e.z] })
    }
  }

  return (
    <TransformControls
      object={proxy.current}
      mode={tool === 'rotate' ? 'rotate' : 'translate'}
      size={0.85}
      onMouseDown={onMouseDown}
      onMouseUp={() => (startRef.current = null)}
      onObjectChange={onChange}
    />
  )
}

/** Exposes camera helpers to the toolbar without prop-drilling through the Canvas. */
function CameraBridge() {
  const { camera, controls } = useThree()
  const pieces = useProject((s) => s.pieces)

  useEffect(() => {
    const api: ViewApi = {
      setView(dir) {
        const c = controls as unknown as OrbitLike | null
        const target = c?.target ?? new THREE.Vector3()
        const dist = camera.position.distanceTo(target) || 400
        camera.position.copy(target).addScaledVector(dir, dist)
        camera.lookAt(target)
        c?.update()
      },
      frameAll() {
        const c = controls as unknown as OrbitLike | null
        if (!pieces.length) return
        const box = new THREE.Box3()
        // Cheap framing: use the piece origins plus a generous pad.
        for (const p of pieces) box.expandByPoint(new THREE.Vector3(...p.position))
        box.expandByScalar(180)
        const sphere = box.getBoundingSphere(new THREE.Sphere())
        const dir = camera.position.clone().sub(c?.target ?? new THREE.Vector3()).normalize()
        const persp = camera as THREE.PerspectiveCamera
        const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(persp.fov) / 2)
        if (c) c.target.copy(sphere.center)
        camera.position.copy(sphere.center).addScaledVector(dir, dist)
        c?.update()
      },
    }
    viewApi = api
    return () => {
      if (viewApi === api) viewApi = null
    }
  }, [camera, controls, pieces])

  return null
}

/** The slice of OrbitControls the camera helpers need, without pulling in three-stdlib's types. */
interface OrbitLike {
  target: THREE.Vector3
  update: () => void
}

export interface ViewApi {
  setView: (dir: THREE.Vector3) => void
  frameAll: () => void
}

/** Set by the live Canvas; the toolbar calls into it. */
export let viewApi: ViewApi | null = null

export const VIEW_DIRECTIONS: Record<string, THREE.Vector3> = {
  Top: new THREE.Vector3(0, 1, 0.0001),
  Front: new THREE.Vector3(0, 0, 1),
  Right: new THREE.Vector3(1, 0, 0),
  Home: new THREE.Vector3(0.7, 0.55, 0.75).normalize(),
}
