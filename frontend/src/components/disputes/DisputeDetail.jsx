import React, { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import { getErrorMessage } from '../../utils/errorMessages';
import { useNetwork } from '../../context/NetworkContext';
import { EVIDENCE_ACCEPT, validateEvidenceFiles } from './OpenDisputeModal';

const TX_BADGE = {
  pending: { bg: '#fff3cd', color: '#7a5800', label: 'Submitting on chain…' },
  confirmed: { bg: '#d8f3dc', color: '#2d6a4f', label: 'On chain' },
  failed: { bg: '#fee', color: '#b42318', label: 'On-chain submission failed' },
  skipped: { bg: '#eee', color: '#555', label: 'Stored off chain' },
};

export function formatCountdown(ms) {
  if (ms <= 0) return 'closed';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, '0')}m left`;
}

/** Why the current party can't add evidence, or '' when they can. */
export function evidenceBlockReason(dispute, party) {
  if (!party) return '';
  if (!dispute.evidence_window_open) return 'The 48-hour evidence submission window has closed.';
  if ((dispute.evidence_count?.[party] ?? 0) >= dispute.max_evidence_per_party)
    return `You have already submitted the maximum of ${dispute.max_evidence_per_party} evidence files.`;
  return '';
}

/** One party's evidence list: file link, SHA-256 hash and on-chain tx status. */
export function EvidenceList({ title, items }) {
  const { explorerUrl } = useNetwork();
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <h4 style={{ fontSize: 14, margin: '0 0 8px', color: '#333' }}>{title} ({items.length})</h4>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888' }}>No evidence submitted.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((e) => {
            const badge = TX_BADGE[e.tx_status] || TX_BADGE.pending;
            return (
              <li key={e.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 12 }}>
                <a href={e.file_url} target="_blank" rel="noreferrer" style={{ color: '#2d6a4f', fontWeight: 600, wordBreak: 'break-all' }}>
                  {e.file_name || 'Evidence file'}
                </a>
                <div style={{ fontFamily: 'monospace', color: '#555', wordBreak: 'break-all', margin: '4px 0' }} title="SHA-256">
                  {e.sha256}
                </div>
                <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, background: badge.bg, color: badge.color, fontWeight: 600 }}>
                  {badge.label}
                </span>
                {e.tx_hash && (
                  <a href={explorerUrl('tx', e.tx_hash)} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#2d6a4f' }}>
                    view tx
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function buildTimeline(d) {
  const events = [{ at: d.created_at, text: `Dispute opened by ${d.buyer_name || 'buyer'}: ${d.reason}` }];
  for (const e of d.evidence || []) {
    events.push({ at: e.created_at, text: `${e.party === 'buyer' ? 'Buyer' : 'Farmer'} submitted evidence (${e.file_name || 'file'})` });
  }
  events.push({ at: d.evidence_window_closes_at, text: 'Evidence window closes', future: Date.now() < new Date(d.evidence_window_closes_at).getTime() });
  if (d.status === 'resolved') {
    events.push({ at: d.resolved_at || d.updated_at || null, text: `Admin decision: buyer receives ${(d.buyer_bps / 100).toFixed(2)}% of escrow` });
  }
  return events.sort((a, b) => (a.at ? new Date(a.at) : Infinity) - (b.at ? new Date(b.at) : Infinity));
}

/**
 * Dispute detail for the buyer (from Orders) or the farmer (from Sales): timeline,
 * evidence window countdown, both parties' evidence, counter-evidence upload and
 * the final split once resolved.
 */
export default function DisputeDetail({ orderId, onClose }) {
  const titleId = useId();
  const [dispute, setDispute] = useState(null);
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setDispute(await api.getDisputeByOrder(orderId));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Tick the countdown, and poll while any evidence tx is still pending.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);
  const hasPending = dispute?.evidence?.some((e) => e.tx_status === 'pending');
  useEffect(() => {
    if (!hasPending) return undefined;
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [hasPending, load]);

  async function handleUpload(e) {
    e.preventDefault();
    if (uploading || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      setDispute(await api.submitDisputeEvidence(dispute.id, files));
      setFiles([]);
      e.target.reset?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  const party = dispute?.party;
  const blocked = dispute ? evidenceBlockReason(dispute, party) : '';
  const remaining = dispute && party ? dispute.max_evidence_per_party - (dispute.evidence_count?.[party] ?? 0) : 0;
  const msLeft = dispute ? new Date(dispute.evidence_window_closes_at).getTime() - now : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
        style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 id={titleId} style={{ fontSize: 17, margin: 0, color: '#222' }}>Dispute — order #{orderId}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {!dispute && !error && <div style={{ color: '#666' }}>Loading…</div>}
        {error && <div role="alert" style={{ color: '#b42318', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        {dispute && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, marginBottom: 16 }}>
              <span><strong>Status:</strong> {dispute.status.replace('_', ' ')}</span>
              <span><strong>Escrow:</strong> {Number(dispute.total_price).toFixed(2)} XLM</span>
              {dispute.status !== 'resolved' && (
                <span data-testid="evidence-countdown"><strong>Evidence window:</strong> {formatCountdown(msLeft)}</span>
              )}
            </div>

            {dispute.status === 'resolved' && dispute.buyer_bps != null && (
              <div style={{ background: '#d8f3dc', color: '#1b4332', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
                <strong>Final split:</strong> buyer {(dispute.buyer_bps / 100).toFixed(2)}% ·
                farmer {((10000 - dispute.buyer_bps) / 100).toFixed(2)}% (before platform fee and royalty)
              </div>
            )}

            <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Timeline</h3>
            <ol style={{ fontSize: 13, color: '#444', paddingLeft: 18, margin: '0 0 16px' }}>
              {buildTimeline(dispute).map((ev, i) => (
                <li key={i} style={{ marginBottom: 4, color: ev.future ? '#888' : undefined }}>
                  {ev.at && <span style={{ color: '#888' }}>{new Date(ev.at).toLocaleString()} — </span>}
                  {ev.text}
                </li>
              ))}
            </ol>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <EvidenceList title="Buyer evidence" items={dispute.evidence.filter((e) => e.party === 'buyer')} />
              <EvidenceList title="Farmer evidence" items={dispute.evidence.filter((e) => e.party === 'farmer')} />
            </div>

            {party && dispute.status !== 'resolved' && (
              <form onSubmit={handleUpload}>
                <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>
                  {party === 'farmer' ? 'Submit counter-evidence' : 'Add evidence'}
                </h3>
                <input type="file" multiple accept={EVIDENCE_ACCEPT} disabled={Boolean(blocked) || uploading}
                  aria-label="Evidence files"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    const msg = validateEvidenceFiles(picked, remaining);
                    setError(msg);
                    setFiles(msg ? [] : picked);
                  }} />
                <button type="submit" disabled={Boolean(blocked) || uploading || files.length === 0}
                  aria-describedby={blocked ? `${titleId}-blocked` : undefined}
                  style={{ marginLeft: 8, padding: '7px 14px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#fff', background: blocked || uploading || files.length === 0 ? '#ccc' : '#2d6a4f', cursor: blocked ? 'not-allowed' : 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <div id={`${titleId}-blocked`} style={{ fontSize: 12, color: blocked ? '#b42318' : '#666', marginTop: 6 }}>
                  {blocked || `${remaining} of ${dispute.max_evidence_per_party} uploads left · images or PDF, 5 MB each`}
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
