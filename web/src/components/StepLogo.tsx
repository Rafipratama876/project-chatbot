import { useRef, useState } from 'react';
import { api } from '../api/client';

interface Props {
  logoText: string;
  logoUrl: string | null;
  onChange: (data: { logoText?: string; logoUrl?: string | null }) => void;
  onNext: () => void;
}

export default function StepLogo({ logoText, logoUrl, onChange, onNext }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNotes([]);
    setUploading(true);
    try {
      const { url } = await api.uploadLogo(file, file.name);
      onChange({ logoUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleEliminateBackground() {
    if (!logoUrl) return;
    setError(null);
    setRemovingBg(true);
    try {
      const res = await fetch(api.assetUrl(logoUrl));
      const blob = await res.blob();
      const result = await api.removeBackground(blob, 'logo.png');
      onChange({ logoUrl: result.url });
      // What it actually did, not just that it succeeded: "removed 2%" and
      // "removed 99%" both return 200 and both mean something went wrong.
      setNotes(result.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingBg(false);
    }
  }

  const isVector = !!logoUrl && /\.svg$/i.test(logoUrl);

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Logo / Sign Text</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, marginBottom: 18 }}>
        Upload file logo — ini yang jadi outline yang dipotong bengkel, jadi wajib ada.
        Teks di sebelah dipakai sebagai nama bisnis di proof, bukan sebagai bentuk huruf.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="grid-2">
        <div>
          <div className="field">
            <label>Sign text (nama bisnis di proof)</label>
            <input
              value={logoText}
              onChange={(e) => onChange({ logoText: e.target.value })}
              placeholder="Heaven Crepes"
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={handleFilePicked}
          />
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : logoUrl ? 'Ganti file logo' : 'Upload logo (SVG / PNG / JPG)'}
          </button>

          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
            SVG itu artwork-nya sendiri — ukurannya eksak. PNG/JPG di-trace dari piksel, jadi
            setiap dimensi mewarisi error trace-nya, dan proof menyebutkan itu.
          </p>
        </div>

        <div>
          <label className="mini-label">Preview</label>
          <div className="logo-preview">
            {logoUrl ? (
              <img src={api.assetUrl(logoUrl)} alt="Logo preview" />
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>Belum ada logo</span>
            )}
          </div>
          {logoUrl && !isVector && (
            <button
              className="btn btn-secondary"
              style={{ marginTop: 8, width: '100%' }}
              onClick={handleEliminateBackground}
              disabled={removingBg}
            >
              {removingBg ? 'Menghapus background…' : 'Hapus background'}
            </button>
          )}
          {notes.length > 0 && (
            <div className="notice notice-info" style={{ marginTop: 8 }}>
              {notes.map((n) => <div key={n}>{n}</div>)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button className="btn btn-primary" disabled={!logoUrl} onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
}
