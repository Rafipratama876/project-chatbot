import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Design } from '../api/client';

export default function DesignsListPage() {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDesigns().then(setDesigns).catch((e: Error) => {
      setError(e.message);
      setDesigns([]);
    });
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>My Designs</h1>
        <p>Semua proof channel letter yang pernah dibuat.</p>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {designs === null && <p>Memuat…</p>}
      {designs?.length === 0 && !error && (
        <div className="card">
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Belum ada desain.{' '}
            <Link to="/new" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
              Buat desain baru →
            </Link>
          </p>
        </div>
      )}

      <div className="design-list">
        {designs?.map((d) => (
          <Link key={d.id} to={`/designs/${d.id}`} className="design-row">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                {d.logoText ?? 'Belum ada teks'} ·{' '}
                {d.wallPreset?.name
                  ?? (d.customWallImageUrl ? 'Foto dinding sendiri' : 'Wall belum dipilih')}
                {d.widthInches && d.heightInches
                  ? ` · ${d.widthInches}″ × ${d.heightInches}″`
                  : ''}
              </div>
            </div>
            <span className={`status-badge status-${d.status}`}>{d.status}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
