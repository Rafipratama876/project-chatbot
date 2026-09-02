import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Design } from '../api/client';
import SpecSheet from '../components/SpecSheet';
import ChatPanel from '../components/ChatPanel';

/**
 * Renders run on a queue, so a freshly triggered one arrives here PENDING and
 * has to be polled until it lands. Stopping the moment it settles rather than
 * looping a fixed number of times means this neither over- nor under-polls,
 * whatever the render actually costs.
 */
const POLL_INTERVAL_MS = 2000;

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [design, setDesign] = useState<Design | null>(null);
  const [view, setView] = useState<'day' | 'night'>('day');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setDesign(await api.getDesign(id));
  }, [id]);

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [refresh]);

  const newest = design?.renders[0];
  const inFlight = newest?.status === 'PENDING' || newest?.status === 'PROCESSING';

  // An interval, keyed only on whether anything is in flight.
  //
  // A self-rescheduling timeout keyed on the render's status looks equivalent
  // and is not: it re-arms only when a dependency changes, so any tick that
  // comes back with the SAME status arms nothing and the page waits forever on
  // a render that has already finished. PENDING → PROCESSING → PROCESSING is
  // an entirely ordinary sequence.
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    pollTimer.current = timer;
    return () => clearInterval(timer);
  }, [inFlight, refresh]);

  if (error && !design) return <div className="notice notice-error">{error}</div>;
  if (!design) return <p>Memuat…</p>;

  // The newest render that actually produced images. It can lag behind
  // `newest` while a revision is in flight, which is deliberate: the last good
  // proof stays on screen instead of the panel going blank mid-regeneration.
  const shown = design.renders.find((r) => r.dayImageUrl && r.nightImageUrl);
  const failed = newest?.status === 'FAILED';
  const blocked = newest?.status === 'BLOCKED' || (newest?.blocked ?? false);

  const currentImage = view === 'day' ? shown?.dayImageUrl : shown?.nightImageUrl;
  const note = view === 'day' ? shown?.dayNote : shown?.nightNote;
  const enhanced = view === 'day' ? shown?.dayEnhanced : shown?.nightEnhanced;

  async function handleSend(message: string) {
    if (!id) return;
    await api.revise(id, message);
    await refresh();
    // The exported PDF now describes a superseded version — drop the link
    // rather than let it quietly open the pre-revision file.
    setExportUrl(null);
  }

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1>{design.name}</h1>
          <p>
            {design.logoText ?? 'Belum ada teks'} ·{' '}
            {design.wallPreset?.name ?? (design.customWallImageUrl ? 'Foto sendiri' : 'Wall belum dipilih')}
            {design.widthInches && design.heightInches
              ? ` · ${design.widthInches}″ × ${design.heightInches}″`
              : ''}
          </p>
        </div>
        <span className={`status-badge status-${design.status}`}>{design.status}</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {inFlight && (
        <div className="notice notice-info">
          ⏳ Sedang membuat render{shown ? ' baru' : ''}… halaman ini update otomatis begitu selesai.
        </div>
      )}
      {failed && (
        <div className="notice notice-error">
          ❌ Render terakhir gagal: {newest?.errorMessage ?? 'Alasan tidak diketahui.'}
        </div>
      )}
      {blocked && (
        <div className="notice notice-block">
          <strong>Butuh dicek manusia — proof ini tidak boleh dikirim.</strong>
          <ul>
            {(newest?.escalations ?? []).map((e) => (
              <li key={e.ruleId}>[{e.ruleId}] {e.question}</li>
            ))}
          </ul>
        </div>
      )}
      {(newest?.problems.length ?? 0) > 0 && (
        <div className="notice notice-warn">
          {newest!.problems.map((p) => <div key={p}>{p}</div>)}
        </div>
      )}

      <div className="grid-review">
        <div>
          <div style={{ marginBottom: 12 }}>
            <div className="render-toggle">
              <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>
                Day View
              </button>
              <button
                className={view === 'night' ? 'active night' : ''}
                onClick={() => setView('night')}
              >
                Night View
              </button>
            </div>
          </div>

          <div className="render-frame">
            {shown && currentImage ? (
              <img src={api.assetUrl(currentImage)} alt={`${view} view`} />
            ) : inFlight ? (
              <p className="empty">Sedang membuat render pertama…</p>
            ) : (
              <p className="empty">Belum ada render.</p>
            )}
          </div>

          {/* Why this panel is not on the customer's building, when it isn't. */}
          {note && <p className="panel-note">{note}</p>}

          {/* Whoever signs this has to know a model touched the picture, and
              exactly how far that went. Not buried in a settings page. */}
          {enhanced && (
            <p className="panel-note panel-note-ai">
              <strong>Latar belakang gambar ini dibuat oleh AI.</strong> {enhanced}
            </p>
          )}

          {/* Kept below the proof and visibly separate. The setting in it is
              generated, so it is a sales picture — not something to check a
              building against, and nothing is measured from it. */}
          {shown?.conceptImageUrl && (
            <div className="concept">
              <div className="concept-head">
                <span className="concept-tag">CONCEPT — ILUSTRASI</span>
                <span>Bukan bagian dari proof</span>
              </div>
              <img src={api.assetUrl(shown.conceptImageUrl)} alt="Concept scene" />
              {shown.conceptNote && <p className="concept-note">{shown.conceptNote}</p>}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <SpecSheet design={design} render={shown} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={busy || design.status === 'APPROVED' || !shown || blocked}
              onClick={() => guard(async () => { await api.approve(design.id); await refresh(); })}
            >
              {design.status === 'APPROVED' ? 'Approved ✓' : 'Approve Design'}
            </button>
            <button
              className="btn btn-dark"
              disabled={busy || !shown}
              onClick={() => guard(async () => {
                const { url } = await api.exportPdf(design.id);
                // Same path every export — bust the cache so the link opens
                // what was just generated, not a previously cached response.
                setExportUrl(`${api.assetUrl(url)}?t=${Date.now()}`);
              })}
            >
              Export PDF
            </button>
            {exportUrl && (
              <a href={exportUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                Buka PDF ↗
              </a>
            )}
            <button
              className="btn btn-secondary"
              disabled={busy || inFlight}
              onClick={() => guard(async () => { await api.generateRender(design.id); await refresh(); })}
            >
              Render ulang
            </button>
          </div>

          {design.renders.length > 1 && (
            <div className="versions">
              <span className="mini-label">Versi</span>
              {design.renders.map((r) => (
                <span key={r.id} className={`version-chip ${r.id === shown?.id ? 'on' : ''}`}>
                  v{r.version} · {r.status.toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 560 }}>
          <ChatPanel
            messages={design.chatMessages}
            onSend={handleSend}
            disabled={!shown || inFlight}
          />
        </div>
      </div>
    </>
  );
}
