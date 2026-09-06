import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { scApi, SCProof, SCChatMessage } from '../api/scClient';
import ChatPanel from '../components/ChatPanel';

const POLL_INTERVAL_MS = 2000;

/**
 * A cabinet is commonly illuminated (unlike DL, where 7 of 8 material
 * families never light up) — so unlike `DLReviewPage`'s camera tabs, this
 * toggle is Channel Letters' own day/night, picking the panel the same rule
 * `render/panelPlan.ts`'s `preferredPanel` documents: day is the front
 * elevation (composited on the customer's wall photo when supplied), night
 * is the 3/4 detail (the only angle that shows the box depth and the face
 * glowing at once).
 */
function pickPanel(panels: SCProof['panels'], view: 'day' | 'night'): SCProof['panels'][number] | undefined {
  const order = view === 'day'
    ? ['front-elevation', 'perspective', 'detail-perspective']
    : ['detail-perspective', 'perspective', 'front-elevation'];
  for (const camera of order) {
    const found = panels.find((p) => p.view === view && p.camera === camera);
    if (found) return found;
  }
  return panels.find((p) => p.view === view && p.camera !== 'concept');
}

/**
 * The Sign Cabinet review page — same shape as `ReviewPage`/`DLReviewPage`
 * (chat-driven revise, re-render, PDF export, approve, version chips), keyed
 * by `rootProofId` (SC has no draft table, same as DL). Reuses `ChatPanel`
 * completely unmodified.
 */
export default function SCReviewPage() {
  const { id: rootId } = useParams<{ id: string }>();
  const [proof, setProof] = useState<SCProof | null>(null);
  const [versions, setVersions] = useState<SCProof[]>([]);
  const [messages, setMessages] = useState<SCChatMessage[]>([]);
  const [view, setView] = useState<'day' | 'night'>('day');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!rootId) return;
    const [latest, hist, msgs] = await Promise.all([
      scApi.latest(rootId), scApi.versions(rootId), scApi.messages(rootId),
    ]);
    setProof(latest);
    setVersions(hist);
    setMessages(msgs);
  }, [rootId]);

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [refresh]);

  const inFlight = proof?.status === 'queued' || proof?.status === 'running';
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    pollTimer.current = timer;
    return () => clearInterval(timer);
  }, [inFlight, refresh]);

  if (error && !proof) return <div className="notice notice-error">{error}</div>;
  if (!proof) return <p>Memuat…</p>;

  const hasNight = proof.panels.some((p) => p.view === 'night');
  const panel = pickPanel(proof.panels, view) ?? (view === 'night' ? undefined : proof.panels[0]);
  const failed = proof.status === 'failed';
  const blocked = proof.status === 'blocked' || proof.blocked;

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

  async function handleSend(message: string) {
    if (!rootId) return;
    await scApi.chat(rootId, message);
    await refresh();
    setExportUrl(null); // the exported PDF now describes a superseded version
  }

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1>Sign Cabinet Proof</h1>
          <p>{proof.jobId} · {proof.scVersion} · v{proof.version}</p>
        </div>
        <span className={`status-badge status-${proof.status.toUpperCase()}`}>{proof.status}</span>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {inFlight && <div className="notice notice-info">⏳ Sedang membuat proof…</div>}
      {failed && <div className="notice notice-error">❌ Proof gagal dibuat.</div>}
      {blocked && (
        <div className="notice notice-block">
          <strong>Butuh dicek manusia — proof ini tidak boleh dikirim.</strong>
          <ul>{proof.escalations.map((e) => <li key={e.ruleId}>[{e.ruleId}] {e.question}</li>)}</ul>
        </div>
      )}
      {proof.problems.length > 0 && (
        <div className="notice notice-warn">
          {proof.problems.map((p) => <div key={p}>{p}</div>)}
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
                disabled={!hasNight}
                title={hasNight ? undefined : 'Cabinet ini tidak diberi penerangan — tidak ada render malam.'}
              >
                Night View
              </button>
            </div>
          </div>

          <div className="render-frame">
            {panel ? (
              <img src={scApi.panelUrl(proof.id, panel)} alt={`${view} view`} />
            ) : inFlight ? (
              <p className="empty">Sedang membuat render pertama…</p>
            ) : view === 'night' && !hasNight ? (
              <p className="empty">Cabinet ini tidak diberi penerangan — tidak ada render malam.</p>
            ) : (
              <p className="empty">Belum ada render.</p>
            )}
          </div>

          <div style={{ marginTop: 20 }} className="card">
            <div style={{ padding: 14 }}>
              <h4 style={{ marginTop: 0 }}>SPEC BLOCK</h4>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.5 }}>{proof.specBlock}</pre>
            </div>
          </div>

          <div style={{ marginTop: 12 }} className="card">
            <div style={{ padding: 14 }}>
              <h4 style={{ marginTop: 0 }}>DISCLOSURES</h4>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.5 }}>{proof.disclosures}</pre>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={busy || proof.approved || !panel || blocked}
              onClick={() => guard(async () => { await scApi.approve(proof.id); await refresh(); })}
            >
              {proof.approved ? 'Approved ✓' : 'Approve Design'}
            </button>
            <a href={scApi.sheetUrl(proof.id)} target="_blank" rel="noreferrer" className="btn btn-secondary">
              Buka Proof Sheet ↗
            </a>
            <button
              className="btn btn-dark"
              disabled={busy || !panel}
              onClick={() => guard(async () => {
                if (!rootId) return;
                const { url } = await scApi.exportPdf(rootId);
                setExportUrl(`${scApi.assetUrl(url)}?t=${Date.now()}`);
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
              onClick={() => guard(async () => {
                if (!rootId) return;
                await scApi.regenerate(rootId);
                await refresh();
              })}
            >
              Render ulang
            </button>
          </div>

          {versions.length > 1 && (
            <div className="versions">
              <span className="mini-label">Versi</span>
              {versions.map((v) => (
                <span key={v.id} className={`version-chip ${v.id === proof.id ? 'on' : ''}`}>
                  v{v.version} · {v.status.toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 560 }}>
          <ChatPanel messages={messages} onSend={handleSend} disabled={!panel || inFlight} />
        </div>
      </div>
    </>
  );
}
