/** Resolves the in-app route a notification should open. */
export function notificationLink(n) {
  if (!n) return '/notifications';
  if (typeof n.link === 'string' && n.link.startsWith('/')) return n.link;
  const data = n.data || {};
  const orderId = n.order_id ?? data.order_id;
  const productId = n.product_id ?? data.product_id;
  const disputeId = n.dispute_id ?? data.dispute_id;
  if (disputeId != null) return `/orders?dispute=${encodeURIComponent(disputeId)}`;
  if (orderId != null) return `/orders?order=${encodeURIComponent(orderId)}`;
  if (productId != null) return `/product/${encodeURIComponent(productId)}`;
  return '/notifications';
}

export function isUnread(n) {
  return !n?.read_at && !n?.read;
}
