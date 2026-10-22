import { safeStorage } from './safeStorage';

const RECENTLY_VIEWED_KEY = 'recently_viewed';
const MAX_ITEMS = 10;

export function addRecentlyViewed(product) {
  const list = getRecentlyViewed();
  const filtered = list.filter(p => p.id !== product.id);
  const updated = [{ id: product.id, name: product.name, image_url: product.image_url || product.image, price: product.price }, ...filtered].slice(0, MAX_ITEMS);
  safeStorage.setJSON(RECENTLY_VIEWED_KEY, updated);
}

export function getRecentlyViewed() {
  const data = safeStorage.getJSON(RECENTLY_VIEWED_KEY, []);
  return Array.isArray(data) ? data : [];
}

export function clearRecentlyViewed() {
  safeStorage.remove(RECENTLY_VIEWED_KEY);
}
