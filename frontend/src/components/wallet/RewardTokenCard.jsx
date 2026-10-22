import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useNetwork } from '../../context/NetworkContext';

export function formatTokens(raw, decimals = 0) {
  const n = Number(raw) || 0;
  const d = Number(decimals) || 0;
  return (n / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: d });
}

/** Reward token balance, vesting and earn/redeem history (#1504). */
export default function RewardTokenCard() {
  const { explorerUrl } = useNetwork();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.getRewards?.())
      .then((res) => { if (!cancelled) setData(res?.data ?? null); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Unable to load rewards'); });
    return () => { cancelled = true; };
  }, []);

  if (error) return null;
  if (!data || !data.configured) return null;
  const sym = data.symbol || 'RWD';
  const fmt = (v) => `${formatTokens(v, data.decimals)} ${sym}`;

  return (
    <section aria-labelledby="reward-card-title" data-testid="reward-token-card"
      style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 8px #0001', marginBottom: 20 }}>
      <h2 id="reward-card-title" style={{ fontSize: 16, margin: '0 0 12px', color: '#2d6a4f' }}>🎁 Reward tokens</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: 0 }}>
        <div><dt style={{ fontSize: 12, color: '#595959' }}>Total balance</dt><dd style={{ margin: 0, fontWeight: 700 }}>{fmt(data.balance)}</dd></div>
        <div><dt style={{ fontSize: 12, color: '#595959' }}>Vested (redeemable)</dt><dd style={{ margin: 0, fontWeight: 700, color: '#2d6a4f' }}>{fmt(data.vested)}</dd></div>
        <div>
          <dt style={{ fontSize: 12, color: '#595959' }}>Unvested</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>
            {fmt(data.unvested)}
            {data.nextVestingAt && (
              <div style={{ fontSize: 12, fontWeight: 400, color: '#595959' }}>
                Next vesting {new Date(data.nextVestingAt).toLocaleDateString()}
              </div>
            )}
          </dd>
        </div>
      </dl>
      {data.history?.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>History</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }}>
            {data.history.slice(0, 20).map((h) => (
              <li key={`${h.type}-${h.order_id}`} style={{ padding: '6px 0', borderTop: '1px solid #eee', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: h.type === 'earned' ? '#2d6a4f' : '#b42318', fontWeight: 600 }}>
                  {h.type === 'earned' ? '+' : '−'}{fmt(h.amount)}
                </span>
                <span>{h.type === 'earned' ? 'Earned' : 'Redeemed'} on order #{h.order_id}{h.product_name ? ` (${h.product_name})` : ''}</span>
                {h.tx_hash && (
                  <a href={explorerUrl('tx', h.tx_hash)} target="_blank" rel="noreferrer" style={{ color: '#2d6a4f' }}>View tx</a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
