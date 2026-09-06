import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { dlApi, DLProof, DLChatMessage } from '../api/dlClient';
import ChatPanel from '../components/ChatPanel';

const POLL_INTERVAL_MS = 2000;

/** DL is almost always non-illuminated (7 of 8 material families never light
 * up), so a day/night toggle mostly toggles onto "not rendered". What's
 * always there is two camera angles — the flat elevation and the 3/4 that
 * actually shows depth — so that's what this toggles instead. Mirrors the
 * picking logic in dl-proofSheet.ts (a DL-only file, not the shared
 * render/panelPlan.ts CL's proof sheet uses). */
type DLCameraTab = 'front-elevation' | 'detail-perspective';

function pickPanel(panels: DLProof['panels'], camera: DLCameraTab): DLProof['panels'][number] | undefined {
  return panels.find((p) => p.view === 'night' && p.camera === camera)
    ?? panels.find((p) => p.view === 'day' && p.camera === camera)
    ?? panels.find((p) => p.camera === camera);
}

/**
 * The Dimensional Letters review page — same shape as `ReviewPage` (chat-
 * driven revise, re-render, PDF export, approve, version chips), keyed by
 * `rootProofId` instead of a `cl_design` id since DL has no draft table.
 * Reuses `ChatPanel` completely unmodified (it only needs `{id, role,
 * content}` messages and an `onSend`, no Channel-Letters vocabulary in it).
 */
export default function DLReviewPage() {
  const { id: rootId } = useParams<{ id: string }>();
  const [proof, setProof] = useState<DLProof | null>(null);
  const [versions, setVersions] = useState<DLProof[]>([]);
  const [messages, setMessages] = useState<DLChatMessage[]>([]);
  const [camera, setCamera] = useState<DLCameraTab>('detail-perspective');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!rootId) return;
    const [latest, hist, msgs] = await Promise.all([
      dlApi.latest(rootId), dlApi.versions(rootId), dlApi.messages(rootId),
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

  const panel = pickPanel(proof.panels, camera) ?? proof.panels[0];
  const illuminated = panel?.view === 'night';
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
    await dlApi.chat(rootId, message);
    await refresh();
    setExportUrl(null); // the exported PDF now describes a superseded version
  }

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1>Dimensional Letters Proof</h1>
          <p>{proof.jobId} · {proof.dlVersion} · v{proof.version}</p>
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
          {proof.panels.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <div className="render-toggle">
                <button className={camera === 'front-elevation' ? 'active' : ''} onClick={() => setCamera('front-elevation')}>Front Elevation</button>
                <button className={camera === 'detail-perspective' ? 'active' : ''} onClick={() => setCamera('detail-perspective')}>3/4 Perspective</button>
              </div>
            </div>
          )}

          <div className="render-frame">
            {panel ? (
              <img src={dlApi.panelUrl(proof.id, panel)} alt={`${camera} view`} />
            ) : inFlight ? (
              <p className="empty">Sedang membuat render pertama…</p>
            ) : (
              <p className="empty">Belum ada render.</p>
            )}
          </div>
          {illuminated && <p className="panel-note">Illuminated at night — this material family is one of the two (flat-cut acrylic/PVC) the PDF shows lit.</p>}

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
              onClick={() => guard(async () => { await dlApi.approve(proof.id); await refresh(); })}
            >
              {proof.approved ? 'Approved ✓' : 'Approve Design'}
            </button>
            <a href={dlApi.sheetUrl(proof.id)} target="_blank" rel="noreferrer" className="btn btn-secondary">
              Buka Proof Sheet ↗
            </a>
            <button
              className="btn btn-dark"
              disabled={busy || !panel}
              onClick={() => guard(async () => {
                if (!rootId) return;
                const { url } = await dlApi.exportPdf(rootId);
                setExportUrl(`${dlApi.assetUrl(url)}?t=${Date.now()}`);
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
                await dlApi.regenerate(rootId);
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
