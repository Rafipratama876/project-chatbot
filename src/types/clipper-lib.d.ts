declare module 'clipper-lib' {
  export interface IntPoint { X: number; Y: number }
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
  export const EndType: {
    etClosedPolygon: number; etClosedLine: number;
    etOpenButt: number; etOpenSquare: number; etOpenRound: number;
  };
  export const ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
  export const PolyType: { ptSubject: number; ptClip: number };
  export const PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number };
  export class ClipperOffset {
    constructor(miterLimit?: number, roundPrecision?: number);
    AddPaths(paths: IntPoint[][], joinType: number, endType: number): void;
    Execute(solution: IntPoint[][], delta: number): void;
    Clear(): void;
  }
  export class Clipper {
    constructor(initOptions?: number);
    AddPaths(paths: IntPoint[][], polyType: number, closed: boolean): boolean;
    Execute(clipType: number, solution: IntPoint[][], subjFillType?: number, clipFillType?: number): boolean;
    static Area(poly: IntPoint[]): number;
    static Orientation(poly: IntPoint[]): boolean;
    static CleanPolygons(polys: IntPoint[][], distance?: number): IntPoint[][];
    static SimplifyPolygons(polys: IntPoint[][], fillType?: number): IntPoint[][];
    static PointInPolygon(pt: IntPoint, poly: IntPoint[]): number;
  }
}
