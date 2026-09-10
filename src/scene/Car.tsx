import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useProject } from '../store/useProject'
import { getBlockGeometry, getCarGeometry } from '../geometry/cache'
import { centrelineLength, sampleCentreline } from '../lib/ports'
import { railHeight } from '../geometry/trackProfile'
import { vehicleScale, vehicleSizeOf } from '../geometry/vehicle'
import { BLOCK_CAR, BUILT_IN_CAR, useLoadedCar, withFacing } from '../lib/carLibrary'

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
  const showVehicle = useProject((s) => s.showVehicle)
  const gravity = useProject((s) => s.gravity)
  const friction = useProject((s) => s.friction)
  const setCar = useProject((s) => s.setCar)
  const vehicle = useProject((s) => s.vehicle)
  const models = useProject((s) => s.carLibrary.models)
  const vehicleSizes = useProject((s) => s.vehicleSizes)
  const facing = useProject((s) => s.vehicleFacing)

  const group = useRef<THREE.Group>(null)
  // Whichever way the car has been told it faces wins over what its file says.
  const spec = withFacing(models.find((m) => m.id === vehicle) ?? BUILT_IN_CAR, facing[vehicle])
  // A model that will not load leaves the built-in shape on the track, so the
  // physics preview still runs while the file is sorted out.
  const { car: loaded } = useLoadedCar(spec)
  // The block is a real vehicle's size, so a scale divides into it; the die-cast
  // shape follows the channel, so it fits whatever the track has been set to.
  const builtIn = spec.id === BLOCK_CAR.id ? getBlockGeometry() : getCarGeometry(dims)
  const natural = useMemo(
    () => loaded?.natural ?? vehicleSizeOf(builtIn),
    [loaded, builtIn],
  )
  const scale = vehicleScale(natural, vehicleSizes[spec.id] ?? spec.size)

  // A file with no colour of its own is painted from the manifest, so a changed
  // colour shows without the file being read again.
  useEffect(() => {
    for (const material of loaded?.painted ?? []) material.color.set(spec.color)
  }, [loaded, spec.color])

  useFrame((_, rawDelta) => {
    if (!showVehicle || !car.pieceId || !group.current) return
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

  if (!showVehicle || !car.pieceId) return null

  return (
    <group ref={group}>
      {loaded ? (
        // The loaded model keeps whatever materials the file brought, so a GLB
        // or 3MF arrives with its paint, glass and tyres already on it.
        <primitive object={loaded.object} scale={scale} />
      ) : (
        <mesh geometry={builtIn} scale={scale} castShadow>
          <meshStandardMaterial color={spec.color} metalness={0.35} roughness={0.35} />
        </mesh>
      )}
    </group>
  )
}
