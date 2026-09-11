import * as THREE from 'three'

/**
 * Where the car is this frame.
 *
 * The chase camera and the driving readout both need it, and neither can be
 * handed it through React without a re-render every frame. It is written once by
 * `Car` and only read elsewhere, the same way the viewport shares its camera
 * helpers with the toolbar.
 */
export const carPose = {
  /** False whenever there is no car on the track to follow. */
  valid: false,
  /** Where the wheels sit, world space. */
  position: new THREE.Vector3(),
  /** Unit vector out of the nose. */
  forward: new THREE.Vector3(1, 0, 0),
  /** Which way is up for the piece it is on, so a banked corner tilts the view. */
  up: new THREE.Vector3(0, 1, 0),
  /** Speed along the nose, mm/s. Negative is reversing. */
  speed: 0,
  /** How long the car is drawn, mm — what the camera sets its distance from. */
  length: 1,
}
