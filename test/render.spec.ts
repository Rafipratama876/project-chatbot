/**
 * Scene-graph assertions. These run headless with no GL context: §9.2 is a set
 * of statements about geometry and materials, and those are checkable on the
 * scene graph itself. Looking at a picture to decide whether the returns are
 * dark is exactly the check this architecture exists to avoid.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { runEngine } from '#/kb/engine/engine.js';
import { buildSignScene } from '#/kb/render/scene.js';
import { makeCamera, panelsFor } from '#/kb/render/views.js';
import { contoursToShapes, extrude } from '#/kb/render/shapes.js';
import { ringAround } from '#/kb/geometry/offset.js';
import { heavenCrepes, haloFlush, nonLitTagline } from './fixtures/jobs.js';
import { logoMark } from './fixtures/blockGlyphs.js';
import { buildRenderContract } from '#/kb/render/contract.js';
import { ENVIRONMENT_INTENSITY } from '#/kb/render/environment.js';
import type { JobInput } from '#/kb/domain/spec.js';

/** A two-colour mark, so hue preservation is testable per fill. */
const colourJob = (opts: { backer?: string; backerColour?: string } = {}): JobInput => ({
  jobId: 'colour-job',
  form: {
    businessName: 'Two Tone',
    channelLetterType: 'Front and Back Lit',
    installationMethod: 'Direct Mounted with Spacers',
    backerPanelOption: opts.backer,
    backerPanelColour: opts.backerColour,
  },
  artwork: [{
    id: 'M1',
    kind: 'shape',
    text: 'mark',
    bbox: { x: 0, y: 0, w: 40, h: 12 },
    capHeight: 12,
    baselineY: 0,
    narrowestStroke: 3,
    colour: '#4d148c',
    colourBreaks: ['#4d148c', '#ff6600'],
    contours: [
      { hole: false, colour: '#4d148c', points: [{ x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 12 }, { x: 0, y: 12 }] },
      { hole: false, colour: '#ff6600', points: [{ x: 22, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 12 }, { x: 22, y: 12 }] },
    ],
  }],
});
import { HARDWARE_PARTS, PARTS } from '#/kb/domain/anatomy.js';
import type { Contour } from '#/kb/domain/spec.js';

/**
 * A surface emits only when BOTH its emissive colour is non-black and its
 * intensity is above zero. MeshStandardMaterial defaults `emissiveIntensity`
 * to 1 with a black emissive colour, so intensity alone reports every mesh in
 * the scene as lit.
 */
const emissiveMeshes = (scene: THREE.Scene): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial | undefined;
    if (!mat?.emissive) return;
    const emits = mat.emissiveIntensity > 0
      && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0);
    if (emits) out.push(m);
  });
  return out;
};

const named = (scene: THREE.Scene, fragment: string): THREE.Object3D[] => {
  const out: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.name.includes(fragment)) out.push(o); });
  return out;
};

describe('one scene graph, two lighting environments', () => {
  it('day and night share the same geometry object, not a rebuild', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const sign = buildSignScene(spec);

    const faces = named(sign.scene, 'CL-P-01 face');
    const uuidsDay = faces.map((f) => (f as THREE.Mesh).geometry.uuid);
    const boundsDay = sign.bounds.clone();

    sign.setView('night');
    const uuidsNight = named(sign.scene, 'CL-P-01 face').map((f) => (f as THREE.Mesh).geometry.uuid);

    // Identical geometry UUIDs: the night view cannot have drifted, because it
    // is not a second interpretation of the sign — it is the same meshes.
    expect(uuidsNight).toEqual(uuidsDay);
    expect(sign.bounds.equals(boundsDay)).toBe(true);
    sign.dispose();
  });

  it('front lit: nothing emits by day; the faces emit at night', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const sign = buildSignScene(spec);

    sign.setView('day');
    expect(emissiveMeshes(sign.scene)).toHaveLength(0);

    sign.setView('night');
    const lit = emissiveMeshes(sign.scene).map((m) => m.name);
    expect(lit.some((n) => n.includes('CL-P-01 face'))).toBe(true);
    expect(lit.some((n) => n.includes('CL-P-02 return'))).toBe(false);
    sign.dispose();
  });

  it('halo: the wall emits, the face does not', async () => {
    const { spec } = await runEngine(haloFlush());
    const sign = buildSignScene(spec);
    sign.setView('night');

    const lit = emissiveMeshes(sign.scene).map((m) => m.name);
    expect(lit.some((n) => n.includes('halo'))).toBe(true);
    expect(lit.some((n) => n.includes('CL-P-01 face'))).toBe(false);
    sign.dispose();
  });

  it('non-lit is dark in both views', async () => {
    const { spec } = await runEngine(nonLitTagline());
    const sign = buildSignScene(spec);
    for (const v of ['day', 'night'] as const) {
      sign.setView(v);
      expect(emissiveMeshes(sign.scene)).toHaveLength(0);
    }
    sign.dispose();
  });

  it('§9.2: no fabrication hardware appears in the scene', async () => {
    const { spec } = await runEngine(haloFlush());
    const sign = buildSignScene(spec);
    for (const id of HARDWARE_PARTS) {
      expect(named(sign.scene, PARTS[id].part), `${id} ${PARTS[id].part} must not be drawn`).toHaveLength(0);
    }
    sign.dispose();
  });

  it('return depth in the scene equals the specified depth', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const sign = buildSignScene(spec);
    const letters = spec.elements.find((e) => e.construction === 'CL-C-01')!;
    const can = named(sign.scene, 'CL-P-02 return')[0] as THREE.Mesh;
    can.geometry.computeBoundingBox();
    const bb = can.geometry.boundingBox!;
    expect(bb.max.z - bb.min.z).toBeCloseTo(letters.returnDepth!, 5);
    sign.dispose();
  });

  it('the halo accumulates: its shells blend additively', async () => {
    // The shells overlap, each covering everything inside its own offset. Under
    // normal blending each one overwrites the last and the only thing visible
    // is the outermost — the faintest — so the halo renders as a grey outline
    // at about 7% brightness. The failure is silent: the materials are all
    // present and all emitting.
    const { spec } = await runEngine(haloFlush());
    const sign = buildSignScene(spec, 'studio');
    sign.setView('night');

    const shells: THREE.Mesh[] = [];
    sign.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && o.parent?.name.includes('halo')) shells.push(m);
    });

    expect(shells.length).toBeGreaterThan(4);
    for (const shell of shells) {
      const mat = shell.material as THREE.MeshStandardMaterial;
      expect(mat.blending).toBe(THREE.AdditiveBlending);
      expect(mat.depthWrite).toBe(false);
      // Drawn after the opaque mounting surface, which is renderOrder 0.
      // Before it, the wall paints straight over a halo that writes no depth.
      expect(shell.renderOrder).toBeGreaterThan(0);
    }
    sign.dispose();
  });

  it('the halo is not merely dimmed by day — it is hidden', async () => {
    // Additive blending adds the fragment colour regardless of alpha, so
    // `opacity = 0` leaves an additive material fully visible. Dimming the
    // shells was not enough: a halo-lit sign carried a white outline in broad
    // daylight, which §9.2 forbids in as many words.
    const { spec } = await runEngine(haloFlush());
    const sign = buildSignScene(spec, 'studio');

    const shells = (): THREE.Mesh[] => {
      const out: THREE.Mesh[] = [];
      sign.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && o.name.startsWith('halo shell')) out.push(m);
      });
      return out;
    };

    sign.setView('day');
    expect(shells().length).toBeGreaterThan(4);
    for (const shell of shells()) expect(shell.visible, 'halo must be hidden by day').toBe(false);

    sign.setView('night');
    for (const shell of shells()) expect(shell.visible).toBe(true);
    sign.dispose();
  });

  it('the halo brightens toward the letterform', async () => {
    const { spec } = await runEngine(haloFlush());
    const sign = buildSignScene(spec, 'studio');
    sign.setView('night');

    const intensities: number[] = [];
    sign.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && o.parent?.name.includes('halo')) {
        intensities.push((m.material as THREE.MeshStandardMaterial).emissiveIntensity);
      }
    });

    // Shells are built inner to outer, so intensity must fall monotonically.
    for (let i = 1; i < intensities.length; i++) {
      expect(intensities[i]!).toBeLessThanOrEqual(intensities[i - 1]!);
    }
    expect(intensities[0]!).toBeGreaterThan(intensities[intensities.length - 1]!);
    sign.dispose();
  });

  it('a rear-illuminated logo box haloes too', async () => {
    // §9.2's logo-box row describes the FACE. Whether anything glows behind it
    // is a property of the sign type, exactly as for channel letters.
    const { spec } = await runEngine({
      jobId: 'halo-logo-box',
      form: {
        businessName: 'Wing Mark Co',
        channelLetterType: 'Back Lit',
        installationMethod: 'Direct Mounted with Spacers',
      },
      artwork: [logoMark({ x: 0, y: 0, size: 24, counter: true })],
    });

    const box = spec.elements.find((e) => e.construction === 'CL-C-03')!;
    expect(box.standoff).toBeGreaterThanOrEqual(1.5);

    const truth = buildRenderContract(spec).elements.find((e) => e.construction === 'CL-C-03')!;
    expect(truth.night.backgroundEmissive).toBe(true);
    expect(truth.standoffGap).toBeGreaterThanOrEqual(1.5);
  });

  it('a lit face keeps its colour at night', async () => {
    // The scene is tone-mapped, which rolls off the brightest channel first.
    // FedEx orange is already at full red, so an emissive multiplier clipped
    // red while green climbed and the "Ex" rendered YELLOW at night while
    // staying orange by day — the same sign in two colours.
    const { spec } = await runEngine(colourJob());
    const sign = buildSignScene(spec, 'studio');

    const faceOf = (colour: string): THREE.MeshStandardMaterial | undefined => {
      let found: THREE.MeshStandardMaterial | undefined;
      sign.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && o.name.includes(colour)) found = m.material as THREE.MeshStandardMaterial;
      });
      return found;
    };

    sign.setView('night');
    const orange = faceOf('#ff6600');
    expect(orange, 'the orange face should exist').toBeDefined();

    // The emitted colour is the acrylic colour, exactly.
    expect(orange!.emissive.getHexString()).toBe('ff6600');
    // And it is taken out of the tone-mapping curve, which is what preserves it.
    expect(orange!.toneMapped).toBe(false);

    sign.setView('day');
    expect(orange!.color.getHexString()).toBe('ff6600');
    expect(orange!.emissiveIntensity).toBe(0);
    expect(orange!.toneMapped).toBe(true);
    sign.dispose();
  });

  it('the halo takes the colour of the surface it washes', async () => {
    // What a customer sees is not the LED, it is the LED reflected off whatever
    // is behind the sign. White LEDs on a yellow backer read yellow.
    const { spec } = await runEngine(colourJob({ backer: 'Contour Flat', backerColour: 'Yellow' }));
    expect(spec.backer.present, 'the backer form value must reach the spec').toBe(true);
    expect(spec.backer.colour).toBe('Yellow');

    const sign = buildSignScene(spec, 'studio');
    sign.setView('night');

    let shell: THREE.MeshStandardMaterial | undefined;
    sign.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && o.name.startsWith('halo shell 1')) shell = m.material as THREE.MeshStandardMaterial;
    });

    expect(shell, 'a halo shell should exist').toBeDefined();
    // Yellow surface: red and green present, blue extinguished.
    expect(shell!.emissive.b).toBeLessThan(0.15);
    expect(shell!.emissive.r).toBeGreaterThan(0.5);
    expect(shell!.emissive.g).toBeGreaterThan(0.4);
    sign.dispose();
  });

  it('§4.5: the backer form value reaches the spec at all', async () => {
    // It was accepted by the schema, offered by the options endpoint and listed
    // as patchable — and never read. Choosing "Contour Flat" did nothing.
    const withBacker = await runEngine(colourJob({ backer: 'Contour Flat', backerColour: 'Yellow' }));
    expect(withBacker.spec.backer.present).toBe(true);
    expect(withBacker.spec.backer.shape).toBe('contour-flat');
    expect(withBacker.spec.backer.w).toBeGreaterThan(withBacker.spec.overall.w);

    const without = await runEngine(colourJob());
    expect(without.spec.backer.present).toBe(false);
  });

  it('§9.1 panel set covers every required view, and both get a 3/4', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const panels = panelsFor(spec.views);
    expect(new Set(panels.map((p) => p.view))).toEqual(new Set(['day', 'night']));
    expect(panels.some((p) => p.camera === 'front-elevation')).toBe(true);
    // The night panel on the sheet is the 3/4 — the only angle where the
    // return depth, the standoff gap and the halo are visible together.
    expect(panels.some((p) => p.view === 'night' && p.camera === 'detail-perspective')).toBe(true);
  });

  it('the front elevation is orthographic — a proof carries dimensions off it', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const sign = buildSignScene(spec);
    expect(makeCamera(sign, 'front-elevation').camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(makeCamera(sign, 'perspective').camera).toBeInstanceOf(THREE.PerspectiveCamera);
    sign.dispose();
  });
});

describe('shape assembly', () => {
  const rect = (x: number, y: number, w: number, h: number, hole = false): Contour => ({
    hole,
    points: hole
      ? [{ x, y }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w, y }]
      : [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
  });

  it('assigns each hole to the innermost outer that contains it', () => {
    // Three levels of nesting, as a trim-cap ring around a counter produces.
    const nested = [
      rect(0, 0, 20, 20),
      rect(2, 2, 16, 16, true),
      rect(4, 4, 12, 12),
      rect(6, 6, 8, 8, true),
    ];
    const shapes = contoursToShapes(nested);
    expect(shapes).toHaveLength(2);
    // Each outer gets exactly one hole — never the same hole twice.
    expect(shapes.map((s) => s.holes.length)).toEqual([1, 1]);
  });

  it('a trim cap ring is a band, not a solid over the face', () => {
    const letter = [rect(0, 0, 10, 20)];
    const ring = ringAround(letter, 1);
    const geo = extrude(ring, { depth: 0.125 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    // Grown by 1" on every side.
    expect(bb.min.x).toBeCloseTo(-1, 2);
    expect(bb.max.x).toBeCloseTo(11, 2);
    // The band has a hole where the face sits, so it is not a filled slab.
    const shapes = contoursToShapes(ring);
    expect(shapes.reduce((n, s) => n + s.holes.length, 0)).toBeGreaterThan(0);
  });
});

/**
 * Reflections, gloss and the rim.
 *
 * These are why a render reads as CG rather than as a photograph, and none of
 * them touches geometry — but two of them CAN change what §9.2 says about the
 * night frame, which is what these pin down.
 */
describe('surface realism', () => {
  // Matched on the part code, not the word. `/face/i` also matches
  // "CL-P-31 mounting surface", which quietly pulled a wall into a test about
  // letter faces and failed on a property walls do not have.
  const materialsOf = (scene: THREE.Scene, name: RegExp): THREE.Material[] => {
    const found: THREE.Material[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && name.test(mesh.name)) {
        found.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
      }
    });
    return found;
  };

  it('the environment all but disappears at night', () => {
    // §9.2 asks that the only bright things in a night frame are what the
    // contract says emit. An environment bright enough to model a room would
    // light a face the contract says is dark.
    expect(ENVIRONMENT_INTENSITY.night).toBeLessThan(ENVIRONMENT_INTENSITY.day / 5);
    expect(ENVIRONMENT_INTENSITY.night).toBeGreaterThan(0);
  });

  it('an acrylic face has a gloss layer over its pigment, not a shiny pigment', async () => {
    // Gloss comes from the lights, not from an environment — see the test
    // below on why faces get no environment at all.
    // Dropping roughness would make the colour itself shiny. A clearcoat is a
    // thin specular layer on top of a matte pigment, which is what acrylic is.
    const { spec } = await runEngine(heavenCrepes());
    const scene = buildSignScene(spec, 'studio');
    const faces = materialsOf(scene.scene, /^CL-P-01 face$/) as THREE.MeshPhysicalMaterial[];
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      expect(f.clearcoat).toBeGreaterThan(0);
      expect(f.roughness).toBeGreaterThan(0.3);
    }
  });

  it('a lit face does not also mirror its surroundings', async () => {
    // A face that emits AND reflects reads as a wet surface rather than a sign.
    const { spec } = await runEngine(heavenCrepes());
    const scene = buildSignScene(spec, 'studio');
    scene.setView('night');
    const lit = (materialsOf(scene.scene, /^CL-P-01 face$/) as THREE.MeshPhysicalMaterial[])
      .filter((m) => m.emissiveIntensity > 0);
    for (const m of lit) expect(m.envMapIntensity).toBe(0);
  });

  it('the night rig has a rim, so returns are not a flat cut-out', async () => {
    // Dark returns against a dark ground have no edge at all without one, and
    // the three-quarter exists precisely to show that edge.
    const { spec } = await runEngine(haloFlush());
    const scene = buildSignScene(spec, 'studio');
    scene.setView('night');

    const directional: THREE.DirectionalLight[] = [];
    scene.scene.traverse((o) => {
      if ((o as THREE.DirectionalLight).isDirectionalLight) {
        directional.push(o as THREE.DirectionalLight);
      }
    });
    // At least one lighting the sign from behind the wall plane.
    expect(directional.some((l) => l.position.z < 0)).toBe(true);
  });

  it('no surface carrying a specified colour is ever given an environment', async () => {
    // The regression this exists for: `scene.environment` applies to
    // everything, and letter faces rendered #7d52d2 against a specified
    // #4d148c. Turning the face's own envMapIntensity down to 0.12 moved the
    // measured colour by ONE unit — the environment reaches a physical
    // material by more than one path, so the only reliable fix is to give
    // those surfaces no environment at all.
    const environment = new THREE.Texture();
    for (const job of [heavenCrepes(), colourJob()]) {
      const { spec } = await runEngine(job);
      const scene = buildSignScene(spec, 'studio', undefined, environment);

      const offenders: string[] = [];
      scene.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!/face|vinyl|copy/i.test(mesh.name) || /surface/i.test(mesh.name)) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.envMap || std.envMapIntensity > 0) {
            offenders.push(`${mesh.name} (envMap=${!!std.envMap}, i=${std.envMapIntensity})`);
          }
        }
      });
      expect(offenders, 'these would be washed out by an environment').toEqual([]);
    }
  });

  it('the metal does get one — that is the point of having it', async () => {
    const environment = new THREE.Texture();
    const { spec } = await runEngine(heavenCrepes());
    const scene = buildSignScene(spec, 'studio', undefined, environment);

    const returns: THREE.MeshStandardMaterial[] = [];
    scene.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === 'CL-P-02 return') {
        returns.push(mesh.material as THREE.MeshStandardMaterial);
      }
    });
    expect(returns.length).toBeGreaterThan(0);
    for (const r of returns) {
      expect(r.envMap).toBe(environment);
      expect(r.envMapIntensity).toBeGreaterThan(0.5);
    }
  });

  it('reflections fade with the light rather than persisting into the night', async () => {
    const environment = new THREE.Texture();
    const { spec } = await runEngine(heavenCrepes());
    const scene = buildSignScene(spec, 'studio', undefined, environment);

    const returnMat = (): THREE.MeshStandardMaterial => {
      let found: THREE.MeshStandardMaterial | null = null;
      scene.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name === 'CL-P-02 return') {
          found = mesh.material as THREE.MeshStandardMaterial;
        }
      });
      return found!;
    };

    scene.setView('day');
    const byDay = returnMat().envMapIntensity;
    scene.setView('night');
    const byNight = returnMat().envMapIntensity;
    expect(byNight).toBeLessThan(byDay);
    expect(byNight).toBeGreaterThan(0);
  });

  it('the wall has relief but no colour of its own', async () => {
    // A halo raking across a textured wall is most of what makes a photograph
    // of a halo sign read as a photograph. Relief only: MOUNTING SURFACE COLOR
    // is a spec-block line, and a texture that tinted the wall would change it.
    const { spec } = await runEngine(heavenCrepes());
    const scene = buildSignScene(spec, 'studio');
    let wall: THREE.MeshStandardMaterial | null = null;
    scene.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === 'CL-P-31 mounting surface') {
        wall = mesh.material as THREE.MeshStandardMaterial;
      }
    });
    expect(wall!.bumpMap).toBeTruthy();
    expect(wall!.map).toBeFalsy();
  });

  it('the wall relief is the same texture every run', async () => {
    // Generated from a coordinate hash, not a random source: two runs of the
    // same spec have to produce the same bytes.
    const { surfaceRelief } = await import('#/kb/render/materials.js');
    const a = surfaceRelief();
    const b = surfaceRelief();
    expect(a).toBe(b);
    expect((a.image.data as Uint8Array).length).toBeGreaterThan(0);
  });

  it('returns are metallic enough to catch an environment', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const scene = buildSignScene(spec, 'studio');
    const returns = materialsOf(scene.scene, /^CL-P-02 return$/) as THREE.MeshStandardMaterial[];
    expect(returns.length).toBeGreaterThan(0);
    for (const r of returns) expect(r.metalness).toBeGreaterThan(0.4);
  });
});
