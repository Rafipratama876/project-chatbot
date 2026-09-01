import { useEffect, useRef, useState } from 'react';

interface Box {
  xFrac: number;      // 0–1, left edge as a fraction of the image width
  yFrac: number;      // 0–1, top edge as a fraction of the image height
  widthFrac: number;  // 0–1, box width as a fraction of the image width
  heightFrac: number; // 0–1, box height as a fraction of the image height
}

interface Props {
  wallImageUrl: string;
  logoUrl?: string | null;
  logoText?: string;
  value: Box;
  onChange: (box: Box) => void;
  /**
   * The sign's real width ÷ height. When set, the box's height is derived from
   * it rather than dragged independently. Left null when a wall face is
   * marked: there the box is the measurement and the inches follow it, so
   * constraining the box to the inches would be circular.
   */
  signAspect?: number | null;
  /** The wall image's natural pixel size, once it has loaded. */
  onSize?: (size: { w: number; h: number }) => void;
}

type DragMode = 'move' | 'resize' | null;

/**
 * Placing the sign on the wall.
 *
 * Two things here are load-bearing rather than cosmetic:
 *
 * 1. The image is shown at its OWN aspect ratio, never cropped to a fixed
 *    frame. Every number this produces is a fraction of the image, and the
 *    server turns those fractions back into image pixels — so a `cover` crop
 *    would silently place the sign somewhere other than where it was dragged.
 *
 * 2. When the real proportions are known, the box's height follows them. A box
 *    the mark cannot fill is a box that lies about the size of the sign, and
 *    the server derives the height from the inches regardless — so a freely
 *    dragged height would disagree with the render.
 */
export default function LogoPositioner({
  wallImageUrl, logoUrl, logoText, value, onChange, signAspect, onSize,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const dragStart = useRef<{ x: number; y: number; box: Box } | null>(null);

  function toFrac(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }

  /** Box height as a fraction of image height, for a given width fraction. */
  function heightFor(widthFrac: number, fallback: number): number {
    if (!signAspect || !imageAspect || signAspect <= 0) return fallback;
    // widthFrac·W / (heightFrac·H) = signAspect, and W/H = imageAspect.
    return (widthFrac * imageAspect) / signAspect;
  }

  function handleMoveStart(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toFrac(e.clientX, e.clientY);
    dragStart.current = { x: p.x, y: p.y, box: value };
    setDragMode('move');
  }

  function handleResizeStart(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toFrac(e.clientX, e.clientY);
    dragStart.current = { x: p.x, y: p.y, box: value };
    setDragMode('resize');
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragMode || !dragStart.current) return;
    const p = toFrac(e.clientX, e.clientY);
    const dx = p.x - dragStart.current.x;
    const dy = p.y - dragStart.current.y;
    const start = dragStart.current.box;

    if (dragMode === 'move') {
      onChange({
        ...start,
        xFrac: clamp(start.xFrac + dx, 0, 1 - start.widthFrac),
        yFrac: clamp(start.yFrac + dy, 0, 1 - start.heightFrac),
      });
    } else {
      const widthFrac = clamp(start.widthFrac + dx, 0.03, 1 - start.xFrac);
      const heightFrac = signAspect
        ? heightFor(widthFrac, widthFrac * (start.heightFrac / start.widthFrac))
        // Free in both directions when the inches are measured off the box:
        // the box IS the statement of size, so it must not be constrained by
        // the number it produces.
        : clamp(start.heightFrac + dy, 0.02, 1 - start.yFrac);
      onChange({
        ...start,
        widthFrac,
        heightFrac: Math.min(heightFrac, 1 - start.yFrac),
      });
    }
  }

  // The box follows the inches as they are typed. In an effect, not in render:
  // a state update during render re-enters immediately, and under StrictMode's
  // double render that is an infinite loop rather than a one-off correction.
  // The tolerance is what stops it oscillating on floating-point noise.
  const target = heightFor(value.widthFrac, value.heightFrac);
  useEffect(() => {
    if (!imageAspect || !signAspect) return;
    if (Math.abs(target - value.heightFrac) <= 0.002) return;
    onChange({ ...value, heightFrac: Math.min(target, 1 - value.yFrac) });
  }, [target, imageAspect, signAspect, value.heightFrac, value.yFrac]);

  return (
    <div>
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragMode(null)}
        onPointerLeave={() => setDragMode(null)}
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--line)',
          background: '#0d1117',
          touchAction: 'none',
          lineHeight: 0,
        }}
      >
        {/* Never cropped: the fractions this produces are read back against the
            full image, so what is on screen has to be the full image. */}
        <img
          src={wallImageUrl}
          alt="Wall"
          onLoad={(e) => {
            const img = e.currentTarget;
            setImageAspect(img.naturalWidth / img.naturalHeight);
            onSize?.({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          draggable={false}
        />

        <div
          onPointerDown={handleMoveStart}
          style={{
            position: 'absolute',
            left: `${value.xFrac * 100}%`,
            top: `${value.yFrac * 100}%`,
            width: `${value.widthFrac * 100}%`,
            height: `${value.heightFrac * 100}%`,
            border: '2px dashed var(--green-500)',
            background: 'rgba(34,197,94,0.12)',
            cursor: dragMode === 'move' ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
              draggable={false}
            />
          ) : (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, pointerEvents: 'none' }}>
              {logoText || 'SIGN'}
            </span>
          )}

          <div
            onPointerDown={handleResizeStart}
            title="Resize"
            style={{
              position: 'absolute',
              right: -8,
              bottom: -8,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--green-600)',
              border: '2px solid #fff',
              cursor: 'nwse-resize',
            }}
          />
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
        Drag kotaknya untuk pindah, drag titik hijau di pojok kanan-bawah untuk resize.
        {signAspect
          ? ' Tingginya mengikuti ukuran inci yang kamu isi.'
          : ' Ukuran inci-nya diukur dari kotak ini.'}
      </p>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export type { Box as LogoPositionerBox };
