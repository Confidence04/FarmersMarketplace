import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const s = {
  skeleton: { height: 56, borderRadius: 8, background: 'linear-gradient(90deg,#eee,#f6f6f6,#eee)', marginBottom: 8 },
  error:    { color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca', display: 'flex', gap: 12, alignItems: 'center' },
  btn:      { padding: '8px 16px', borderRadius: 8, border: '1px solid #2d6a4f', background: '#fff', color: '#2d6a4f', cursor: 'pointer', fontWeight: 600 },
};

/**
 * Infinite-scroll list driven by usePaginatedQuery in 'cursor' mode (FE-21).
 * An IntersectionObserver sentinel loads the next page; a "Load more" button
 * stays as a fallback for browsers/assistive tech without scroll triggers.
 */
export default function InfiniteList({ query, renderItem, getKey = (item) => item.id, emptyText }) {
  const { t } = useTranslation();
  const sentinelRef = useRef(null);
  const { items, hasMore, loading, loadingMore, error, loadMore, retry } = query;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (loading) {
    return <div aria-busy="true">{[0, 1, 2].map((i) => <div key={i} style={s.skeleton} />)}</div>;
  }

  return (
    <div>
      {items.length === 0 && !error && <p style={{ color: '#888' }}>{emptyText ?? t('feedPagination.empty', 'Nothing here yet.')}</p>}
      {items.map((item, i) => <React.Fragment key={getKey(item, i)}>{renderItem(item, i)}</React.Fragment>)}
      {loadingMore && <div aria-busy="true">{[0, 1].map((i) => <div key={i} style={s.skeleton} />)}</div>}
      {error && (
        <div role="alert" style={s.error}>
          <span>{error.message || t('feedPagination.loadError', 'Could not load more items.')}</span>
          <button type="button" style={s.btn} onClick={retry}>{t('feedPagination.retry', 'Retry')}</button>
        </div>
      )}
      {hasMore && !loadingMore && !error && (
        <div ref={sentinelRef} style={{ textAlign: 'center', marginTop: 12 }}>
          <button type="button" style={s.btn} onClick={loadMore}>{t('feedPagination.loadMore', 'Load more')}</button>
        </div>
      )}
    </div>
  );
}
