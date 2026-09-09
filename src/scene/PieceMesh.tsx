import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { Piece, PortId } from '../types'
import { useProject } from '../store/useProject'
import { getConnectorGeometry, getTrackGeometry } from '../geometry/cache'
import { connectorOffsets } from '../geometry/parts'
import { laneWidth } from '../geometry/dimensions'
import { localPortFrame } from '../lib/ports'
import { ownsConnector } from '../lib/connectors'

const SELECT_EMISSIVE = new THREE.Color('#2f7fd1')
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

export function PieceMesh({ piece }: { piece: Piece }) {
  const dims = useProject((s) => s.dims)
  const selected = useProject((s) => s.selection.pieceIds.includes(piece.id))
  const select = useProject((s) => s.select)

  const geometry = getTrackGeometry(piece, dims)

  if (!piece.visible) return null

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select([piece.id], e.shiftKey)
  }

  return (
    <group position={piece.position} rotation={piece.rotation}>
      <mesh geometry={geometry} castShadow receiveShadow onClick={onClick}>
        <meshStandardMaterial
          color={piece.color}
          metalness={0.05}
          roughness={0.55}
          emissive={selected ? SELECT_EMISSIVE : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>

      {(['a', 'b'] as PortId[]).map((port) =>
        ownsConnector(piece, port) ? <ConnectorAt key={`c-${port}`} piece={piece} port={port} /> : null,
      )}

      {(['a', 'b'] as PortId[]).map((port) => (
        <PortHandle key={`h-${port}`} piece={piece} port={port} />
      ))}
    </group>
  )
}

/**
 * The clip that bridges a joint. It is centred on the port so half of it reaches
 * into the neighbouring piece. A 1-lane piece gets one; anything wider gets two,
 * on the outermost lanes.
 */
function ConnectorAt({ piece, port }: { piece: Piece; port: PortId }) {
  const dims = useProject((s) => s.dims)
  const geometry = getConnectorGeometry(dims, dims.connector.length)
  const lanes = useMemo(() => connectorOffsets(piece, dims), [piece.lanes, dims])

  const placement = useMemo(() => {
    const frame = localPortFrame(piece, port)
    const outward = X_AXIS.clone().applyQuaternion(frame.quaternion)
    const lateral = Z_AXIS.clone().applyQuaternion(frame.quaternion)
    const origin = frame.position.clone().addScaledVector(outward, -dims.connector.length / 2)
    // Push the wings up against the undercut ceiling; the body fills the mouth.
    origin.y = dims.assembly.fitClearance
    return { origin, quaternion: frame.quaternion, lateral }
  }, [piece.kind, piece.length, piece.radius, piece.angleDeg, port, dims])

  return (
    <>
      {lanes.map((v, i) => (
        <mesh
          key={i}
          geometry={geometry}
          position={placement.origin.clone().addScaledVector(placement.lateral, v)}
          quaternion={placement.quaternion}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={piece.connectorColor} metalness={0.05} roughness={0.45} />
        </mesh>
      ))}
    </>
  )
}

/**
 * A translucent tab over each end of the piece. It highlights the port a new
 * piece will snap to, and is the click target for the connect / disconnect tools.
 */
function PortHandle({ piece, port }: { piece: Piece; port: PortId }) {
  const dims = useProject((s) => s.dims)
  const tool = useProject((s) => s.tool)
  const showPorts = useProject((s) => s.showPorts)
  const activePort = useProject((s) => s.activePort)
  const setActivePort = useProject((s) => s.setActivePort)
  const connectPorts = useProject((s) => s.connectPorts)
  const disconnectPort = useProject((s) => s.disconnectPort)
  const select = useProject((s) => s.select)

  const toolMode = tool === 'connect' || tool === 'disconnect'
  const linked = piece.links[port] !== null
  const isActive = activePort?.pieceId === piece.id && activePort.port === port

  const placement = useMemo(() => {
    const frame = localPortFrame(piece, port)
    const inward = X_AXIS.clone().applyQuaternion(frame.quaternion).multiplyScalar(-1)
    // A small tab, per the plan — enough to grab without masking the piece.
    const depth = Math.min(12, (piece.kind === 'straight' ? piece.length : piece.radius) * 0.2)
    const pos = frame.position.clone().addScaledVector(inward, depth / 2)
    pos.y = dims.track.totalHeight / 2
    return { pos, quaternion: frame.quaternion, depth }
  }, [piece.kind, piece.length, piece.radius, piece.angleDeg, port, dims])

  if (!showPorts && !toolMode) return null
  // Outside the connect tools an already-joined end has nothing to offer.
  if (!toolMode && linked) return null

  const color = tool === 'disconnect' && linked ? '#f0a5a5' : isActive ? '#5fe08a' : '#cfe0ee'
  const opacity = toolMode ? 0.55 : isActive ? 0.6 : 0.14

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (tool === 'disconnect') {
      disconnectPort({ pieceId: piece.id, port })
      return
    }
    if (tool === 'connect') {
      if (activePort && activePort.pieceId !== piece.id) {
        connectPorts(activePort, { pieceId: piece.id, port })
      } else {
        setActivePort({ pieceId: piece.id, port })
      }
      return
    }
    setActivePort(isActive ? null : { pieceId: piece.id, port })
    select([piece.id])
  }

  const w = laneWidth(dims.track) * piece.lanes
  const h = dims.track.totalHeight

  return (
    <mesh position={placement.pos} quaternion={placement.quaternion} onClick={onClick} renderOrder={3}>
      <boxGeometry args={[placement.depth, h * 1.08, w * 1.04]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}
