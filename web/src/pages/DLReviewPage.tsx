import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { dlApi, DLProof } from '../api/dlClient';

const POLL_INTERVAL_MS = 2000;

/**
 * The Dimensional Letters review page — reads `Proof`-shaped data
 * (`specBlock`, `disclosures`, `panels`, `problems`, `blocked`) exactly the
 * way `ReviewPage` does for Channel Letters, just against `/dl-proofs`
 * instead of `/designs`. Simpler than `ReviewPage`: DL has no draft/chat/
 * approve/export-PDF/revise concept in v1, and `dl-proofs/wizard` already
 * runs the job synchronously, so there is usually nothing to poll — the
 * polling here only matters if a proof is ever created async in the future.
 */
export default function DLReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [proof, setProof] = useState<DLProof | null>(null);
  const [view, setView] = useState<'day' | 'night'>('day');
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setProof(await dlApi.getProof(id));
  }, [id]);

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

  const panel = proof.panels.find((p) => p.view === view) ?? proof.panels[0];
  const failed = proof.status === 'failed';
  const blocked = proof.status === 'blocked' || proof.blocked;

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h1>Dimensional Letters Proof</h1>
          <p>{proof.jobId} · {proof.dlVersion}</p>
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
                <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day View</button>
                <button className={view === 'night' ? 'active night' : ''} onClick={() => setView('night')}>Night View</button>
              </div>
            </div>
          )}

          <div className="render-frame">
            {panel ? (
              <img src={dlApi.panelUrl(proof.id, panel)} alt={`${panel.view} view`} />
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
            <a href={dlApi.sheetUrl(proof.id)} target="_blank" rel="noreferrer" className="btn btn-primary">
              Buka Proof Sheet ↗
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
