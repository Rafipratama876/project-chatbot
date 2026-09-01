/**
 * The framework-free core.
 *
 * Nothing under `src/kb/` imports from NestJS, and nothing here reaches a
 * database, an HTTP client or a model. It is the 56 KB rules, the geometry they
 * operate on, and the output contract they produce — pure functions over plain
 * data.
 *
 * That boundary is deliberate. The rule engine is the part of this system that
 * has to be deterministic and testable in isolation; wiring it to a DI
 * container would make "does CL-R-51 fire at 4 inches?" a question you need an
 * application context to answer. The Nest modules under `src/modules/` supply
 * the ports (thresholds from Postgres, judgment from a model, pixels from a
 * browser) and call in.
 */
export * from './domain/units.js';
export * from './domain/taxonomy.js';
export * from './domain/anatomy.js';
export * from './domain/materials.js';
export * from './domain/compat.js';
export * from './domain/visibility.js';
export * from './domain/boilerplate.js';
export * from './domain/thresholds.js';
export * from './domain/spec.js';

export * from './geometry/poly.js';
export * from './geometry/metrics.js';
export * from './geometry/offset.js';
export * from './geometry/counters.js';
export * from './geometry/grouping.js';
export * from './geometry/decisionTree.js';
export * from './geometry/boxSizing.js';
export * from './geometry/outline.js';

export * from './engine/gates.js';
export * from './engine/trace.js';
export * from './engine/precedence.js';
export * from './engine/rule.js';
export * from './engine/engine.js';
export * from './engine/path.js';
export { ALL_RULES, KB_RULE_IDS, implementedRuleIds, COMPOSITE_RULE_IDS } from './engine/rules/index.js';

export * from './render/contract.js';
export * from './render/scene.js';
export * from './render/views.js';
export * from './render/shapes.js';
export {
  resolveColour, faceMaterial, returnMaterial, trimCapMaterial, haloMaterial, surfaceMaterial,
} from './render/materials.js';

export * from './output/specBlock.js';
export * from './output/disclosures.js';
export * from './output/proof.js';
