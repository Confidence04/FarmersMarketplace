import React from 'react';
import { useNetwork } from '../../context/NetworkContext';
import { useFreighter, toFreighterNetwork } from '../../utils/freighter';

/** Wallet page card: connect/disconnect Freighter and show key + network (FE-15). */
export default function FreighterConnect() {
  const { network: appNetwork } = useNetwork();
  const { installed, connected, publicKey, network, mismatch, error, connect, disconnect } = useFreighter(appNetwork);

  const btn = { padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 8px #0001', marginBottom: 24 }} data-testid="freighter-connect">
      <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#333' }}>External wallet (Freighter)</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666' }}>
        Pay from your own Stellar wallet. Your keys stay in Freighter; the platform never sees them.
      </p>

      {installed === false && (
        <div style={{ fontSize: 13, color: '#555' }}>
          Freighter isn't installed. Get it at{' '}
          <a href="https://www.freighter.app/" target="_blank" rel="noreferrer" style={{ color: '#2d6a4f' }}>freighter.app</a>.
          Checkout uses your platform wallet in the meantime.
        </div>
      )}

      {installed && !connected && (
        <button type="button" style={{ ...btn, background: '#2d6a4f', color: '#fff' }} onClick={connect}>
          Connect Freighter
        </button>
      )}

      {connected && (
        <>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>Public key:</strong>{' '}
            <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{publicKey}</span>
          </div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            <strong>Network:</strong> {network || 'unknown'}
          </div>
          {mismatch && (
            <div role="alert" style={{ background: '#fee', color: '#b42318', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 10, fontWeight: 600 }}>
              Freighter is on {network} but this app runs on {toFreighterNetwork(appNetwork)}. Switch networks in
              Freighter before paying. Payments from Freighter are blocked until then.
            </div>
          )}
          <button type="button" style={{ ...btn, background: '#f0f0f0', color: '#333' }} onClick={disconnect}>
            Disconnect
          </button>
        </>
      )}

      {error && <div role="alert" style={{ color: '#b42318', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
