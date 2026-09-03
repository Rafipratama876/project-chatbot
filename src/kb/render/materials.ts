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
/**
 * Which parts of a sign reflect their surroundings, and how strongly.
 *
 * A named list rather than `scene.environment`, which applies to everything.
 * That shortcut cost a regression: with it set, letter faces rendered #7d52d2
 * against a specified #4d148c, and turning the face's own `envMapIntensity`
 * down to 0.12 did not help — measured, the colour moved by one unit. The
 * environment reaches a physical material through more than one path, so the
 * only reliable way to keep it off a surface is to never give that surface an
 * environment at all.
 *
 * Anything absent from this table has no `envMap` and cannot be washed out.
 * The faces are absent deliberately: FACE COLOR is a spec-block line and the
 * customer reads it off the picture. That is a document requirement winning
 * over optical completeness, and it is the right way round for a proof.
 */
export const ENV_REFLECTANCE: Readonly<Record<string, number>> = {
  'CL-P-02 return': 1.1,
  'CL-P-03 trim cap': 0.8,
  'CL-P-32 logo box': 1.0,
  'CL-P-21 pill box': 1.0,
  'CL-P-18 raceway': 0.9,
  // A wall takes far less than the metal in front of it.
  'CL-P-31 mounting surface': 0.3,
  'CL-P-20 backer panel': 0.35,
};

/**
 * Hands the environment to the parts listed above, and to nothing else.
 *
 * Called again on every view change so reflections fade with the light —
 * returns keeping a daylight sheen in a night frame is its own kind of wrong.
 */
export function applyReflections(
  root: THREE.Object3D,
  environment: THREE.Texture | undefined,
  scale: number,
): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const reflectance = ENV_REFLECTANCE[mesh.name];
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const std = material as THREE.MeshStandardMaterial;
      if (!('envMapIntensity' in std)) continue;
      std.envMap = reflectance === undefined ? null : environment ?? null;
      std.envMapIntensity = (reflectance ?? 0) * scale;
      std.needsUpdate = true;
    }
  });
}

/**
 * How hard a lit face has to emit to read as lit.
 *
 * A backlit face is a light source, and its brightness comes from the LED
 * behind it, not from how dark the pigment is. Emitting every colour at 1
 * ignores that: FedEx orange (#ff6600) already has a channel at full and
 * blazes, while FedEx purple (#4d148c) tops out at 0.55 and renders as a dark
 * shape on a dark wall — the "F" disappeared into the background while the
 * "Ex" beside it read perfectly, on one sign, with both colours specified.
 *
 * So the emission is scaled until the BRIGHTEST channel reaches full and no
 * further. Every channel is scaled by the same factor, so the hue is exactly
 * the specified one — the constraint that matters, because FACE COLOR is a
 * spec-block line the customer reads off the picture. Stopping at the first
 * channel to reach full is also what keeps it that way: any more and that
 * channel clips while the others keep climbing, which is precisely how a
 * saturated colour turns pale and wrong.
 */
export function litEmissiveIntensity(colour: THREE.Color): number {
  const peak = Math.max(colour.r, colour.g, colour.b);
  if (peak <= 0) return 1;
  return Math.min(MAX_LIT_GAIN, 1 / peak);
}

/** A near-black face is not a lamp. Past this it would only amplify noise. */
const MAX_LIT_GAIN = 4;

export function faceMaterial(input: FaceMaterialInput): THREE.MeshPhysicalMaterial {
  const c = resolveColour(input.colour);
  const lit = input.truth.faceEmissive && input.view === 'night';

  return new THREE.MeshPhysicalMaterial({
    // Lit, the face's own reflectance contributes nothing worth seeing next to
    // what it is emitting, and leaving it in only muddies the hue.
    color: lit ? new THREE.Color(0x000000) : c,
    roughness: input.translucent ? 0.42 : 0.55,
    metalness: input.translucent ? 0.0 : 0.25,
    // Acrylic has a gloss layer over the pigment, and a painted face has its
    // lacquer. Modelled as clearcoat rather than by dropping the roughness:
    // lowering roughness makes the whole surface shiny including the colour,
    // where a clearcoat is a thin specular layer ON TOP of a matte pigment.
    //
    // Kept broad and weak. A tight clearcoat mirrors the environment, and the
    // environment is a bright room — at 0.65/0.12 the measured face came out
    // #7d52d2 against a specified #4d148c, a lavender instead of FedEx purple.
    clearcoat: input.translucent ? 0.28 : 0.16,
    clearcoatRoughness: input.translucent ? 0.4 : 0.5,
    // No environment ever reaches a face — see ENV_REFLECTANCE.
    envMapIntensity: 0,
    emissive: input.truth.faceEmissive ? c : new THREE.Color(0x000000),
    emissiveIntensity: lit ? litEmissiveIntensity(c) : 0,
    toneMapped: !lit,
    side: THREE.FrontSide,
  });
}

/**
 * Applied when a face switches between views, so every flag follows the state.
 *
 * Every property `faceMaterial` decides from `lit` has to be re-decided here.
 * A view switch is not a rebuild — the same material object is reused — so
 * anything this forgets keeps whatever the day view left on it, which is how
 * a night face ended up still mirroring the environment.
 */
export function setFaceLit(
  material: THREE.MeshStandardMaterial,
  colour: string,
  lit: boolean,
): void {
  const c = resolveColour(colour);
  material.color = lit ? new THREE.Color(0x000000) : c;
  material.emissive = lit ? c : new THREE.Color(0x000000);
  material.emissiveIntensity = lit ? litEmissiveIntensity(c) : 0;
  material.toneMapped = !lit;
  material.envMapIntensity = 0;
  material.needsUpdate = true;
}

/**
 * Copy or vinyl applied flat to a face or a box — the artwork's own colour.
 *
 * Lives here rather than inline in the scene builder, which is where both of
 * these used to be built. That mattered: an inline material takes
 * `envMapIntensity` = 1 by default, so when an environment arrived the FedEx
 * artwork on a logo box took the whole of a bright white room and rendered
 * #7d52d2 against a specified #4d148c. Every fix aimed at `faceMaterial`
 * missed it, because this was never a face.
 *
 * Anything carrying a colour the spec block states belongs in this file.
 */
export function copyMaterial(colour: string, roughness = 0.5): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: resolveColour(colour),
    roughness,
    // The same reasoning as a letter face: this IS the specified colour, and
    // the customer reads it off the picture. See ENV_REFLECTANCE.
    envMapIntensity: 0,
  });
}

/** §9.2: returns and trim stay dark on every lit construction. */
export function returnMaterial(colour: string, truth: SurfaceTruth, view: View): THREE.MeshStandardMaterial {
  const c = resolveColour(colour, '#141414');
  return new THREE.MeshStandardMaterial({
    color: c,
    // A fabricated aluminium return is brushed, not mirrored: rough enough to
    // scatter, metallic enough to pick up the sky along its length. With an
    // environment to reflect this is what stops the returns reading as flat
    // dark bands, which is most of the CG look on a three-quarter.
    roughness: 0.42,
    metalness: 0.55,
    emissive: truth.returnsEmissive ? c : new THREE.Color(0x000000),
    emissiveIntensity: truth.returnsEmissive && view === 'night' ? 1.4 : 0,
  });
}

export function trimCapMaterial(colour: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: resolveColour(colour, '#141414'),
    roughness: 0.4,
    metalness: 0.1,
    // Trim cap is extruded plastic with a gloss of its own.
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
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

/**
 * A tiling bump map that makes a wall a wall.
 *
 * A perfectly flat surface is the other half of the CG look, and it shows up
 * hardest at night: a halo washing across a plane with no relief lands as a
 * smooth gradient, where in life it rakes across render or block and picks out
 * every irregularity. That texture is most of what makes a photograph of a
 * halo sign read as a photograph.
 *
 * Built as a DataTexture from a coordinate hash rather than drawn on a canvas:
 * no `document`, so it works in a test as well as in the renderer, and no
 * random source, so two runs are identical. It carries no colour — only
 * relief — because MOUNTING SURFACE COLOR is a spec-block line and a texture
 * that tinted the wall would be changing it.
 */
let wallRelief: THREE.DataTexture | null = null;

export function surfaceRelief(): THREE.DataTexture {
  if (wallRelief) return wallRelief;

  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Two octaves: a coarse undulation for the render's own unevenness and a
      // fine grain for the aggregate in it.
      const coarse = hash2(Math.floor(x / 8), Math.floor(y / 8));
      const fine = hash2(x, y);
      const v = Math.round(150 + coarse * 70 + fine * 35);
      const o = (y * size + x) * 4;
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  wallRelief = texture;
  return texture;
}

/** Deterministic value noise in [-1, 1] from integer coordinates. */
function hash2(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (((h ^ (h >>> 16)) >>> 0) / 0xffffffff) * 2 - 1;
}

/** Inches of wall per tile of relief. Coarse render, not fine plaster. */
const RELIEF_TILE_INCHES = 14;

export function surfaceMaterial(
  colour: string,
  /**
   * Real size of the surface, in inches.
   *
   * Without it the relief is tiled a fixed number of times across whatever
   * plane it lands on, so a wide wall stretches it into horizontal banding —
   * it read as brick courses rather than as render. Tiling per inch keeps it
   * isotropic and the same size on every job, which is what a real surface is.
   */
  size?: { w: number; h: number },
): THREE.MeshStandardMaterial {
  const relief = surfaceRelief().clone();
  relief.needsUpdate = true;
  relief.repeat.set(
    Math.max(1, (size?.w ?? RELIEF_TILE_INCHES * 6) / RELIEF_TILE_INCHES),
    Math.max(1, (size?.h ?? RELIEF_TILE_INCHES * 6) / RELIEF_TILE_INCHES),
  );

  return new THREE.MeshStandardMaterial({
    // Relief only, no colour. A halo raking across this is what a photograph
    // of a halo sign looks like — but only if it is deep enough to catch the
    // light. At 1.2 the measured variation across a lit wall was 3 luma out of
    // 255, which is present in the data and invisible to anyone looking.
    bumpMap: relief,
    bumpScale: 4.5,
    color: resolveColour(colour, '#9a9a92'),
    roughness: 0.9,
    metalness: 0.0,
  });
}
