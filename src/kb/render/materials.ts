/**
 * Materials, driven by the §9.2 contract rather than by adjectives.
 *
 * Four constructions × two views is eight material configurations, not eight
 * prompts. `faceEmissive`, `backgroundEmissive` and `faceOpaque` come straight
 * off the contract, so a night render cannot glow somewhere the spec block says
 * it is dark.
 */
import * as THREE from 'three';
import type { SurfaceTruth, View } from './contract.js';

export type { View };


/** Named colours the KB uses, plus a passthrough for CSS/hex values. */
/**
 * Render colours only. §4.7 keeps these out of the spec block entirely — they
 * exist so the proof looks like the sign, not so anyone orders paint from them.
 * Ordered longest-key-first so "dark blue" beats "blue".
 */
const COLOUR_TABLE: Array<[string, string]> = ([
  ['match mounting surface', '#9a9a92'],
  ['match building colour', '#9a9a92'],
  ['polished silver', '#c4c8cc'],
  ['brushed chrome', '#b4b8bc'],
  ['metallic silver', '#b8bcc0'],
  ['brushed silver', '#a9adb2'],
  ['polished gold', '#c9a227'],
  ['brushed gold', '#b39344'],
  ['holiday green', '#0f7a3d'],
  ['midnight blue', '#101a3c'],
  ['intense blue', '#0047bb'],
  ['hunter green', '#28503c'],
  ['spring green', '#57c15b'],
  ['med. bronze', '#6a5340'],
  ['dur. bronze', '#3f3228'],
  ['bright white', '#fbfbf7'],
  ['irish green', '#169b62'],
  ['pearl grey', '#c8c9c4'],
  ['warm white', '#ffeccc'],
  ['cool white', '#eef4ff'],
  ['dark blue', '#12246b'],
  ['dove grey', '#9d9d99'],
  ['lt. green', '#7ec46b'],
  ['burgundy', '#5c1a2b'],
  ['per logo', '#d9534f'],
  ['charcoal', '#2b2b2b'],
  ['magenta', '#c8156e'],
  ['mustard', '#c9962c'],
  ['maroon', '#6b1f2b'],
  ['purple', '#5b2a86'],
  ['silver', '#b8bcc0'],
  ['bronze', '#5a4632'],
  ['orange', '#e8590c'],
  ['yellow', '#f2c200'],
  ['mango', '#f08c1a'],
  ['brown', '#4a3527'],
  ['ivory', '#efe6d2'],
  ['black', '#141414'],
  ['white', '#f2f2f2'],
  ['green', '#1a7f3c'],
  ['grey', '#8c8c8c'],
  ['gray', '#8c8c8c'],
  ['gold', '#c9a227'],
  ['teal', '#0f7d7d'],
  ['blue', '#1b3fae'],
  ['red', '#c8102e'],
  ['pink', '#e5709b'],
] as Array<[string, string]>).sort((a, b) => b[0].length - a[0].length);

export function resolveColour(name: string, fallback = '#c8c8c8'): THREE.Color {
  const v = name.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return new THREE.Color(v);
  // Longest key first, so "dark blue" is not matched as "blue" and
  // "bright white" is not matched as "white".
  for (const [k, hex] of COLOUR_TABLE) {
    if (v === k || new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(v)) {
      return new THREE.Color(hex);
    }
  }
  // "3M Scotchcal 3630 — nearest match to #ff0000" keeps a device value inside.
  const embedded = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(name);
  if (embedded) return new THREE.Color(`#${embedded[1]}`);
  return new THREE.Color(fallback);
}

export interface FaceMaterialInput {
  colour: string;
  truth: SurfaceTruth;
  view: View;
  /** Translucent acrylic scatters; opaque metal does not. */
  translucent: boolean;
}

/**
 * A lit face renders at its own colour, exactly.
 *
 * The scene is tone-mapped, which is right for surfaces lit by something else —
 * it is what stops a daylight wall blowing out. It is wrong for a surface that
 * IS the light: ACES rolls off the brightest channel first, so FedEx orange
 * (#ff6600, already at full red) loses red relative to green and the "Ex"
 * renders yellow at night while staying orange by day. Scaling it down does not
 * help; any multiplier above 1 on a saturated colour clips the same channel.
 *
 * `toneMapped: false` takes the face out of that curve, so it renders the
 * literal colour of the acrylic. It reads as illuminated because everything
 * around it at night is dark — which is also why it reads that way in life.
 */
export function faceMaterial(input: FaceMaterialInput): THREE.MeshStandardMaterial {
  const c = resolveColour(input.colour);
  const lit = input.truth.faceEmissive && input.view === 'night';

  return new THREE.MeshStandardMaterial({
    // Lit, the face's own reflectance contributes nothing worth seeing next to
    // what it is emitting, and leaving it in only muddies the hue.
    color: lit ? new THREE.Color(0x000000) : c,
    roughness: input.translucent ? 0.42 : 0.55,
    metalness: input.translucent ? 0.0 : 0.25,
    emissive: input.truth.faceEmissive ? c : new THREE.Color(0x000000),
    emissiveIntensity: lit ? 1 : 0,
    toneMapped: !lit,
    side: THREE.FrontSide,
  });
}

/** Applied when a face switches between views, so the flag follows the state. */
export function setFaceLit(
  material: THREE.MeshStandardMaterial,
  colour: string,
  lit: boolean,
): void {
  const c = resolveColour(colour);
  material.color = lit ? new THREE.Color(0x000000) : c;
  material.emissive = lit ? c : new THREE.Color(0x000000);
  material.emissiveIntensity = lit ? 1 : 0;
  material.toneMapped = !lit;
  material.needsUpdate = true;
}

/** §9.2: returns and trim stay dark on every lit construction. */
export function returnMaterial(colour: string, truth: SurfaceTruth, view: View): THREE.MeshStandardMaterial {
  const c = resolveColour(colour, '#141414');
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.5,
    metalness: 0.45,
    emissive: truth.returnsEmissive ? c : new THREE.Color(0x000000),
    emissiveIntensity: truth.returnsEmissive && view === 'night' ? 1.4 : 0,
  });
}

export function trimCapMaterial(colour: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: resolveColour(colour, '#141414'),
    roughness: 0.35,
    metalness: 0.1,
  });
}

/**
 * The halo source. §9.2: "Surface behind glows in a halo; face stays dark and
 * solid." So the emitter is a plane on the WALL, not on the letter.
 *
 * `surfaceColour` matters: what the customer sees is not the LED, it is the LED
 * *reflected off whatever is behind the sign*. White LEDs on a yellow backer
 * read yellow, which is why a halo photograph so rarely looks white. Modelling
 * the halo as the light alone makes every sign halo in the same colour whatever
 * it is mounted on.
 */
export function haloMaterial(
  ledColour: string | undefined,
  view: View,
  surfaceColour?: string,
): THREE.MeshStandardMaterial {
  const led = resolveColour(ledColour ?? 'bright white', '#fbfbf7');
  const c = surfaceColour ? led.clone().multiply(resolveColour(surfaceColour, '#ffffff')) : led;
  const night = view === 'night';
  return new THREE.MeshStandardMaterial({
    color: c,
    // Black by day, not merely zero-intensity: §9.2 says a halo letter is dark
    // in daylight, and a scene-graph check should read that off the material
    // rather than having to know which of two fields carries the state.
    emissive: night ? c : new THREE.Color(0x000000),
    emissiveIntensity: night ? 2.4 : 0.0,
    transparent: true,
    opacity: night ? 1 : 0,
    // Additive, so the concentric shells the scene builds ACCUMULATE into a
    // gradient. Under normal blending each opaque shell simply overwrites the
    // one before it and the only thing visible is the outermost — the faintest
    // — which renders a halo as a barely-there grey outline.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function surfaceMaterial(colour: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: resolveColour(colour, '#9a9a92'),
    roughness: 0.9,
    metalness: 0.0,
  });
}
