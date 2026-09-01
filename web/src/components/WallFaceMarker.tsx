import { useRef, useState } from 'react';
import { impliedHeightInches } from '#homography';
import type { Point } from '../api/client';

interface Props {
  imageUrl: string;
  /** Corners in ORIGINAL image pixels, clockwise from the wall's top-left. */
  onMarked: (facade: { corners: Point[]; widthInches: number; heightInches: number }) => void;
  onSkip: () => void;
}

const HANDLE_LABELS = ['Kiri-atas', 'Kanan-atas', 'Kanan-bawah', 'Kiri-bawah'];

/**
 * Marking one flat wall panel in the photograph.
 *
 * The reference wizard used this gesture to *straighten* the photo and threw
 * the original away. This keeps the original and records the corners instead,
 * because the perspective is not distortion to be corrected — it is the only
 * evidence of where the camera stood, and it is what lets the night
 * three-quarter be the customer's own building rather than a studio card.
 * Straightening the photo destroys exactly the information the renderer needs.
 *
 * Optional throughout. Without it both views still sit on the photograph; the
 * three-quarter falls back to a neutral ground and the proof says why.
 */
export default function WallFaceMarker({ imageUrl, onMarked, onSkip }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  /** Corners in DISPLAYED pixels; scaled to natural size on confirm. */
  const [corners, setCorners] = useState<Point[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [widthInches, setWidthInches] = useState('240');
  const [heightInches, setHeightInches] = useState('120');

  function handleImageLoad() {
    const img = imgRef.current!;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    const w = img.clientWidth;
    const h = img.clientHeight;
    setDisplaySize({ w, h });
    setCorners([
      { x: w * 0.12, y: h * 0.15 },
      { x: w * 0.88, y: h * 0.15 },
      { x: w * 0.88, y: h * 0.8 },
      { x: w * 0.12, y: h * 0.8 },
    ]);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragIndex === null || !corners || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    const next = [...corners];
    next[dragIndex] = { x, y };
    setCorners(next);
  }

  const w = Number(widthInches);

  // Corners in the photograph's own pixels — the frame every measurement is
  // made in, and the one the renderer works in.
  const naturalCorners = corners && naturalSize && displaySize
    ? corners.map((c) => ({
        x: (c.x * naturalSize.w) / displaySize.w,
        y: (c.y * naturalSize.h) / displaySize.h,
      }))
    : null;

  // A quad that is still a rectangle in the photograph has its real aspect
  // fixed by its pixel aspect, so its height is arithmetic, not a question.
  // Asking anyway is what let a wall be declared 240" x 120" when the pixels
  // said 240" x 147.8" — and the sign then rendered somewhere else entirely.
  const implied = naturalCorners && w > 0 ? impliedHeightInches(naturalCorners, w) : null;
  const h = implied ?? Number(heightInches);
  const canConfirm = !!naturalCorners && w > 0 && h > 0;

  function handleConfirm() {
    if (!naturalCorners) return;
    onMarked({ corners: naturalCorners, widthInches: w, heightInches: h });
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Tandai bidang dinding</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
        Tarik 4 titik supaya pas dengan satu bidang dinding yang rata di foto, lalu isi ukuran
        asli bidang itu. Ini yang bikin night view bisa 3/4 di gedung kamu sendiri — bukan di
        latar netral. Opsional: boleh dilewati.
      </p>

      <div
        ref={containerRef}
        style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragIndex(null)}
        onPointerLeave={() => setDragIndex(null)}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Wall"
          onLoad={handleImageLoad}
          style={{ display: 'block', maxWidth: '100%', maxHeight: 480, userSelect: 'none' }}
          draggable={false}
        />

        {corners && displaySize && (
          <svg
            width={displaySize.w}
            height={displaySize.h}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            <polygon
              points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
              fill="rgba(34,197,94,0.15)"
              stroke="var(--green-500)"
              strokeWidth={2}
            />
          </svg>
        )}

        {corners?.map((c, i) => (
          <div
            key={i}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
              setDragIndex(i);
            }}
            title={HANDLE_LABELS[i]}
            style={{
              position: 'absolute',
              left: c.x - 9,
              top: c.y - 9,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--green-600)',
              border: '2px solid #fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              cursor: 'grab',
            }}
          />
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="field">
          <label>Lebar bidang itu (inci)</label>
          <input
            type="number"
            min={1}
            value={widthInches}
            onChange={(e) => setWidthInches(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Tinggi bidang itu (inci)</label>
          {implied !== null ? (
            <>
              <input type="number" value={implied.toFixed(1)} readOnly disabled />
              <span className="hint">
                Dihitung otomatis. Kotaknya masih persegi di foto, jadi tingginya sudah
                ditentukan oleh lebarnya — mengetik angka lain cuma bikin bertentangan.
              </span>
            </>
          ) : (
            <>
              <input
                type="number"
                min={1}
                value={heightInches}
                onChange={(e) => setHeightInches(e.target.value)}
              />
              <span className="hint">
                Kotaknya miring, jadi tingginya tidak bisa dihitung dari foto — isi ukuran
                aslinya.
              </span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button className="btn btn-secondary" onClick={onSkip}>
          Lewati — night view pakai latar netral
        </button>
        <button className="btn btn-primary" disabled={!canConfirm} onClick={handleConfirm}>
          Simpan bidang → posisikan logo
        </button>
      </div>
    </div>
  );
}
