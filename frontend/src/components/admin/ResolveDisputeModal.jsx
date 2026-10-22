import React, { useEffect, useId, useState } from 'react';
import { api } from '../../api/client';
import { getErrorMessage } from '../../utils/errorMessages';
import { computeDisputeSplit } from '../../utils/disputeSplit';
import ConfirmDialog from '../ConfirmDialog';
import { EvidenceList } from '../disputes/DisputeDetail';

const PRESETS = [0, 50, 100];

const fmt = (xlm) => `${xlm.toFixed(7).replace(/0+$/, '').replace(/\.$/, '')} XLM`;

/**
 * Admin resolves a dispute with any buyer/farmer split (FE-14). The buyer share is
 * sent as `buyer_bps` (0–10000) to PATCH /disputes/:id/resolve, which forwards it to
 * the escrow contract's resolve_dispute(order_id, buyer_bps).
 */
export default function ResolveDisputeModal({ dispute, onConfirm, onCancel }) {
  const titleId = useId();
  const [percent, setPercent] = useState('50');
  const [reason, setReason] = useState('');
  const [feeBps, setFeeBps] = useState(0);
  const [detail, setDetail] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getDispute(dispute.id).then((d) => !cancelled && setDetail(d)).catch(() => {});
    api.getFeePreview(dispute.total_price)
      .then((r) => !cancelled && setFeeBps(Math.round(Number(r.feePercent || 0) * 100)))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [dispute.id, dispute.total_price]);

  const pct = Number(percent);
  const valid = percent !== '' && Number.isFinite(pct) && pct >= 0 && pct <= 100;
  const buyerBps = valid ? Math.round(pct * 100) : 0;
  const royaltyBps = Number(detail?.cooperative_royalty_bps ?? dispute.cooperative_royalty_bps ?? 0);
  const split = computeDisputeSplit({ amount: dispute.total_price, buyerBps, feeBps, royaltyBps });
  const evidence = detail?.evidence || [];

  function handleReview(e) {
    e.preventDefault();
    if (!valid) return setErr('Buyer share must be between 0 and 100%.');
    if (!reason.trim()) return setErr('A reason is required for the audit log.');
    setErr('');
    setConfirming(true);
  }

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(dispute.id, { buyer_bps: buyerBps, reason: reason.trim() });
    } catch (e) {
      setErr(getErrorMessage(e));
      setConfirming(false);
      setBusy(false);
    }
  }

  const rows = [
    ['Buyer refund', split.buyerRefund],
    ['Farmer gross', split.farmerGross],
    [`Platform fee (${(feeBps / 100).toFixed(2)}%)`, split.platformFee],
    [`Cooperative royalty (${(royaltyBps / 100).toFixed(2)}%)`, split.royalty],
    ['Farmer net', split.farmerNet],
  ];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={(e) => e.key === 'Escape' && !confirming && onCancel()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 24px #0003' }}>
        <div id={titleId} style={{ fontWeight: 700, fontSize: 17, marginBottom: 6, color: '#333' }}>
          Resolve Dispute #{dispute.id}
        </div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          <strong>{dispute.product_name}</strong> · {dispute.buyer_name} · {Number(dispute.total_price).toFixed(2)} XLM
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 16, background: '#f8f8f8', borderRadius: 8, padding: '10px 12px' }}>
          <strong>Reason:</strong> {dispute.reason}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }} data-testid="evidence-side-by-side">
          <EvidenceList title="Buyer evidence" items={evidence.filter((e) => e.party === 'buyer')} />
          <EvidenceList title="Farmer evidence" items={evidence.filter((e) => e.party === 'farmer')} />
        </div>

        <form onSubmit={handleReview}>
          <label htmlFor={`${titleId}-pct`} style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
            Buyer share
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <input type="range" min="0" max="100" step="0.01" value={valid ? pct : 0} aria-label="Buyer share slider"
              onChange={(e) => setPercent(e.target.value)} style={{ flex: '1 1 200px' }} />
            <input id={`${titleId}-pct`} type="number" min="0" max="100" step="0.01" value={percent}
              onChange={(e) => setPercent(e.target.value)}
              style={{ width: 90, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }} />
            <span>%</span>
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setPercent(String(p))}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #2d6a4f', background: pct === p ? '#2d6a4f' : '#fff', color: pct === p ? '#fff' : '#2d6a4f', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {p}%
              </button>
            ))}
          </div>

          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 14 }} aria-label="Payout preview">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: '4px 0', color: '#555' }}>{label}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>
            Buyer refund = floor(amount × {buyerBps} / 10000), matching the escrow contract.
          </div>

          <label htmlFor={`${titleId}-reason`} style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 600 }}>
            Decision reason (stored in audit log)
          </label>
          <textarea id={`${titleId}-reason`} required value={reason} onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', minHeight: 60, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />

          {err && <div role="alert" style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            <button type="submit" disabled={busy}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: busy ? '#ccc' : '#2d6a4f', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
              Review decision
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Resolve dispute #${dispute.id}?`}
        confirmLabel={busy ? 'Resolving…' : 'Confirm resolution'}
        onConfirm={handleConfirm}
        onCancel={() => !busy && setConfirming(false)}
      >
        <span style={{ display: 'block' }}>
          Buyer receives <strong>{(buyerBps / 100).toFixed(2)}%</strong>: {fmt(split.buyerRefund)}.
        </span>
        <span style={{ display: 'block' }}>
          Farmer nets {fmt(split.farmerNet)} after {fmt(split.platformFee)} platform fee and {fmt(split.royalty)} royalty.
        </span>
        <span style={{ display: 'block', marginTop: 6 }}>Reason: {reason.trim()}</span>
        <span style={{ display: 'block', marginTop: 6 }}>This is executed on chain and cannot be undone.</span>
      </ConfirmDialog>
    </div>
  );
}
