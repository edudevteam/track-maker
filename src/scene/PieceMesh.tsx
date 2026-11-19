import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { Piece, PortId } from '../types'
import { useProject } from '../store/useProject'
import { getSnapClipGeometry, getSupportClipGeometry, getTrackGeometry } from '../geometry/cache'
import { clipPlacement, supportLeg } from '../lib/supports'
import { clipTwistAt, twistClip } from '../lib/clipTwist'
import { connectorOffsets, lanesAt } from '../geometry/parts'
import { laneWidth } from '../geometry/dimensions'
import { localPortFrame, portsOf } from '../lib/ports'
import { clipLength, ownsConnector } from '../lib/connectors'

const SELECT_EMISSIVE = new THREE.Color('#2f7fd1')
const X_AXIS = new THREE.Vector3(1, 0, 0)

export function PieceMesh({ piece }: { piece: Piece }) {
  const dims = useProject((s) => s.dims)
  const selected = useProject((s) => s.selection.pieceIds.includes(piece.id))
  const select = useProject((s) => s.select)
  const simulating = useProject((s) => s.simulating)

  const geometry = getTrackGeometry(piece, dims)

  if (!piece.visible) return null

  // Driving, the track is scenery: a click on it is not meant to pick a part.
  const onClick = simulating
    ? undefined
    : (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        select([piece.id], e.shiftKey)
      }

  // The id on the group lets Fit Selected read this piece's bounds off the scene.
  return (
    <group position={piece.position} rotation={piece.rotation} userData={{ pieceId: piece.id }}>
      <mesh geometry={geometry} castShadow receiveShadow onClick={onClick}>
        <meshStandardMaterial
          color={piece.color}
          metalness={0.05}
          roughness={0.55}
          emissive={selected ? SELECT_EMISSIVE : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>

      {portsOf(piece).map((port) =>
        ownsConnector(piece, port) ? <ConnectorAt key={`c-${port}`} piece={piece} port={port} /> : null,
      )}

      {!simulating &&
        portsOf(piece).map((port) => <PortHandle key={`h-${port}`} piece={piece} port={port} />)}
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
  const link = piece.links[port]
  const neighbour = useProject((s) => s.pieces.find((p) => p.id === link?.pieceId))
  const clipSize = useProject((s) => s.clipSize)
  const length = clipLength(piece, neighbour, dims, clipSize)
  // Up off the workplane, the clip grows a leg down to it.
  const leg = supportLeg(piece, port, neighbour, length, dims)
  const geometry =
    leg === null ? getSnapClipGeometry(dims, length) : getSupportClipGeometry(dims, length, leg.floor, leg.pitchDeg)
  // A banked curve clips every lane to a matching banked curve, and only its
  // flat lanes to anything else, so what is next door matters.
  const lanes = useMemo(
    () => connectorOffsets(piece, dims, port, neighbour),
    [piece, port, dims, neighbour],
  )

  const placement = useMemo(
    () => clipPlacement(piece, port, length, dims),
    [piece, port, length, dims],
  )
  // Where the road is still turning through the joint — in the middle of a
  // long roll — each clip is turned to follow its slot.
  const shaped = useMemo(() => {
    const twist = leg === null ? clipTwistAt(piece, port, neighbour, dims) : null
    return lanes.map((v) => (twist ? twistClip(geometry, length, v, twist, dims) : geometry))
  }, [piece, port, neighbour, dims, lanes, geometry, length, leg])
  useEffect(() => () => shaped.forEach((g) => g !== geometry && g.dispose()), [shaped, geometry])

  return (
    <>
      {lanes.map((v, i) => (
        <mesh
          key={i}
          geometry={shaped[i]}
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
  const setClosure = useProject((s) => s.setClosure)
  const select = useProject((s) => s.select)

  const toolMode = tool === 'connect' || tool === 'disconnect' || tool === 'close'
  const linked = piece.links[port] !== null
  const isActive = activePort?.pieceId === piece.id && activePort.port === port

  const placement = useMemo(() => {
    const frame = localPortFrame(piece, port, dims)
    const inward = X_AXIS.clone().applyQuaternion(frame.quaternion).multiplyScalar(-1)
    // A small tab, per the plan — enough to grab without masking the piece. A
    // side opening is grabbed at a fixed depth, since the length it is cut into
    // says nothing about how far into the wall the tab should reach.
    const depth =
      port === 'l' || port === 'r'
        ? 6
        : Math.min(
            12,
            (piece.kind === 'curve' || piece.kind === 'bend' || piece.kind === 'banked' ? piece.radius : piece.length) * 0.2,
          )
    // Half the track's height up off the end — square to the road on a slope.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame.quaternion)
    const pos = frame.position
      .clone()
      .addScaledVector(inward, depth / 2)
      .addScaledVector(up, dims.track.totalHeight / 2)
    return { pos, quaternion: frame.quaternion, depth }
  }, [piece.kind, piece.lanes, piece.lanesB, piece.length, piece.slope, piece.base, piece.radius, piece.angleDeg, piece.openLeft, piece.openRight, port, dims])

  if (!showPorts && !toolMode) return null
  // Outside the connect tools an already-joined end has nothing to offer, and
  // closing a gap only ever works on open ends.
  if (linked && (!toolMode || tool === 'close')) return null

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
    if (tool === 'close') {
      // The first end picked is held; the second opens the part picker.
      if (activePort && !isActive) setClosure({ a: activePort, b: { pieceId: piece.id, port } })
      else setActivePort({ pieceId: piece.id, port })
      return
    }
    setActivePort(isActive ? null : { pieceId: piece.id, port })
    select([piece.id])
  }

  const w = laneWidth(dims.track) * lanesAt(piece, port)
  const h = dims.track.totalHeight

  return (
    <mesh position={placement.pos} quaternion={placement.quaternion} onClick={onClick} renderOrder={3}>
      <boxGeometry args={[placement.depth, h * 1.08, w * 1.04]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}
