/**
 * The render bundle — what a downstream proposal service receives instead of a
 * board.
 *
 * This service renders the sign; it does not decide how the sign is presented.
 * The bundle is therefore everything a composer needs and nothing about layout:
 * the three.js captures, the two measured drawings, the §9.3 rows, and the
 * construction values as data rather than prose.
 *
 * `construction` keys are the consumer's own canonical field ids
 * (`channelLetterType`, `returnDepth`, `faceColor`, …) rather than this
 * codebase's spelling. The consumer already has a field vocabulary and a
 * renderer keyed to it; emitting ours would put a translation table between
 * two systems that both already know the answer, and a translation table is
 * where a return depth quietly becomes the wrong number.
 *
 * The drawings are SVG source, not PNG. They are vector already, the consumer
 * rasterizes with sharp at its own panel bounds, and a PNG baked here would be
 * resampled to a size this service cannot know.
 */

/** §9.3 rows, pre-rendered as label/value pairs. */
export interface BundleSpecRow {
  label: string;
  value: string;
}

/**
 * The measured construction, as data.
 *
 * Every value here survived all six gates: defaults are applied and logged,
 * device colours are gone, and a depth is the depth §6.3 settled. A value the
 * customer never supplied and no rule could derive is `null` — never a
 * placeholder string, because "TBD" composes into a proof as if it were an
 * answer.
 */
export interface BundleConstruction {
  channelLetterType: string | null;
  faceColor: string | null;
  faceColorTreatment: string | null;
  trimCapColor: string | null;
  returnColor: string | null;
  /** Inches. §4.3: the trim cap projection is recorded separately, not added. */
  returnDepth: number | null;
  overallWidth: number | null;
  overallHeight: number | null;
  /** Square feet. */
  overallArea: number | null;
  /** Cap height of the primary element, in inches. */
  letterHeight: number | null;
  installationMethod: string | null;
  backerPanel: string | null;
  backerPanelColor: string | null;
  signQuantity: number | null;
  /** Inches. Rear-illuminated elements only (§6.5). */
  standoff: number | null;
  illumination: string | null;
}

export interface BundlePanel {
  view: 'day' | 'night';
  camera: 'front-elevation' | 'perspective' | 'detail-perspective';
  label: string;
  /** Absolute URL, fetchable with the same API key that requested the bundle. */
  url: string;
  /** Set when the panel could not use the customer's photograph, saying why. */
  note: string | null;
}

export interface BundleDrawings {
  /** Measured front elevation, drawn from the traced contours. */
  elevation: string;
  /** Wall-to-letter section: return depth, standoff, backer, trim cap. */
  section: string;
}

export interface RenderBundle {
  proofId: string;
  jobId: string;
  kbVersion: string;
  businessName: string;
  /** 6 panels for an illuminated sign, 3 for a non-illuminated one. */
  panels: BundlePanel[];
  drawings: BundleDrawings;
  specRows: BundleSpecRow[];
  construction: BundleConstruction;
  /** §9.4 disclosure text, derived from the rule trace. */
  disclosures: string;
  /** What a human has to decide before this can be fabricated. */
  escalations: Array<{ ruleId: string; reason: string; question: string }>;
  /** Non-empty means the proof must not ship. */
  problems: string[];
  blocked: boolean;
  hardStop: string;
}
