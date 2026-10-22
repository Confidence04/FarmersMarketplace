import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { notificationLink, isUnread } from '../utils/notifications';

const PAGE_SIZE = 20;

const s = {
  page: { maxWidth: 720, margin: '0 auto', padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  btn: { background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 14, minHeight: 44 },
  item: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 8, background: 'var(--color-surface, #fff)', boxShadow: '0 1px 4px #0001', marginBottom: 8 },
  link: { textDecoration: 'none', color: 'inherit', flex: 1 },
  small: { background: 'none', border: '1px solid #2d6a4f', color: '#2d6a4f', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, alignSelf: 'center' },
};

export default function Notifications() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const params = { limit: PAGE_SIZE };
      if (cursor) params.cursor = cursor;
      const res = await api.getNotifications(params);
      const page = res?.data || [];
      const next = res?.next_cursor ?? res?.nextCursor ?? null;
      setItems(prev => {
        const seen = new Set(prev.map(i => i.id));
        return [...prev, ...page.filter(i => !seen.has(i.id))];
      });
      setCursor(next);
      setHasMore(Boolean(next) && page.length > 0);
    } catch {
      setError(t('notificationCenter.loadError'));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, hasMore, t]);

  // Initial page
  useEffect(() => { loadMore(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) loadMore();
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  async function markRead(n) {
    if (!isUnread(n)) return;
    setItems(prev => prev.map(i => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
    try { await api.markNotificationRead(n.id); } catch { /* best effort */ }
  }

  async function markAll() {
    const now = new Date().toISOString();
    setItems(prev => prev.map(i => ({ ...i, read_at: i.read_at || now })));
    try { await api.markAllNotificationsRead(); } catch { /* best effort */ }
  }

  const unread = items.filter(isUnread).length;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={{ margin: 0, fontSize: 24 }}>{t('notificationCenter.title')}</h1>
        <button type="button" style={s.btn} onClick={markAll} disabled={unread === 0}>
          {t('notificationCenter.markAllRead')}
        </button>
      </div>
      <p role="status" style={{ fontSize: 13, color: '#666' }}>{t('notificationCenter.unreadCount', { count: unread })}</p>
      {items.length === 0 && !loading && !error && <p>{t('notificationCenter.empty')}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map(n => (
          <li key={n.id} style={{ ...s.item, borderLeft: isUnread(n) ? '4px solid #2d6a4f' : '4px solid transparent' }}>
            <Link to={notificationLink(n)} style={s.link} onClick={() => markRead(n)}>
              <div style={{ fontWeight: isUnread(n) ? 700 : 400 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{n.body}</div>}
              {n.created_at && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>}
            </Link>
            {isUnread(n) && (
              <button type="button" style={s.small} onClick={() => markRead(n)}>
                {t('notificationCenter.markRead')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" style={{ color: '#c0392b' }}>{error}</p>}
      {loading && <p>{t('notificationCenter.loading')}</p>}
      {hasMore && !loading && (
        <div ref={sentinelRef} style={{ textAlign: 'center', padding: 12 }}>
          <button type="button" style={s.small} onClick={loadMore}>{t('notificationCenter.loadMore')}</button>
        </div>
      )}
    </div>
  );
}
