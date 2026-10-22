import React, { useCallback, useEffect, useRef, useState } from 'react';

const STROOPS_PER_XLM = 10_000_000n;
const RESYNC_MS = 60_000;

function toBigInt(v) {
  try {
    return BigInt(String(v ?? 0).split('.')[0] || 0);
  } catch {
    return 0n;
  }
}

/**
 * Mirrors escrow stream.rs `get_accrued_amount` in integer stroops:
 *   accrued = min(deposit, accrued_at_checkpoint + (min(now, end) - last_checkpoint) * rate)
 * Returns the amount still withdrawable (accrued - withdrawn), never negative.
 */
export function computeAccruedStroops(stream, nowSec) {
  const rate = toBigInt(stream.rate_per_second);
  const deposit = toBigInt(stream.deposit_stroops ?? stream.deposit);
  const checkpointAccrued = toBigInt(stream.accrued_at_checkpoint);
  const lastCheckpoint = BigInt(Math.floor(Number(stream.last_checkpoint_at ?? stream.start_time ?? 0)));
  const withdrawn = toBigInt(stream.withdrawn);

  let accrued;
  if (stream.cancelled) {
    accrued = checkpointAccrued;
  } else {
    const end = stream.end_time != null ? BigInt(Math.floor(Number(stream.end_time))) : null;
    let now = BigInt(Math.floor(nowSec));
    if (end !== null && now > end) now = end;
    const delta = now > lastCheckpoint ? now - lastCheckpoint : 0n;
    accrued = checkpointAccrued + delta * rate;
    if (deposit > 0n && accrued > deposit) accrued = deposit;
  }
  const available = accrued - withdrawn;
  return available > 0n ? available : 0n;
}

export function formatStroops(stroops, decimals = 7) {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / STROOPS_PER_XLM;
  const frac = (abs % STROOPS_PER_XLM).toString().padStart(7, '0').slice(0, decimals);
  return `${neg ? '-' : ''}${whole}${decimals ? `.${frac}` : ''}`;
}

/**
 * Live accrual counter for a payment stream (FE-31).
 *
 * Two modes:
 *  - `stream` (preferred): raw contract fields (stroops) from GET /api/streams.
 *    Animates with requestAnimationFrame using integer BigInt math, pauses when
 *    the tab is hidden and re-syncs via `onResync` every 60 s. Shows withdraw
 *    (recipient) or top-up / cancel (sender) controls when handlers are given.
 *  - legacy `accrued` / `asOf` / `rate` props: ticks locally once per second.
 */
export default function StreamAccrual({
  stream,
  accrued,
  asOf,
  rate,
  onResync,
  onWithdraw,
  onTopUp,
  onCancel,
}) {
  if (stream) {
    return (
      <LiveStreamAccrual
        stream={stream}
        onResync={onResync}
        onWithdraw={onWithdraw}
        onTopUp={onTopUp}
        onCancel={onCancel}
      />
    );
  }
  return <LegacyAccrual accrued={accrued} asOf={asOf} rate={rate} />;
}

function LegacyAccrual({ accrued, asOf, rate }) {
  const baseRef = useRef({
    accrued: Number(accrued) || 0,
    asOf: asOf ? new Date(asOf).getTime() : Date.now(),
  });
  const [displayed, setDisplayed] = useState(baseRef.current.accrued);

  useEffect(() => {
    baseRef.current = {
      accrued: Number(accrued) || 0,
      asOf: asOf ? new Date(asOf).getTime() : Date.now(),
    };
    setDisplayed(baseRef.current.accrued);
  }, [accrued, asOf]);

  useEffect(() => {
    if (!rate || rate <= 0) return;
    const timer = setInterval(() => {
      const elapsedSeconds = Math.max(0, (Date.now() - baseRef.current.asOf) / 1000);
      setDisplayed(baseRef.current.accrued + elapsedSeconds * Number(rate));
    }, 1000);
    return () => clearInterval(timer);
  }, [rate]);

  return <span>{displayed.toFixed(4)}</span>;
}

function LiveStreamAccrual({ stream, onResync, onWithdraw, onTopUp, onCancel }) {
  const [available, setAvailable] = useState(() => computeAccruedStroops(stream, Date.now() / 1000));
  const [confirming, setConfirming] = useState(null); // 'cancel' | 'topup' | null
  const [topUpXlm, setTopUpXlm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef(stream);
  streamRef.current = stream;

  // rAF loop; only commits state when the stroop value actually changes.
  useEffect(() => {
    let frame = null;
    let last = null;
    const tick = () => {
      const next = computeAccruedStroops(streamRef.current, Date.now() / 1000);
      if (next !== last) {
        last = next;
        setAvailable(next);
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame == null && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stream]);

  // Re-sync with backend/chain every 60 s while visible.
  useEffect(() => {
    if (!onResync) return;
    const timer = setInterval(() => {
      if (!document.hidden) onResync();
    }, RESYNC_MS);
    return () => clearInterval(timer);
  }, [onResync]);

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setConfirming(null);
      onResync?.();
    } catch (e) {
      setError(e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }, [onResync]);

  const nowSec = Date.now() / 1000;
  const deposit = toBigInt(stream.deposit_stroops ?? stream.deposit);
  const withdrawn = toBigInt(stream.withdrawn);
  const payoutOnCancel = computeAccruedStroops(stream, nowSec);
  const refundOnCancel = (() => {
    const r = deposit - withdrawn - payoutOnCancel;
    return r > 0n ? r : 0n;
  })();
  const isSender = stream.role === 'sender';
  const isRecipient = stream.role === 'recipient';
  const active = !stream.cancelled;

  const btn = {
    border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
    fontWeight: 600, minHeight: 36, color: '#fff', background: '#2d6a4f',
  };

  return (
    <div>
      <span aria-live="off" data-testid="stream-accrued">{formatStroops(available)}</span> XLM available
      {error && <div role="alert" style={{ color: '#c62828', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        {isRecipient && onWithdraw && (
          <button
            type="button"
            style={btn}
            disabled={busy || available === 0n}
            onClick={() => run(() => onWithdraw(stream))}
          >
            Withdraw available
          </button>
        )}
        {isSender && active && onTopUp && (
          <button type="button" style={btn} disabled={busy} onClick={() => setConfirming('topup')}>
            Top up
          </button>
        )}
        {isSender && active && onCancel && (
          <button
            type="button"
            style={{ ...btn, background: '#c62828' }}
            disabled={busy}
            onClick={() => setConfirming('cancel')}
          >
            Cancel
          </button>
        )}
      </div>

      {confirming === 'cancel' && (
        <div role="dialog" aria-label="Confirm cancel stream" style={{ marginTop: 8, fontSize: 13 }}>
          <div>Cancelling now pays <strong>{formatStroops(payoutOnCancel)} XLM</strong> to the recipient
            and refunds <strong>{formatStroops(refundOnCancel)} XLM</strong> to you.</div>
          <button type="button" style={{ ...btn, background: '#c62828', marginTop: 6 }} disabled={busy}
            onClick={() => run(() => onCancel(stream))}>Confirm cancel</button>{' '}
          <button type="button" style={{ ...btn, background: '#888' }} onClick={() => setConfirming(null)}>Back</button>
        </div>
      )}

      {confirming === 'topup' && (
        <form
          style={{ marginTop: 8, fontSize: 13 }}
          onSubmit={(e) => {
            e.preventDefault();
            const xlm = Number(topUpXlm);
            if (!Number.isFinite(xlm) || xlm <= 0) return setError('Enter a positive amount');
            const stroops = BigInt(Math.round(xlm * 1e7));
            run(() => onTopUp(stream, stroops.toString()));
          }}
        >
          <label>
            Top-up amount (XLM){' '}
            <input type="number" min="0" step="0.0000001" value={topUpXlm}
              onChange={(e) => setTopUpXlm(e.target.value)} />
          </label>{' '}
          <button type="submit" style={btn} disabled={busy}>Confirm top up</button>{' '}
          <button type="button" style={{ ...btn, background: '#888' }} onClick={() => setConfirming(null)}>Back</button>
        </form>
      )}
    </div>
  );
}
