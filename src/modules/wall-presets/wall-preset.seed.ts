/**
 * The stock walls, drawn rather than photographed.
 *
 * A drawn wall is honest about what a preset is. A stock photograph of someone
 * else's building invites exactly the mistake the presets exist to avoid —
 * reading the result as a proof of THIS site — whereas an obvious illustration
 * cannot be mistaken for the customer's storefront. It also means no binary
 * assets in the repository and no licence to track.
 *
 * Each preset carries the real width of the wall it depicts, so a sign placed
 * on one is still measured in inches instead of guessed.
 */
import { PNG } from 'pngjs';

export interface PresetSpec {
  name: string;
  description: string;
  /** How wide the depicted wall really is, edge to edge of the image. */
  imageWidthInches: number;
  draw: (c: Canvas) => void;
}

export const PRESET_WIDTH = 1600;
export const PRESET_HEIGHT = 1000;

type Rgb = [number, number, number];

/** A deliberately small drawing surface — rectangles, gradients and noise. */
export class Canvas {
  readonly data: Buffer;

  constructor(readonly width: number, readonly height: number) {
    this.data = Buffer.alloc(width * height * 4, 255);
  }

  fill(x0: number, y0: number, w: number, h: number, colour: Rgb): void {
    const x1 = Math.min(this.width, Math.round(x0 + w));
    const y1 = Math.min(this.height, Math.round(y0 + h));
    for (let y = Math.max(0, Math.round(y0)); y < y1; y++) {
      for (let x = Math.max(0, Math.round(x0)); x < x1; x++) {
        this.set(x, y, colour);
      }
    }
  }

  /** Vertical gradient — what makes a flat block read as lit rather than printed. */
  gradient(x0: number, y0: number, w: number, h: number, top: Rgb, bottom: Rgb): void {
    const y1 = Math.min(this.height, Math.round(y0 + h));
    const start = Math.max(0, Math.round(y0));
    const span = Math.max(1, y1 - start);
    for (let y = start; y < y1; y++) {
      const t = (y - start) / span;
      const colour: Rgb = [
        Math.round(top[0] + (bottom[0] - top[0]) * t),
        Math.round(top[1] + (bottom[1] - top[1]) * t),
        Math.round(top[2] + (bottom[2] - top[2]) * t),
      ];
      this.fill(x0, y, w, 1, colour);
    }
  }

  /**
   * Deterministic per-pixel jitter. Seeded from the coordinates rather than a
   * random generator so two runs produce byte-identical presets — a preset
   * that changes on every boot would invalidate every proof rendered against
   * the previous one without anything saying it had.
   */
  noise(x0: number, y0: number, w: number, h: number, amount: number): void {
    const x1 = Math.min(this.width, Math.round(x0 + w));
    const y1 = Math.min(this.height, Math.round(y0 + h));
    for (let y = Math.max(0, Math.round(y0)); y < y1; y++) {
      for (let x = Math.max(0, Math.round(x0)); x < x1; x++) {
        const hash = (x * 73856093) ^ (y * 19349663);
        const jitter = (((hash >>> 8) & 255) / 255 - 0.5) * 2 * amount;
        const i = (y * this.width + x) * 4;
        this.data[i] = clamp(this.data[i]! + jitter);
        this.data[i + 1] = clamp(this.data[i + 1]! + jitter);
        this.data[i + 2] = clamp(this.data[i + 2]! + jitter);
      }
    }
  }

  private set(x: number, y: number, [r, g, b]: Rgb): void {
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
  }

  toPng(): Buffer {
    const png = new PNG({ width: this.width, height: this.height });
    png.data = this.data;
    return PNG.sync.write(png);
  }
}

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Sky, then ground, then whatever the wall is — every preset starts here. */
function backdrop(c: Canvas, wall: { top: number; height: number }): void {
  c.gradient(0, 0, c.width, c.height, [150, 188, 222], [206, 224, 238]);
  c.gradient(0, wall.top + wall.height, c.width, c.height, [122, 124, 128], [88, 90, 94]);
  c.noise(0, wall.top + wall.height, c.width, c.height, 10);
}

/** The shadow line a fascia casts on the wall below it. */
function fasciaShadow(c: Canvas, x: number, y: number, w: number): void {
  c.fill(x, y, w, 6, [0, 0, 0]);
  c.gradient(x, y + 6, w, 26, [70, 66, 62], [150, 146, 140]);
}

export const PRESETS: PresetSpec[] = [
  {
    name: 'Brick Storefront',
    description: 'A single-storey brick front with a recessed entry. Wall is 40 ft wide.',
    imageWidthInches: 480,
    draw: (c) => {
      const top = 120;
      const height = 640;
      backdrop(c, { top, height });

      c.gradient(0, top, c.width, height, [150, 92, 74], [124, 74, 60]);
      // Courses, not individual bricks: at this size a drawn brick pattern is
      // noise, and what the eye reads as brick is the horizontal banding.
      for (let y = top; y < top + height; y += 26) {
        c.fill(0, y, c.width, 3, [178, 132, 112]);
      }
      c.noise(0, top, c.width, height, 14);

      c.gradient(0, top, c.width, 46, [96, 58, 46], [132, 82, 66]);
      fasciaShadow(c, 0, top + 46, c.width);

      // Windows and a door, which is what anyone measuring this will measure.
      c.gradient(180, 440, 380, 300, [58, 74, 88], [96, 116, 132]);
      c.fill(170, 430, 400, 12, [232, 230, 226]);
      c.gradient(1040, 440, 380, 300, [58, 74, 88], [96, 116, 132]);
      c.fill(1030, 430, 400, 12, [232, 230, 226]);
      c.gradient(700, 420, 200, 340, [42, 54, 66], [72, 88, 102]);
      c.fill(690, 410, 220, 12, [232, 230, 226]);
    },
  },
  {
    name: 'Stucco Facade',
    description: 'A pale stucco band above a glazed shopfront. Wall is 50 ft wide.',
    imageWidthInches: 600,
    draw: (c) => {
      const top = 90;
      const height = 680;
      backdrop(c, { top, height });

      c.gradient(0, top, c.width, height, [232, 226, 212], [206, 199, 184]);
      c.noise(0, top, c.width, height, 9);

      c.gradient(0, top, c.width, 34, [186, 178, 164], [214, 207, 192]);
      fasciaShadow(c, 0, top + 34, c.width);

      // A continuous glazed line — the hardest case for placement, because
      // there is very little solid wall to land a sign on.
      c.gradient(120, 480, 1360, 290, [66, 88, 104], [118, 142, 158]);
      c.fill(110, 468, 1380, 14, [244, 242, 238]);
      for (let x = 120; x < 1480; x += 226) c.fill(x, 480, 10, 290, [238, 236, 232]);
    },
  },
  {
    name: 'Painted Block Wall',
    description: 'A plain painted block wall with no openings. Wall is 30 ft wide.',
    imageWidthInches: 360,
    draw: (c) => {
      const top = 100;
      const height = 700;
      backdrop(c, { top, height });

      c.gradient(0, top, c.width, height, [212, 214, 210], [178, 181, 178]);
      for (let y = top; y < top + height; y += 42) c.fill(0, y, c.width, 2, [162, 165, 162]);
      for (let y = top; y < top + height; y += 42) {
        const offset = ((y - top) / 42) % 2 === 0 ? 0 : 84;
        for (let x = offset; x < c.width; x += 168) c.fill(x, y, 2, 42, [162, 165, 162]);
      }
      c.noise(0, top, c.width, height, 8);
      fasciaShadow(c, 0, top, c.width);
    },
  },
  {
    name: 'Metal Fascia',
    description: 'A dark metal fascia band over a light base. Wall is 60 ft wide.',
    imageWidthInches: 720,
    draw: (c) => {
      const top = 110;
      const height = 660;
      backdrop(c, { top, height });

      c.gradient(0, top + 300, c.width, height - 300, [226, 224, 220], [196, 194, 190]);
      c.noise(0, top + 300, c.width, height - 300, 7);

      c.gradient(0, top, c.width, 300, [52, 56, 64], [34, 37, 44]);
      // The seams between panels — the thing that tells you the fascia is
      // metal rather than a painted band.
      for (let x = 0; x < c.width; x += 200) c.fill(x, top, 3, 300, [78, 82, 92]);
      c.fill(0, top, c.width, 5, [104, 110, 122]);
      fasciaShadow(c, 0, top + 300, c.width);

      c.gradient(160, 520, 1280, 250, [70, 92, 108], [120, 144, 160]);
    },
  },
];
