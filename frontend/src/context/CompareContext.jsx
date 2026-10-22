import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MAX_RECENTLY_COMPARED } from '../components/RecentlyCompared';
import { safeStorage } from '../utils/safeStorage';

const CompareContext = createContext(null);

const HISTORY_KEY = 'comparison_history';

export function CompareProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [compareWarning, setCompareWarning] = useState('');
  const location = useLocation();

  // Load history from localStorage on mount
  useEffect(() => {
    const stored = safeStorage.getJSON(HISTORY_KEY);
    if (Array.isArray(stored)) setHistory(stored);
  }, []);

  useEffect(() => {
    const allowed =
      location.pathname.startsWith('/marketplace') || location.pathname.startsWith('/compare');
    if (!allowed && products.length > 0) {
      setProducts([]);
    }
  }, [location.pathname, products.length]);

  const saveToHistory = useCallback((productIds) => {
    if (!productIds || productIds.length === 0) return;

    setHistory((prev) => {
      // Create new history entry with product IDs
      const newEntry = {
        id: Date.now(),
        productIds,
        timestamp: new Date().toISOString(),
      };

      // Keep only last MAX_RECENTLY_COMPARED comparisons
      const updated = [newEntry, ...prev].slice(0, MAX_RECENTLY_COMPARED);

      safeStorage.setJSON(HISTORY_KEY, updated);

      return updated;
    });
  }, []);

  const addProduct = useCallback((product) => {
    setProducts((prev) => {
      if (prev.some((p) => p.id === product.id)) return prev;
      if (prev.length >= 4) {
        setCompareWarning(
          `Compare list is full (max 4). Remove a product before adding "${product.name}".`
        );
        return prev;
      }
      setCompareWarning('');
      return [...prev, product];
    });
  }, []);

  const removeProduct = useCallback((productId) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  }, []);

  const toggleProduct = useCallback((product) => {
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        setCompareWarning('');
        return prev.filter((p) => p.id !== product.id);
      }
      if (prev.length >= 4) {
        setCompareWarning(
          `Compare list is full (max 4). Remove a product before adding "${product.name}".`
        );
        return prev;
      }
      setCompareWarning('');
      return [...prev, product];
    });
  }, []);

  const clearProducts = useCallback(() => {
    setProducts([]);
  }, []);

  const restoreComparison = useCallback((historyEntry) => {
    // Restore comparison from history (product IDs will be fetched by parent)
    return historyEntry.productIds;
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    safeStorage.remove(HISTORY_KEY);
  }, []);

  const removeProductsFromHistory = useCallback((productIds) => {
    const unavailableIds = new Set(productIds);
    setHistory((prev) => {
      const updated = prev
        .map((entry) => ({
          ...entry,
          productIds: entry.productIds.filter((id) => !unavailableIds.has(id)),
        }))
        .filter((entry) => entry.productIds.length > 0);
      safeStorage.setJSON(HISTORY_KEY, updated);
      return updated;
    });
  }, []);

  const isCompared = useCallback(
    (productId) => {
      return products.some((p) => p.id === productId);
    },
    [products]
  );

  return (
    <CompareContext.Provider
      value={{
        products,
        history,
        compareWarning,
        addProduct,
        removeProduct,
        toggleProduct,
        clearProducts,
        saveToHistory,
        restoreComparison,
        clearHistory,
        removeProductsFromHistory,
        isCompared,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  return useContext(CompareContext);
}
