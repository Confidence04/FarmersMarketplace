import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Normalises the BE-24 list envelope. Accepts `{ data, page, limit, total, hasMore }`,
 * cursor responses `{ data, nextCursor }`, and legacy bare arrays.
 */
export function normalizePage(res) {
  if (Array.isArray(res)) return { items: res, total: res.length, hasMore: false, nextCursor: null };
  const items = res?.data ?? res?.items ?? [];
  const nextCursor = res?.nextCursor ?? res?.next_cursor ?? null;
  const hasMore = res?.hasMore ?? res?.has_more ?? Boolean(nextCursor);
  return { items, total: res?.total ?? items.length, page: res?.page, limit: res?.limit, hasMore, nextCursor };
}

/**
 * Shared list-page fetching (FE-21).
 *
 * mode 'page':   fetcher({ page, limit }) — page number is kept in the URL (`?page=3`).
 * mode 'cursor': fetcher({ cursor, limit }) — items accumulate for infinite scroll.
 */
export function usePaginatedQuery(fetcher, { mode = 'page', limit = 20, deps = [] } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = mode === 'page' ? Math.max(1, Number(searchParams.get('page')) || 1) : 1;

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = normalizePage(await fetcherRef.current(mode === 'page' ? { page, limit } : { limit }));
      setItems(res.items);
      setTotal(res.total);
      setHasMore(res.hasMore);
      setCursor(res.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, page, limit, ...deps]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (mode !== 'cursor' || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = normalizePage(await fetcherRef.current({ cursor, limit }));
      setItems((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
      setCursor(res.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }, [mode, loadingMore, hasMore, cursor, limit]);

  const setPage = useCallback((next) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next <= 1) params.delete('page'); else params.set('page', String(next));
      return params;
    });
  }, [setSearchParams]);

  const retry = useCallback(() => (items.length && mode === 'cursor' ? loadMore() : loadFirst()), [items.length, mode, loadMore, loadFirst]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasMore,
    loading,
    loadingMore,
    error,
    setPage,
    loadMore,
    retry,
    refetch: loadFirst,
  };
}

export default usePaginatedQuery;
