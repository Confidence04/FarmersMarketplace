import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { queryKeys } from '../lib/queryClient';

// Every query passes { silent: true } where the client supports it so cached
// background refetches don't flash the global LoadingContext overlay.

export const useWalletBalance = (options) =>
  useQuery({ queryKey: queryKeys.wallet, queryFn: () => api.getWallet({ silent: true }), ...options });

export const useCurrentUser = (options) =>
  useQuery({ queryKey: queryKeys.currentUser, queryFn: () => api.getCurrentUser({ silent: true }), ...options });

export const useCategories = (options) =>
  useQuery({ queryKey: queryKeys.categories, queryFn: () => api.getCategories({ silent: true }), staleTime: 10 * 60_000, ...options });

export const useRates = (options) =>
  useQuery({ queryKey: queryKeys.rates, queryFn: () => api.getXlmRate({ silent: true }), staleTime: 60_000, ...options });

export const useFavoritesQuery = (options) =>
  useQuery({ queryKey: queryKeys.favorites, queryFn: () => api.getFavorites({}, { silent: true }), ...options });

export const useUnreadCount = (options) =>
  useQuery({ queryKey: queryKeys.unreadCount, queryFn: () => api.getUnreadMessageCount({ silent: true }), refetchInterval: 60_000, ...options });

/** Placing an order changes the buyer's balance and order list. */
export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }) => api.placeOrder(body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.wallet });
      qc.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, favorite }) => (favorite ? api.addFavorite(productId) : api.removeFavorite(productId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.favorites }),
  });
}

/** Replaces the `messages:read` window event: mark-read callers invalidate the count. */
export function useInvalidateUnreadCount() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
}
