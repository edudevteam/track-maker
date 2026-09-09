import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useProject } from '../store/useProject'
import { getCarGeometry } from '../geometry/cache'
import { centrelineLength, sampleCentreline } from '../lib/ports'
import { railHeight } from '../geometry/trackProfile'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * The car rides the connected centreline rather than being a rigid body.
 *
 * Gravity is projected onto the local tangent, so a downhill run accelerates and
 * an uphill run bleeds speed, with rolling friction opposing motion. When the car
 * runs past the end of a piece it hands off to whatever is linked at that port;
 * an open end stops it. This can't tunnel through geometry or fall out of a
 * banked corner, which is what makes it usable as a design check.
 */
export function Car() {
  const dims = useProject((s) => s.dims)
  const pieces = useProject((s) => s.pieces)
  const car = useProject((s) => s.car)
  const gravity = useProject((s) => s.gravity)
  const friction = useProject((s) => s.friction)
  const setCar = useProject((s) => s.setCar)

  const group = useRef<THREE.Group>(null)
  const geometry = getCarGeometry(dims)

  useFrame((_, rawDelta) => {
    if (!car.pieceId || !group.current) return
    const dt = Math.min(rawDelta, 1 / 30)
    const piece = pieces.find((p) => p.id === car.pieceId)
    if (!piece) {
      setCar({ pieceId: null, running: false })
      return
    }

    let { s, v } = car
    if (car.running) {
      const { tangent } = sampleCentreline(piece, THREE.MathUtils.clamp(s, 0, centrelineLength(piece)))
      // Downhill component of gravity along the direction of travel.
      const slope = -tangent.y
      const accel = gravity * slope - Math.sign(v) * friction * gravity * Math.abs(tangent.dot(UP))
      v += accel * dt
      s += v * dt

      const len = centrelineLength(piece)
      if (s > len) {
        const link = piece.links.b
        if (link) {
          const next = pieces.find((p) => p.id === link.pieceId)
          const overflow = s - len
          if (next) {
            const nextLen = centrelineLength(next)
            setCar({
              pieceId: next.id,
              s: link.port === 'a' ? overflow : nextLen - overflow,
              v: link.port === 'a' ? v : -v,
            })
            return
          }
        }
        s = len
        v = 0
        setCar({ s, v, running: false })
        return
      }
      if (s < 0) {
        const link = piece.links.a
        if (link) {
          const next = pieces.find((p) => p.id === link.pieceId)
          const overflow = -s
          if (next) {
            const nextLen = centrelineLength(next)
            setCar({
              pieceId: next.id,
              s: link.port === 'a' ? overflow : nextLen - overflow,
              v: link.port === 'a' ? -v : v,
            })
            return
          }
        }
        s = 0
        v = 0
        setCar({ s, v, running: false })
        return
      }
      setCar({ s, v })
    }

    const { point, tangent } = sampleCentreline(piece, THREE.MathUtils.clamp(s, 0, centrelineLength(piece)))
    group.current.position.copy(point)
    group.current.position.y += railHeight(dims)
    const heading = v < 0 ? tangent.clone().multiplyScalar(-1) : tangent
    group.current.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), heading)
  })

  if (!car.pieceId) return null

  return (
    <group ref={group}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color="#dc2626" metalness={0.35} roughness={0.35} />
      </mesh>
    </group>
  )
}
