/**
 * Day and night as two lighting environments over one scene graph.
 * Nothing here touches geometry — that is the whole point.
 */
import * as THREE from 'three';
import type { SignSpec } from '../domain/spec.js';
import { TYPES } from '../domain/taxonomy.js';
import type { View } from './materials.js';
import type { Rgb } from './integrate.js';

const RIG = '__cl_lighting_rig__';

/**
 * The colour the sign throws, from the LED it was specified with.
 *
 * Warm white when nothing says otherwise — the default LED in §8.1 — and the
 * specified colour when there is one, because a red-lit sign does not wash a
 * wall in white.
 */
function resolveLedColour(spec: SignSpec): THREE.Color {
  const led = spec.elements.find((e) => e.lit)?.ledColour;
  const colour = new THREE.Color(0xfff1dc);
  if (!led) return colour;
  try {
    return new THREE.Color(led.toLowerCase().replace(/[^a-z]/g, ''));
  } catch {
    return colour;
  }
}

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

    // The sign is the light source, and it is in the middle of the frame.
    //
    // At night nothing else in the picture is lit: the faces emit, and an
    // emissive material in three.js illuminates nothing at all — so the wall
    // and the pan behind the copy received no light from the one thing in the
    // scene that is actually shining. That is why a night panel needed a
    // painted-on wash to look right, and why the wash never quite agreed with
    // whatever a generative pass drew behind it.
    //
    // A real lamp at the sign's own position fixes both. It sits centre-front,
    // where the copy is, so the pool it throws is centred under the sign by
    // construction rather than by tuning — the direction is not measured
    // because it is not in doubt.
    const emits = spec.elements.some((e) => e.lit);
    if (emits) {
      const rearLit = TYPES[spec.type].rearIlluminated;
      const depth = Math.max(...spec.elements.map((e) => e.returnDepth ?? 5), 3);
      const cap = Math.max(...spec.elements.map((e) => e.capHeight), 6);
      const colour = resolveLedColour(spec);

      if (rearLit) {
        // A halo letter's LEDs face BACKWARDS, into the standoff gap, and they
        // run the length of the copy. One lamp at the centre is not that: with
        // physical falloff it lights the middle of the word and leaves the ends
        // dark, so "FedEx" glowed behind "ed" and nowhere else.
        //
        // So the light is spread across the copy at the gap depth, roughly one
        // per letter-height, and the copy itself blocks it — which is what
        // draws the halo rather than painting one on.
        // Close to the surface, not halfway across the gap. The LEDs sit on
        // the back of the can, and how tight the halo reads is set by that
        // distance: brightness falls with 1/(gap² + d²), so a lamp an inch off
        // the wall is dim four inches away, where one four inches off is not.
        const gap = Math.max(depth * 0.14, 0.5);
        const count = Math.min(14, Math.max(3, Math.round((spec.overall.w / cap) * 2)));
        // Enough to land at full brightness on a surface a gap away, given the
        // inverse-square falloff below, and divided among the lamps so a long
        // sign does not end up brighter than a short one.
        const each = (gap * gap * 260) / Math.sqrt(count);

        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : i / (count - 1);
          // No distance clamp: three.js cuts a clamped light off at a hard
          // edge, and a lit ring with a rim around it is worse than a wide
          // one. Inverse-square from an inch and a half is already tight.
          const lamp = new THREE.PointLight(colour, each, 0, 2);
          lamp.position.set(spec.overall.w * (0.04 + 0.92 * t), spec.overall.h / 2, gap);
          lamp.castShadow = true;
          lamp.shadow.mapSize.set(512, 512);
          lamp.shadow.camera.near = 0.2;
          lamp.shadow.camera.far = cap * 4;
          lamp.shadow.bias = -0.002;
          rig.add(lamp);
        }
      } else {
        // Front lit: the light leaves the faces towards the viewer, and what
        // reaches the wall is spill. One soft source in front of the copy.
        const reach = Math.max(spec.overall.w, spec.overall.h) * 1.6;
        const glow = new THREE.PointLight(
          colour,
          Math.max(spec.overall.w, spec.overall.h) * 0.9,
          reach,
          2,
        );
        glow.position.set(spec.overall.w / 2, spec.overall.h / 2, depth * 0.6);
        rig.add(glow);
      }
    }

    rig.add(ambient, street, rim);
  }

  scene.add(rig);
}
