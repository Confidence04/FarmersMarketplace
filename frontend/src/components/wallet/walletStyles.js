// Colours come from the tokens in src/theme.css so light and dark modes both work.
export const s = {
  page:             { maxWidth: 800, margin: '0 auto', padding: 16 },
  title:            { fontSize: 24, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 24 },
  card:             { background: 'var(--color-surface)', borderRadius: 12, padding: 'clamp(16px, 4vw, 24px)', boxShadow: '0 1px 8px var(--color-shadow)', marginBottom: 24 },
  balance:          { fontSize: 40, fontWeight: 700, color: 'var(--color-primary)' },
  key:              { fontSize: 12, color: 'var(--color-text-muted)', wordBreak: 'break-all', marginTop: 8, fontFamily: 'monospace' },
  btn:              { background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, marginTop: 16, minHeight: 44 },
  btnSm:            { background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnDanger:        { background: 'var(--color-danger)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnOutline:       { background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  tx:               { borderBottom: '1px solid var(--color-border)', padding: '12px 0', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  sent:             { color: 'var(--color-danger)', fontWeight: 600 },
  recv:             { color: 'var(--color-primary)', fontWeight: 600 },
  hash:             { fontSize: 11, color: 'var(--color-text-faint)', fontFamily: 'monospace', marginTop: 2 },
  msg:              { padding: '10px 14px', borderRadius: 8, marginTop: 12, fontSize: 14 },
  label:            { display: 'block', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4, marginTop: 14 },
  input:            { width: '100%', padding: '9px 12px', border: '1px solid var(--color-border-input)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', minHeight: 44, background: 'var(--color-surface)', color: 'var(--color-text)' },
  assetRow:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' },
  assetCode:        { fontWeight: 700, fontSize: 15, color: 'var(--color-primary)' },
  assetBal:         { fontSize: 14, color: 'var(--color-text)', fontWeight: 600 },
  assetIssuer:      { fontSize: 11, color: 'var(--color-text-faint)', fontFamily: 'monospace', marginTop: 2 },
  toastContainer:   { position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' },
  toast:            { background: 'var(--color-primary)', color: 'var(--color-on-primary)', borderRadius: 10, padding: '12px 18px', boxShadow: '0 4px 16px var(--color-shadow-strong)', fontSize: 14, minWidth: 0, maxWidth: 360, pointerEvents: 'auto' },
  toastTitle:       { fontWeight: 700, marginBottom: 3 },
  toastSub:         { fontSize: 12, opacity: 0.85 },
};

/** Success or error banner colours for a `{ type: 'ok' | 'err' }` message. */
export function msgTone(type) {
  return type === 'ok'
    ? { background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }
    : { background: 'var(--color-danger-soft)', color: 'var(--color-danger)' };
}
