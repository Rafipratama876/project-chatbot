/** Dotted/indexed path access — `elements[2].face.colour`. */

export type PathSegment = string | number;

export function parsePath(path: string): PathSegment[] {
  const out: PathSegment[] = [];
  for (const part of path.split('.')) {
    const m = /^([^[\]]+)((\[\d+\])*)$/.exec(part);
    if (!m) throw new Error(`bad path segment: ${part} in ${path}`);
    out.push(m[1]!);
    const idx = m[2] ?? '';
    for (const i of idx.matchAll(/\[(\d+)\]/g)) out.push(Number(i[1]));
  }
  return out;
}

export function getPath(root: unknown, path: string): unknown {
  let cur: any = root;
  for (const seg of parsePath(path)) {
    if (cur == null) return undefined;
    cur = cur[seg as any];
  }
  return cur;
}

export function setPath(root: unknown, path: string, value: unknown): void {
  const segs = parsePath(path);
  let cur: any = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    if (cur[seg as any] == null) {
      cur[seg as any] = typeof segs[i + 1] === 'number' ? [] : {};
    }
    cur = cur[seg as any];
  }
  cur[segs[segs.length - 1] as any] = value;
}

/** Structural clone that survives `before`/`after` snapshots in the trace. */
export function snapshot<T>(v: T): T {
  if (v === undefined || typeof v === 'function') return v;
  return JSON.parse(JSON.stringify(v)) as T;
}
