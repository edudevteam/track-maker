import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { carPose } from './carPose'

/**
 * The driving view: behind the car, above it, looking the way it is going.
 *
 * Everything is measured in car lengths, so the same view works for a die-cast
 * car in a 30mm channel and an RC car twice the size. The camera sits on the
 * track's own up rather than the world's, which keeps it square to a banked
 * corner instead of watching the car lean out of frame.
 *
 * Mounted only while the simulator is on. It puts the editing camera back where
 * it found it on the way out, so leaving the simulator does not lose the view
 * that was being worked in.
 */

/** How far behind the car the camera sits, in car lengths. */
const BACK = 4.5
/** And how far above it — the two together set how far down the view looks. */
const RISE = 2.2
/** How far up the road it looks, which is what puts the car low in the frame. */
const AHEAD = 1.6
/** How far above the road that aim point sits. */
const AIM_RISE = 0.5

/** Seconds the camera takes to catch up — enough to lean into a corner. */
const FOLLOW = 0.14
/** The same for where it is looking, kept tighter so the road stays steady. */
const AIM_FOLLOW = 0.09

/** What the wheel can wind the distance down to and up from. */
const MIN_ZOOM = 0.45
const MAX_ZOOM = 3.5
/** How much one notch of the wheel changes it. */
const ZOOM_STEP = 0.0016

export function ChaseCamera() {
  const { camera, controls, gl } = useThree()
  const zoom = useRef(1)
  const aim = useRef(new THREE.Vector3())
  const up = useRef(new THREE.Vector3(0, 1, 0))
  const seated = useRef(false)

  // Borrow the editing view and put it back. The orbit control is switched off
  // by the viewport for as long as this is mounted, so nothing fights over the
  // camera in between; all that is kept here is where it was pointing.
  useEffect(() => {
    const orbit = controls as unknown as OrbitLike | null
    const kept = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      target: orbit?.target.clone() ?? new THREE.Vector3(),
    }
    seated.current = false
    return () => {
      camera.position.copy(kept.position)
      camera.quaternion.copy(kept.quaternion)
      camera.up.copy(kept.up)
      if (orbit) {
        orbit.target.copy(kept.target)
        orbit.update()
      }
    }
  }, [camera, controls])

  // The wheel is free while driving, so it pulls the view in and out.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom.current = THREE.MathUtils.clamp(zoom.current * Math.exp(e.deltaY * ZOOM_STEP), MIN_ZOOM, MAX_ZOOM)
    }
    const canvas = gl.domElement
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [gl])

  useFrame((_, rawDelta) => {
    if (!carPose.valid) return
    const dt = Math.min(rawDelta, 1 / 30)
    const len = Math.max(carPose.length, 1)

    const want = carPose.position
      .clone()
      .addScaledVector(carPose.forward, -BACK * len * zoom.current)
      .addScaledVector(carPose.up, RISE * len * zoom.current)
    const at = carPose.position
      .clone()
      .addScaledVector(carPose.forward, AHEAD * len)
      .addScaledVector(carPose.up, AIM_RISE * len)

    if (!seated.current) {
      // First frame in: arrive already behind the car rather than flying to it
      // from wherever the build was being looked at.
      seated.current = true
      camera.position.copy(want)
      aim.current.copy(at)
      up.current.copy(carPose.up)
    } else {
      camera.position.lerp(want, 1 - Math.exp(-dt / FOLLOW))
      aim.current.lerp(at, 1 - Math.exp(-dt / AIM_FOLLOW))
      up.current.lerp(carPose.up, 1 - Math.exp(-dt / FOLLOW)).normalize()
    }

    camera.up.copy(up.current)
    camera.lookAt(aim.current)
  })

  return null
}

/** The slice of OrbitControls this needs, without pulling in three-stdlib's types. */
interface OrbitLike {
  target: THREE.Vector3
  update: () => void
}
