/**
 * Day and night as two lighting environments over one scene graph.
 * Nothing here touches geometry — that is the whole point.
 */
import * as THREE from 'three';
import type { SignSpec } from '../domain/spec.js';
import type { View } from './materials.js';
import type { Rgb } from './integrate.js';

const RIG = '__cl_lighting_rig__';

/**
 * Tints a light by the photograph's own illuminant.
 *
 * Applied to the LIGHT, not to the pigment. The face keeps the colour the spec
 * block states; what changes is the light it is seen under, which is the
 * physically correct place for this and the reason it does not amount to
 * repainting a specified value. A sign lit by a studio neutral inside a
 * photograph taken at golden hour is the same tell as a wrong shadow
 * direction — the eye reads the mismatch long before it reads the geometry.
 */
function tint(colour: THREE.Color, gain?: Rgb): THREE.Color {
  if (!gain) return colour;
  return colour.setRGB(
    Math.min(1, colour.r * gain.r),
    Math.min(1, colour.g * gain.g),
    Math.min(1, colour.b * gain.b),
  );
}

export function applyEnvironment(
  scene: THREE.Scene,
  view: View,
  spec: SignSpec,
  composite = false,
  /** Measured from the customer's photograph, already tempered. */
  illuminant?: Rgb,
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

    // Only on a composite: a studio panel has no photograph to agree with, and
    // tinting it would shift the surface away from its specified colour for no
    // reason at all.
    const gain = composite ? illuminant : undefined;
    const hemi = new THREE.HemisphereLight(0xdce8f5, 0x6b6b63, 2.1);
    tint(hemi.color, gain);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    tint(sun.color, gain);
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
    // Only slightly soft, and deliberately so. The sun subtends 0.53°, so at a
    // 5″ standoff its penumbra is 0.046″ — a real cast shadow here IS sharp,
    // and blurring it further would be a prettier picture of something that
    // does not happen. What was actually missing from the pasted-on look is
    // ambient occlusion in the gap, which the compositor adds separately.
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0005;
    sun.shadow.camera.updateProjectionMatrix();

    const fill = new THREE.DirectionalLight(0xdde6f0, 0.5);
    tint(fill.color, gain);
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

    // A rim from behind and to the side. Without it the returns of a dark
    // letter against a dark ground have no edge at all, and the sign reads as
    // a flat cut-out of its own silhouette — which is exactly what a
    // three-quarter is there to disprove. Cool and weak, so it separates the
    // form without claiming to light anything.
    const rim = new THREE.DirectionalLight(0x8fa6c8, 0.55);
    rim.position.set(
      spec.overall.w / 2 - spec.overall.w * 1.4,
      spec.overall.h * 1.1,
      -spec.overall.h * 1.6,
    );
    rim.target.position.set(spec.overall.w / 2, spec.overall.h / 2, 0);
    rig.add(rim.target);

    rig.add(ambient, street, rim);
  }

  scene.add(rig);
}
