import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { getErrorMessage } from '../utils/errorMessages';

/**
 * useProducts: Custom hook for fetching products with filters and caching
 * Manages loading state, error handling, and request cancellation via AbortController
 */
export function useProducts(filters = {}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const abortControllerRef = useRef(null);

  const fetchProducts = useCallback(async (filtersToUse = filters) => {
    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const response = await api.getProducts(filtersToUse, {
        signal: abortControllerRef.current.signal,
      });

      if (abortControllerRef.current.signal.aborted) {
        return;
      }

      setProducts(response.data ?? []);
      setPagination(response.pagination ?? { page: 1, pages: 1, total: 0 });
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled, don't update state
      }
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchProducts();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchProducts]);

  return {
    products,
    loading,
    error,
    pagination,
    refetch: fetchProducts,
  };
}
