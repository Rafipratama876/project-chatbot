import { useEffect, useRef, useState } from 'react';
import { rectOnWall, wallRectToImage, type MarkedFacade } from '#homography';
import { api, WallPreset, FacadeRect } from '../api/client';
import WallFaceMarker from './WallFaceMarker';
import LogoPositioner, { LogoPositionerBox } from './LogoPositioner';

export interface WallStepValue {
  wallPresetId: string | null;
  customWallImageUrl: string | null;
  widthInches: string;
  heightInches: string;
  maxSignAreaAllowed: string;
  box: LogoPositionerBox;
  facadeRect: FacadeRect | null;
}

interface Props {
  value: WallStepValue;
  logoUrl: string | null;
  logoText: string;
  onChange: (patch: Partial<WallStepValue>) => void;
  onBack: () => void;
  onNext: () => void;
}

const DEFAULT_BOX: LogoPositionerBox = { xFrac: 0.25, yFrac: 0.35, widthFrac: 0.5, heightFrac: 0.15 };

export default function StepWall({ value, logoUrl, logoText, onChange, onBack, onNext }: Props) {
  const [mode, setMode] = useState<'preset' | 'upload'>(value.customWallImageUrl ? 'upload' : 'preset');
  const [presets, setPresets] = useState<WallPreset[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingWallUrl, setPendingWallUrl] = useState<string | null>(null);
  /** Natural pixel size of the wall image — the denominator of every fraction. */
  const [wallPixels, setWallPixels] = useState<{ w: number; h: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listWallPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      // Uploaded first, then marked: the photograph itself is stored
      // untouched, and the corners are recorded against its own pixels.
      const { url } = await api.uploadWallPhoto(file, file.name);
      onChange({ customWallImageUrl: url, wallPresetId: null, box: DEFAULT_BOX, facadeRect: null });
      setPendingWallUrl(api.assetUrl(url));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const currentWallImageUrl =
    mode === 'upload'
      ? value.customWallImageUrl
        ? api.assetUrl(value.customWallImageUrl)
        : null
      : presets?.find((p) => p.id === value.wallPresetId)
        ? api.assetUrl(presets.find((p) => p.id === value.wallPresetId)!.imageUrl)
        : null;

  // ── One scale ──────────────────────────────────────────────────────────
  //
  // A marked wall face already states the scale of the photograph. The sign's
  // size in inches is then a MEASUREMENT of the dragged box against that face,
  // not a second independent statement — and when the two were allowed to
  // disagree the render followed the face while the preview followed the
  // typed number, so the sign landed elsewhere at a third of its size.
  //
  // So the two are bound together here. Drag the box and the inches follow;
  // type the inches and the box follows. Either way what is on screen is what
  // gets built.
  const selectedPreset = presets?.find((p) => p.id === value.wallPresetId) ?? null;

  const facade: MarkedFacade | null =
    mode === 'upload'
      ? value.facadeRect && wallPixels
        ? {
            corners: value.facadeRect.corners,
            widthInches: value.facadeRect.widthInches,
            heightInches: value.facadeRect.heightInches,
          }
        : null
      // A preset states how wide the wall it depicts really is, so it is a
      // marked face already — the whole image, square on. The server derives
      // the same one; this is the preview's copy of it.
      : selectedPreset
        ? {
            corners: [
              { x: 0, y: 0 },
              { x: selectedPreset.imageWidth, y: 0 },
              { x: selectedPreset.imageWidth, y: selectedPreset.imageHeight },
              { x: 0, y: selectedPreset.imageHeight },
            ],
            widthInches: selectedPreset.imageWidthInches,
            heightInches:
              selectedPreset.imageHeight
              / (selectedPreset.imageWidth / selectedPreset.imageWidthInches),
          }
        : null;

  // Fractions of the image, so the facade's own pixel frame is the right
  // denominator whether it came from a preset or from a marked photograph.
  const framePx = facade
    ? mode === 'upload'
      ? wallPixels
      : { w: selectedPreset!.imageWidth, h: selectedPreset!.imageHeight }
    : null;

  const measured = facade && framePx
    ? rectOnWall(facade, {
        x: value.box.xFrac * framePx.w,
        y: value.box.yFrac * framePx.h,
        w: value.box.widthFrac * framePx.w,
        h: value.box.heightFrac * framePx.h,
      })
    : null;

  // The measured size is authoritative while a face is marked, so it is what
  // the fields show and what gets sent.
  useEffect(() => {
    if (!measured) return;
    const w = measured.widthInches.toFixed(2);
    const h = measured.heightInches.toFixed(2);
    if (value.widthInches !== w || value.heightInches !== h) {
      onChange({ widthInches: w, heightInches: h });
    }
  }, [measured?.widthInches, measured?.heightInches]);

  /** Typing a size with a face marked: resize the box to show what it really is. */
  function resizeBoxTo(widthInches: number, heightInches: number) {
    if (!facade || !framePx || !(widthInches > 0) || !(heightInches > 0)) return;
    const centre = measured?.centre;
    if (!centre) return;
    const px = wallRectToImage(facade, centre, widthInches, heightInches);
    onChange({
      box: {
        xFrac: px.x / framePx.w,
        yFrac: px.y / framePx.h,
        widthFrac: px.w / framePx.w,
        heightFrac: px.h / framePx.h,
      },
    });
  }

  const canContinue =
    !!currentWallImageUrl && Number(value.widthInches) > 0 && Number(value.heightInches) > 0;

  const areaSqFt =
    Number(value.widthInches) > 0 && Number(value.heightInches) > 0
      ? ((Number(value.widthInches) * Number(value.heightInches)) / 144).toFixed(2)
      : null;

  const overPermit =
    areaSqFt && value.maxSignAreaAllowed && Number(areaSqFt) > Number(value.maxSignAreaAllowed);

  if (pendingWallUrl) {
    return (
      <WallFaceMarker
        imageUrl={pendingWallUrl}
        onMarked={(facadeRect) => {
          onChange({ facadeRect });
          setPendingWallUrl(null);
        }}
        onSkip={() => setPendingWallUrl(null)}
      />
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Wall &amp; Placement</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, marginBottom: 18 }}>
        Pilih preset atau upload foto gedung sendiri, posisikan kotak sign, lalu isi ukuran
        aslinya. Kotak + ukuran inci itulah kalibrasinya — semua dimensi di proof dihitung dari
        situ.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="render-toggle" style={{ marginBottom: 16 }}>
        <button className={mode === 'preset' ? 'active' : ''} onClick={() => setMode('preset')}>
          Preset Wall
        </button>
        <button className={mode === 'preset' ? '' : 'active'} onClick={() => setMode('upload')}>
          Upload Foto
        </button>
      </div>

      {mode === 'preset' && (
        <>
          {selectedPreset && (
            <p className="hint" style={{ display: 'block', marginBottom: 10 }}>
              Dinding di preset ini lebarnya {selectedPreset.imageWidthInches}″ — ukuran sign
              di bawah diukur dari kotaknya terhadap itu.
            </p>
          )}
          <div className="notice notice-info" style={{ marginBottom: 12 }}>
            Preset itu bukan gedung kamu. Apa pun yang diukur di sini — fit, jarak, warna
            sekitar, luas yang diizinkan — tidak berlaku untuk lokasi aslinya, dan proof-nya
            menyebutkan itu.
          </div>
          <div className="wall-grid">
            {presets?.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wall-option ${value.wallPresetId === p.id ? 'selected' : ''}`}
                onClick={() =>
                  onChange({
                    wallPresetId: p.id,
                    customWallImageUrl: null,
                    box: DEFAULT_BOX,
                    facadeRect: null,
                  })
                }
              >
                <img src={api.assetUrl(p.imageUrl)} alt={p.name} />
                <div className="label">{p.name}</div>
              </button>
            ))}
            {presets?.length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Belum ada preset.</p>
            )}
          </div>
        </>
      )}

      {mode === 'upload' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={handlePickFile}
          />
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : value.customWallImageUrl ? 'Ganti foto dinding' : 'Upload foto dinding'}
          </button>
          {value.customWallImageUrl && (
            <button
              className="btn btn-secondary"
              style={{ marginLeft: 8 }}
              onClick={() => setPendingWallUrl(api.assetUrl(value.customWallImageUrl!))}
            >
              {value.facadeRect ? 'Ubah bidang dinding ✓' : 'Tandai bidang dinding (opsional)'}
            </button>
          )}
          {facade && mode === 'upload' && (
            <div className="notice notice-info" style={{ marginTop: 12, marginBottom: 0 }}>
              Skala diambil dari bidang dinding yang kamu tandai ({facade.widthInches}″ ×{' '}
              {facade.heightInches.toFixed(0)}″). Ukuran sign di bawah{' '}
              <strong>diukur dari kotaknya</strong>, jadi apa yang kamu lihat di sini persis
              yang di-render.
            </div>
          )}
        </div>
      )}

      {currentWallImageUrl && (
        <div style={{ marginTop: 20 }}>
          <label className="mini-label">Posisikan sign</label>
          <div style={{ marginTop: 6 }}>
            <LogoPositioner
              wallImageUrl={currentWallImageUrl}
              logoUrl={logoUrl ? api.assetUrl(logoUrl) : null}
              logoText={logoText}
              value={value.box}
              onChange={(box) => onChange({ box })}
              onSize={setWallPixels}
              signAspect={
                // Only when nothing else states the scale. With a wall face —
                // marked, or implied by a preset's own stated width — the box
                // is the measurement, so binding it to the number it produces
                // would be circular.
                !facade && Number(value.widthInches) > 0 && Number(value.heightInches) > 0
                  ? Number(value.widthInches) / Number(value.heightInches)
                  : null
              }
            />
          </div>
        </div>
      )}

      <div className="grid-3" style={{ marginTop: 20 }}>
        <div className="field">
          <label>Lebar sign (inci)</label>
          <input
            type="number"
            value={value.widthInches}
            onChange={(e) => {
              onChange({ widthInches: e.target.value });
              // With a face marked, typing a size resizes the box to show what
              // that size really is on the wall — rather than leaving a number
              // on screen that the render will not use.
              resizeBoxTo(Number(e.target.value), Number(value.heightInches));
            }}
            placeholder="100"
          />
          {facade && <span className="hint">Diukur dari bidang dinding yang kamu tandai.</span>}
        </div>
        <div className="field">
          <label>Tinggi sign (inci)</label>
          <input
            type="number"
            value={value.heightInches}
            onChange={(e) => {
              onChange({ heightInches: e.target.value });
              resizeBoxTo(Number(value.widthInches), Number(e.target.value));
            }}
            placeholder="19.25"
          />
        </div>
        <div className="field">
          <label>Max sign area (sq ft, opsional)</label>
          <input
            type="number"
            value={value.maxSignAreaAllowed}
            onChange={(e) => onChange({ maxSignAreaAllowed: e.target.value })}
            placeholder="Batas zoning/permit"
          />
        </div>
      </div>

      {areaSqFt && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Area: <strong style={{ color: 'var(--ink)' }}>{areaSqFt} sq ft</strong>
          {overPermit && (
            <span style={{ color: '#b45309', fontWeight: 600 }}>
              {' '}— melebihi {value.maxSignAreaAllowed} sq ft yang diizinkan. Ini ditandai untuk
              review permit, bukan dinyatakan comply.
            </span>
          )}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" disabled={!canContinue} onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
}
