import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { getErrorMessage } from '../utils/errorMessages';

/**
 * useProduct: Custom hook for fetching single product details
 * Manages loading state, error handling, and request cancellation via AbortController
 */
export function useProduct(productId) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(!!productId);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);

  const fetchProduct = useCallback(async (id = productId) => {
    if (!id) {
      setProduct(null);
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
      const response = await api.getProduct(id, {
        signal: abortControllerRef.current.signal,
      });

      if (abortControllerRef.current.signal.aborted) {
        return;
      }

      setProduct(response.data ?? response);
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
    fetchProduct();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchProduct]);

  return {
    product,
    loading,
    error,
    refetch: fetchProduct,
  };
}
