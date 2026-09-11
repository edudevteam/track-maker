import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useProject } from '../store/useProject'
import { getBlockGeometry, getCarGeometry } from '../geometry/cache'
import { centrelineLength, pieceQuaternion, portEntry, sampleCentreline } from '../lib/ports'
import { railHeight } from '../geometry/trackProfile'
import { vehicleScale, vehicleSizeOf } from '../geometry/vehicle'
import { BLOCK_CAR, BUILT_IN_CAR, useLoadedCar, withFacing } from '../lib/carLibrary'
import { REFERENCE_VEHICLE } from '../lib/carScales'
import {
  driveInput,
  junctionExit,
  lateralRoom,
  performanceOf,
  stepSpeed,
  stepYaw,
  steerTowards,
} from '../lib/driving'
import { carPose } from './carPose'
import type { PortId } from '../types'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * The car rides the connected centreline rather than being a rigid body.
 *
 * With the simulator off it is a gravity preview: the slope is projected onto the
 * local tangent, so a downhill run accelerates and an uphill run bleeds speed,
 * with rolling friction opposing motion. With the simulator on the keys take
 * over — the throttle drives it along the same centreline and the steering slides
 * it across the channel, between the walls, at the angle the wheels are turned.
 *
 * Either way it hands off to whatever is linked at the end of a piece, and an
 * open end stops it. This can't tunnel through geometry or fall out of a banked
 * corner, which is what makes it usable as a design check.
 */
export function Car() {
  const dims = useProject((s) => s.dims)
  const pieces = useProject((s) => s.pieces)
  const car = useProject((s) => s.car)
  const showVehicle = useProject((s) => s.showVehicle)
  const simulating = useProject((s) => s.simulating)
  const gravity = useProject((s) => s.gravity)
  const friction = useProject((s) => s.friction)
  const topSpeed = useProject((s) => s.topSpeed)
  const setCar = useProject((s) => s.setCar)
  const toggleSimulator = useProject((s) => s.toggleSimulator)
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

  // How big the car actually is on the track, and how big the vehicle it is a
  // model of would be. A model whose own units could not be settled has no real
  // size to divide into, so the reference saloon stands in for it.
  const drawn = vehicleSizes[spec.id] ?? spec.size ?? natural
  const real = loaded?.realFromFile ? natural : REFERENCE_VEHICLE
  const perf = useMemo(
    () => performanceOf(real, drawn, gravity, topSpeed),
    [real, drawn, gravity, topSpeed],
  )

  // A file with no colour of its own is painted from the manifest, so a changed
  // colour shows without the file being read again.
  useEffect(() => {
    for (const material of loaded?.painted ?? []) material.color.set(spec.color)
  }, [loaded, spec.color])

  useFrame((_, rawDelta) => {
    if (!showVehicle || !car.pieceId || !group.current) {
      carPose.valid = false
      return
    }
    const dt = Math.min(rawDelta, 1 / 30)
    const piece = pieces.find((p) => p.id === car.pieceId)
    if (!piece) {
      // The piece it was on has been deleted out from under it. There is nothing
      // left to drive, so the simulator hands the camera back rather than
      // leaving the view stuck over an empty stretch of workplane.
      carPose.valid = false
      setCar({ pieceId: null, running: false })
      if (simulating) toggleSimulator()
      return
    }

    const len = centrelineLength(piece)
    let { s, v, dir, offset, steer, yaw } = car
    s = THREE.MathUtils.clamp(s, 0, len)

    if (car.running) {
      const here = sampleCentreline(piece, s)
      const nose = dir > 0 ? here.tangent : here.tangent.clone().negate()

      if (simulating) {
        steer = steerTowards(steer, driveInput, v, perf, dt)
        v = stepSpeed(driveInput, v, -nose.y, perf, dt)
        yaw = stepYaw(yaw, steer, v, perf, dt)
      } else {
        // The rolling preview: gravity down the slope against a coasting
        // friction, with no engine, no brakes and no steering.
        const accel = gravity * -nose.y - Math.sign(v) * friction * gravity * Math.abs(here.tangent.dot(UP))
        v += accel * dt
        steer = 0
        yaw = 0
        // Rolling back down a hill turns the car round rather than reversing it.
        if (v < 0) {
          v = -v
          dir = dir > 0 ? -1 : 1
        }
      }

      // Across the track: the car crabs by its yaw angle, held inside the walls.
      const room = lateralRoom(dims, piece, s, drawn.width)
      const wanted = dir * v * Math.sin(yaw) * dt
      const moved = THREE.MathUtils.clamp(offset + wanted, -room, room) - offset
      offset += moved
      // A wall it is steering into takes the crab out of it: the car runs along
      // the wall rather than grinding into it at an angle. Squaring the nose up
      // to what actually happened is also what keeps its speed honest — the two
      // components below are then exactly `v` split by the angle, whatever the
      // walls allowed, so the readout is never claiming ground it did not cover.
      if (moved !== wanted && Math.abs(v) > 1e-6) {
        yaw = Math.asin(THREE.MathUtils.clamp(moved / (dir * v * dt), -1, 1))
      }

      // Along it: on a curve the inside line is shorter, so the same ground speed
      // covers more of the centreline out wide and less of it tucked in.
      const turn = Math.sign(piece.angleDeg) || 1
      const factor =
        piece.kind === 'curve' ? piece.radius / Math.max(1e-3, piece.radius + turn * offset) : 1
      const was = s
      s += dir * v * Math.cos(yaw) * factor * dt

      // A junction: holding a direction over the middle of an opening takes the
      // branch. It leaves across the run rather than along it, so nothing it was
      // carrying sideways — the crab angle, how far over it was sitting — means
      // anything on the piece it arrives on.
      const branch = simulating ? junctionExit(piece, was, s, dir, driveInput.steer) : null
      const onto = branch && piece.links[branch]
      const joined = onto ? pieces.find((p) => p.id === onto.pieceId) : undefined
      if (onto && joined) {
        const entry = portEntry(joined, onto.port)
        setCar({ pieceId: joined.id, s: entry.s, v, dir: entry.dir, offset: 0, yaw: 0, steer })
        return
      }

      if (s > len || s < 0) {
        const exit: PortId = s > len ? 'b' : 'a'
        const overflow = s > len ? s - len : -s
        const link = piece.links[exit]
        const next = link ? pieces.find((p) => p.id === link.pieceId) : undefined
        if (link && next) {
          // Which way the next piece is travelled through, and so which way the
          // nose ends up pointing in its frame. Entering it backwards swaps its
          // left and right, so the car stays on the same side of the track.
          const entry = portEntry(next, link.port, overflow)
          const side = link.port === 'a' || link.port === 'b'
          const flipped = entry.dir !== (exit === 'b' ? 1 : -1)
          const room = lateralRoom(dims, next, entry.s, drawn.width)
          setCar({
            pieceId: next.id,
            s: entry.s,
            v,
            // Arriving through the side of a junction, the car is across the run
            // rather than along it, so it takes that piece's own direction.
            dir: side ? ((entry.dir * (Math.sign(v) || dir)) as 1 | -1) : entry.dir,
            yaw: side ? yaw : 0,
            offset: side ? THREE.MathUtils.clamp(flipped ? -offset : offset, -room, room) : 0,
            steer,
          })
          return
        }
        // An open end. Driving it, the car stops against it and can back away;
        // rolling, there is nothing left to roll to, so the preview ends.
        s = exit === 'b' ? len : 0
        v = 0
        setCar({ s, v, dir, offset, steer, yaw, running: simulating })
        if (!simulating) return
      } else {
        setCar({ s, v, dir, offset, steer, yaw })
      }
    }

    const at = sampleCentreline(piece, THREE.MathUtils.clamp(s, 0, len))
    const up = UP.clone().applyQuaternion(pieceQuaternion(piece))
    const nose = dir > 0 ? at.tangent.clone() : at.tangent.clone().negate()
    // Positive yaw is to the car's right, which is a negative turn about its up.
    const heading = nose.applyAxisAngle(up, -yaw)
    const across = at.tangent.clone().cross(up)

    const position = at.point.clone().addScaledVector(across, offset).addScaledVector(up, railHeight(dims))
    group.current.position.copy(position)
    // A full basis rather than one turn onto the heading, so the car banks with
    // the piece it is on instead of staying level over a rolled corner.
    group.current.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(heading, up, new THREE.Vector3().crossVectors(heading, up)),
    )

    carPose.valid = true
    carPose.position.copy(position)
    carPose.forward.copy(heading)
    carPose.up.copy(up)
    carPose.speed = v
    carPose.length = drawn.length
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
