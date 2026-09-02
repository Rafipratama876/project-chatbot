/**
 * Something for the metal to reflect.
 *
 * A PBR material with `metalness` set and no environment reflects nothing but
 * the handful of lights in the scene, and comes out flat and plasticky — the
 * single biggest reason a three.js render reads as CG. Aluminium returns and a
 * trim cap in life are covered in the reflection of the sky, the ground and
 * whatever is opposite them.
 *
 * Generated rather than loaded from an HDR file, deliberately. The renderer
 * runs inside a headless browser with a bundled script and no server to fetch
 * assets from, so a file would be a network dependency on the render path and
 * a way for two runs to differ. `RoomEnvironment` is built from geometry and
 * lights at call time: no asset, no request, and the same texture every run —
 * which the proof depends on.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * How strongly the environment shows, per view.
 *
 * Day is a real outdoor surface under an open sky. Night is nearly nothing on
 * purpose: §9.2 asks that the only bright things in a night frame are what the
 * contract says emit, and an environment bright enough to model a room would
 * light a dark face and break that. What is left is just enough for the
 * returns to catch an edge and stop reading as cut-out silhouettes.
 */
export const ENVIRONMENT_INTENSITY: Record<'day' | 'night', number> = {
  day: 1,
  // Measured, not chosen. At 0.14 the mounting surface came out at luma 84
  // uniformly — a dusk wall, not a night one — and the halo's own falloff was
  // lost inside it. What a night frame has to show is the sign lighting the
  // wall, which only reads if the wall is not already lit.
  night: 0.05,
};

/**
 * Builds the prefiltered environment. Owns the renderer for the duration, so
 * it has to be called where the renderer is, not where the scene is built.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}
