/**
 * Exception-safe wrappers around Web Storage.
 *
 * `localStorage` / `sessionStorage` can throw on every access — SecurityError
 * when storage is disabled or in sandboxed iframes, QuotaExceededError when
 * full or in Safari private mode. Every call here is guarded and falls back to
 * an in-memory map, so values still persist for the lifetime of the tab.
 */

function createSafeStorage(getBacking) {
  const memory = new Map();

  function backing() {
    try {
      return getBacking() || null;
    } catch {
      return null;
    }
  }

  function get(key) {
    try {
      const store = backing();
      if (store) {
        const value = store.getItem(key);
        if (value !== null) return value;
      }
    } catch {
      /* fall through to memory */
    }
    return memory.has(key) ? memory.get(key) : null;
  }

  function set(key, value) {
    const str = String(value);
    memory.set(key, str);
    try {
      backing()?.setItem(key, str);
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    memory.delete(key);
    try {
      backing()?.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }

  function getJSON(key, fallback = null) {
    const raw = get(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function setJSON(key, value) {
    let str;
    try {
      str = JSON.stringify(value);
    } catch {
      return false;
    }
    return set(key, str);
  }

  return { get, set, remove, getJSON, setJSON };
}

export const safeStorage = createSafeStorage(() =>
  typeof window !== 'undefined' ? window.localStorage : null
);

export const safeSessionStorage = createSafeStorage(() =>
  typeof window !== 'undefined' ? window.sessionStorage : null
);

export const { get, set, remove, getJSON, setJSON } = safeStorage;

export default safeStorage;
