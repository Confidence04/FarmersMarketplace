import React from 'react';
import { s } from './walletStyles';

if (typeof document !== 'undefined' && !document.getElementById('wallet-toast-style')) {
  const style = document.createElement('style');
  style.id = 'wallet-toast-style';
  style.textContent = '@keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } @keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}

/** Incoming payment notifications, stacked bottom-right. */
export default function WalletToast({ toasts, usd }) {
  return (
    <div className="wallet-toast-container" style={s.toastContainer} aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="wallet-toast" style={s.toast} role="status">
          <div style={s.toastTitle}>Payment received</div>
          <div style={s.toastSub}>
            +{parseFloat(t.amount).toFixed(2)} XLM {usd(parseFloat(t.amount)) && <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>({usd(parseFloat(t.amount))})</span>} from {t.from.slice(0, 8)}...{t.from.slice(-4)}
          </div>
        </div>
      ))}
    </div>
  );
}
