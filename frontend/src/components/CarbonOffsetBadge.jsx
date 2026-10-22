import React, { useEffect, useId, useState } from 'react';
import { api } from '../api/client';
import { useNetwork } from '../context/NetworkContext';

export function formatKg(kg) {
  const n = Number(kg) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)} t` : `${n.toLocaleString()} kg`;
}

/**
 * "🌱 X kg CO₂ offset (verified)" badge (#1503).
 *
 * Pass `kgCo2` directly, or `orderId` to read `get_offset(order_id)` from the
 * carbon-offset contract. Voided offsets come back empty and render nothing;
 * amended offsets return their current value.
 */
export default function CarbonOffsetBadge({ orderId, kgCo2, contractId, label }) {
  const { explorerUrl } = useNetwork();
  const tipId = useId();
  const [offset, setOffset] = useState(
    kgCo2 != null ? { kg_co2: kgCo2, contractId } : null
  );
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    if (kgCo2 != null) {
      setOffset({ kg_co2: kgCo2, contractId });
      return undefined;
    }
    if (!orderId) return undefined;
    let cancelled = false;
    Promise.resolve(api.getOrderCarbon?.(orderId))
      .then((res) => { if (!cancelled) setOffset(res?.data ?? null); })
      .catch(() => { if (!cancelled) setOffset(null); });
    return () => { cancelled = true; };
  }, [orderId, kgCo2, contractId]);

  const kg = Number(offset?.kg_co2);
  if (!offset || offset.voided || !Number.isFinite(kg) || kg <= 0) return null;
  const cid = offset.contractId || contractId;

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowTip(false); }}
      onKeyDown={(e) => { if (e.key === 'Escape') setShowTip(false); }}
    >
      <span
        data-testid="carbon-offset-badge"
        tabIndex={0}
        aria-describedby={tipId}
        style={{
          display: 'inline-block',
          fontSize: 12,
          fontWeight: 600,
          padding: '3px 10px',
          borderRadius: 999,
          background: '#d8f3dc',
          color: '#1b4332',
        }}
      >
        🌱 {label ? `${label} ` : ''}{formatKg(kg)} CO₂ offset (verified)
      </span>
      <span
        id={tipId}
        role="tooltip"
        style={{
          display: showTip ? 'block' : 'none',
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 20,
          marginTop: 4,
          width: 260,
          padding: '8px 10px',
          borderRadius: 8,
          background: '#1b1b1b',
          color: '#fff',
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 1.4,
          boxShadow: '0 4px 16px #0003',
        }}
      >
        Recorded on-chain by the carbon-offset contract after an independent verifier signed off the amount.
        {cid && (
          <>
            {' '}
            <a
              href={explorerUrl('contract', cid)}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#95d5b2' }}
            >
              View contract on stellar.expert
            </a>
          </>
        )}
      </span>
    </span>
  );
}
