/**
 * Every tunable number the rule engine reads, with its KB provenance tag.
 *
 * Why this is a store and not a pile of `const`s: the KB tags values `[DER]`
 * (derived, confirm if wrong), `[AVG]` (collapsed from a vendor spread) and
 * `[SP]` (Sign Pack internal). A `[DER]` value is a guess until a vendor
 * confirms it. Those must be correctable by editing a row, not by shipping a
 * release — so the engine never inlines them.
 *
 * `MemoryThresholdStore` is the default for tests and local runs.
 * `db/thresholds.sql` has the Postgres table + the same seed.
 */

export type Provenance = 'DER' | 'AVG' | 'SP' | 'EXT' | 'KB';

export interface Threshold {
  key: string;
  value: number;
  unit: 'in' | 'ft' | 'pct' | 'count' | 'sqft';
  source: Provenance;
  kbRef: string;
  /** false for `[DER]` until a vendor confirms it. Surfaces in the audit log. */
  verified: boolean;
  note?: string;
}

export const THRESHOLD_SEED: Threshold[] = [
  // §6.1 stroke and height — [AVG], collapsed from the Appendix A spread
  { key: 'stroke.min.illuminated', value: 1.5, unit: 'in', source: 'AVG', kbRef: 'CL-R-01', verified: true },
  { key: 'stroke.min.front_and_back', value: 2, unit: 'in', source: 'AVG', kbRef: 'CL-R-02', verified: true },
  { key: 'stroke.min.non_illuminated', value: 1, unit: 'in', source: 'AVG', kbRef: 'CL-R-03', verified: true },
  { key: 'height.min.illuminated', value: 8, unit: 'in', source: 'AVG', kbRef: 'CL-R-07', verified: true },
  { key: 'height.min.illuminated.serif_script', value: 10, unit: 'in', source: 'AVG', kbRef: 'CL-R-07', verified: true },
  { key: 'height.min.non_illuminated', value: 3, unit: 'in', source: 'AVG', kbRef: 'CL-R-08', verified: true },

  // §3.5 / §3.6 composition — [DER], NOT vendor-confirmed
  { key: 'composition.min_dimensional_cap_height', value: 2, unit: 'in', source: 'DER', kbRef: '§3.5, §3.6, CL-R-53', verified: false, note: 'Below this, applied vinyl. Confirm with fabrication.' },
  { key: 'box.min_height', value: 4, unit: 'in', source: 'DER', kbRef: '§3.6, CL-R-55', verified: false, note: 'Room for LED modules (0.5–0.8″) plus mixing distance.' },
  { key: 'box.copy_margin', value: 1, unit: 'in', source: 'DER', kbRef: '§3.6', verified: false, note: 'Margin above AND below copy; box height adds 2× this.' },
  { key: 'box.corner_radius.rounded_min', value: 1, unit: 'in', source: 'DER', kbRef: '§3.6', verified: false },
  { key: 'box.corner_radius.rounded_max', value: 2, unit: 'in', source: 'DER', kbRef: '§3.6', verified: false },

  // §3.2 grouping
  { key: 'grouping.cap_height_tolerance', value: 0.15, unit: 'pct', source: 'SP', kbRef: '§3.2', verified: true },
  { key: 'role.tagline.min_ratio', value: 0.25, unit: 'pct', source: 'SP', kbRef: '§3.1 CL-E-03, CL-R-49', verified: true },
  { key: 'role.tagline.max_ratio', value: 0.40, unit: 'pct', source: 'SP', kbRef: '§3.1 CL-E-03, CL-R-49', verified: true },
  { key: 'role.secondary.min_ratio', value: 0.70, unit: 'pct', source: 'SP', kbRef: '§3.1 CL-E-02', verified: true },

  // §6.2 face
  { key: 'face.max_acrylic_letter_height', value: 48, unit: 'in', source: 'KB', kbRef: 'CL-R-09', verified: true },
  { key: 'face.max_standard_w', value: 60, unit: 'in', source: 'SP', kbRef: 'CL-R-10', verified: true },
  { key: 'face.max_standard_h', value: 120, unit: 'in', source: 'SP', kbRef: 'CL-R-10', verified: true },
  { key: 'face.retainer_height_threshold', value: 48, unit: 'in', source: 'SP', kbRef: 'CL-R-13', verified: true },
  { key: 'face.retainer_width_threshold', value: 120, unit: 'in', source: 'SP', kbRef: 'CL-R-13', verified: true },
  { key: 'face.retainer_circle_threshold', value: 72, unit: 'in', source: 'SP', kbRef: 'CL-R-13', verified: true },
  { key: 'face.max_polycarbonate_width', value: 104, unit: 'in', source: 'EXT', kbRef: 'CL-R-14', verified: true },
  { key: 'face.max_inhouse_print_width', value: 52, unit: 'in', source: 'SP', kbRef: 'CL-R-15', verified: true },
  { key: 'face.max_formed_w', value: 96, unit: 'in', source: 'AVG', kbRef: 'CL-R-17', verified: true },
  { key: 'face.max_formed_h', value: 168, unit: 'in', source: 'AVG', kbRef: 'CL-R-17', verified: true },
  { key: 'face.oversize_shipping_min_dim', value: 168, unit: 'in', source: 'KB', kbRef: 'CL-R-18', verified: true },

  // §6.3 depth
  { key: 'depth.frontlit_hotspot_threshold', value: 3, unit: 'in', source: 'KB', kbRef: 'CL-R-22', verified: true },
  { key: 'depth.backer_min_with_supplies', value: 4, unit: 'in', source: 'SP', kbRef: 'CL-R-23', verified: true },

  // §6.4 mounting
  { key: 'mount.raceway_max_letter_height', value: 36, unit: 'in', source: 'SP', kbRef: 'CL-R-27', verified: true },
  { key: 'mount.bottom_rail_review_height', value: 36, unit: 'in', source: 'KB', kbRef: 'CL-R-30', verified: true },
  { key: 'mount.bottom_rail_review_length', value: 120, unit: 'in', source: 'KB', kbRef: 'CL-R-30', verified: true },
  { key: 'mount.min_attachment_points', value: 2, unit: 'count', source: 'SP', kbRef: 'CL-R-29', verified: true },

  // §8.1 / §6.5 standoff
  { key: 'standoff.min', value: 1.5, unit: 'in', source: 'KB', kbRef: 'CL-D-18, CL-R-37', verified: true },
  { key: 'standoff.max', value: 2, unit: 'in', source: 'KB', kbRef: 'CL-D-18, CL-R-37', verified: true },
];

export interface ThresholdStore {
  get(key: string): number;
  meta(key: string): Threshold;
  all(): Threshold[];
  /** Rows a proof should footnote as unverified — every `[DER]` that was read. */
  unverifiedReads(): Threshold[];
}

export class MemoryThresholdStore implements ThresholdStore {
  private readonly map = new Map<string, Threshold>();
  private readonly reads = new Set<string>();

  constructor(seed: Threshold[] = THRESHOLD_SEED, overrides: Record<string, number> = {}) {
    for (const t of seed) this.map.set(t.key, { ...t });
    for (const [k, v] of Object.entries(overrides)) {
      const cur = this.map.get(k);
      if (!cur) throw new Error(`threshold override for unknown key: ${k}`);
      this.map.set(k, { ...cur, value: v, source: cur.source, note: `${cur.note ?? ''} [overridden]`.trim() });
    }
  }

  get(key: string): number {
    const t = this.map.get(key);
    if (!t) throw new Error(`unknown threshold: ${key}`);
    this.reads.add(key);
    return t.value;
  }

  meta(key: string): Threshold {
    const t = this.map.get(key);
    if (!t) throw new Error(`unknown threshold: ${key}`);
    return t;
  }

  all(): Threshold[] { return [...this.map.values()]; }

  unverifiedReads(): Threshold[] {
    return [...this.reads].map((k) => this.map.get(k)!).filter((t) => !t.verified);
  }
}

export const defaultThresholds = (): ThresholdStore => new MemoryThresholdStore();
