/**
 * Day and night as two lighting environments over one scene graph.
 * Nothing here touches geometry — that is the whole point.
 */
import * as THREE from 'three';
import type { SignSpec } from '../domain/spec.js';
import type { View } from './materials.js';

const RIG = '__cl_lighting_rig__';

export function applyEnvironment(
  scene: THREE.Scene,
  view: View,
  spec: SignSpec,
  composite = false,
): void {
  const existing = scene.getObjectByName(RIG);
  if (existing) {
    scene.remove(existing);
    existing.traverse((o) => {
      if ((o as THREE.Light).dispose) (o as THREE.Light).dispose();
    });
  }

  const rig = new THREE.Group();
  rig.name = RIG;

  // Compositing paints the photograph behind the sign, so the scene must not
  // paint anything of its own there.
  if (composite) scene.background = null;

  if (view === 'day') {
    if (!composite) scene.background = new THREE.Color(0xbcc7d1);

    // Where the sun is. Stated by the customer when they know, and otherwise
    // left high and slightly to the left — a short, soft shadow that asserts
    // little. A composite fails on lighting long before it fails on geometry:
    // a sign whose shadow falls opposite to every other shadow in the
    // photograph reads as pasted on however exactly it is placed.
    const azimuth = ((spec.placement?.sun?.azimuthDeg ?? -22) * Math.PI) / 180;
    const elevation = ((spec.placement?.sun?.elevationDeg ?? 58) * Math.PI) / 180;
    const reach = Math.max(spec.overall.w, spec.overall.h) * 2.6 + 40;

    const hemi = new THREE.HemisphereLight(0xdce8f5, 0x6b6b63, 2.1);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(
      spec.overall.w / 2 + Math.sin(azimuth) * Math.cos(elevation) * reach,
      spec.overall.h / 2 + Math.sin(elevation) * reach,
      Math.cos(azimuth) * Math.cos(elevation) * reach,
    );
    sun.target.position.set(spec.overall.w / 2, spec.overall.h / 2, 0);
    rig.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = spec.overall.h * 8 + 200;
    const d = Math.max(spec.overall.w, spec.overall.h) * 1.5 + 24;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
    // A hard-edged shadow is the other half of the pasted-on look. Real
    // daylight on a wall a few inches behind the letters is soft.
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0005;
    sun.shadow.camera.updateProjectionMatrix();

    const fill = new THREE.DirectionalLight(0xdde6f0, 0.5);
    fill.position.set(
      spec.overall.w / 2 - Math.sin(azimuth) * reach,
      spec.overall.h,
      Math.cos(azimuth) * reach,
    );
    rig.add(hemi, sun, fill);
  } else {
    // Night: ambient light drops to near zero so the only bright thing in
    // frame is what the contract says emits. A night view that keeps its
    // daylight fill reads as a grey daytime photo with a glowing sign in it.
    if (!composite) scene.background = new THREE.Color(0x0a0d12);
    const ambient = new THREE.AmbientLight(0x1a2028, 0.55);
    const street = new THREE.DirectionalLight(0x3a4658, 0.35);
    street.position.set(spec.overall.w * 1.2, spec.overall.h * 1.6, spec.overall.h * 2);
    rig.add(ambient, street);
  }

  scene.add(rig);
}
