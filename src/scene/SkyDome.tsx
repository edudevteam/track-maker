import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

const VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float radius;
  varying vec3 vLocal;
  void main() {
    // Ease the horizon so the gradient reads as sky rather than a hard band.
    float h = clamp(vLocal.y / radius * 0.5 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.35, 0.9, h)), 1.0);
  }
`

/**
 * A gradient dome behind the scene, giving the track something to read against
 * when the flat theme background washes it out. It rides with the camera so it
 * can never be orbited outside of.
 */
export function SkyDome({ top, bottom }: { top: string; bottom: string }) {
  const { camera } = useThree()
  const mesh = useRef<THREE.Mesh>(null)
  const radius = 9000

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          topColor: { value: new THREE.Color(top) },
          bottomColor: { value: new THREE.Color(bottom) },
          radius: { value: radius },
        },
      }),
    [],
  )

  material.uniforms.topColor.value.set(top)
  material.uniforms.bottomColor.value.set(bottom)

  useFrame(() => {
    mesh.current?.position.copy(camera.position)
  })

  return (
    <mesh ref={mesh} material={material} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  )
}
