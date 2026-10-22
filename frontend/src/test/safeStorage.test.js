import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeStorage } from '../utils/safeStorage';
import { addRecentlyViewed, getRecentlyViewed, clearRecentlyViewed } from '../utils/recentlyViewed';

describe('safeStorage (FE-09)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips JSON through localStorage', () => {
    expect(safeStorage.setJSON('k', { a: 1 })).toBe(true);
    expect(safeStorage.getJSON('k')).toEqual({ a: 1 });
    safeStorage.remove('k');
    expect(safeStorage.getJSON('k', 'fallback')).toBe('fallback');
  });

  it('falls back to memory when setItem throws QuotaExceededError', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => safeStorage.set('q', 'v')).not.toThrow();
    expect(safeStorage.get('q')).toBe('v');
  });

  it('survives getItem/removeItem throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(safeStorage.get('missing')).toBeNull();
    expect(() => safeStorage.remove('missing')).not.toThrow();
  });

  it('returns the fallback for malformed JSON', () => {
    localStorage.setItem('bad', '{oops');
    expect(safeStorage.getJSON('bad', [])).toEqual([]);
  });

  it('recentlyViewed does not crash when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => addRecentlyViewed({ id: 1, name: 'Kale', price: 2 })).not.toThrow();
    expect(getRecentlyViewed()[0]).toMatchObject({ id: 1, name: 'Kale' });
    expect(() => clearRecentlyViewed()).not.toThrow();
  });
});
