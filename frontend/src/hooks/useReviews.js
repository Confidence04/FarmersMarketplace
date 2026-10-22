import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { getErrorMessage } from '../utils/errorMessages';

/**
 * useReviews: Custom hook for fetching product reviews
 * Manages loading state, error handling, and request cancellation via AbortController
 */
export function useReviews(productId) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(!!productId);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const abortControllerRef = useRef(null);

  const fetchReviews = useCallback(async (id = productId, page = 1) => {
    if (!id) {
      setReviews([]);
      setLoading(false);
      return;
    }

    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const response = await api.getProductReviews(id, { page }, {
        signal: abortControllerRef.current.signal,
      });

      if (abortControllerRef.current.signal.aborted) {
        return;
      }

      setReviews(response.data ?? []);
      setPagination(response.pagination ?? { page: 1, pages: 1, total: 0 });
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled, don't update state
      }
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchReviews();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchReviews]);

  return {
    reviews,
    loading,
    error,
    pagination,
    refetch: fetchReviews,
  };
}
