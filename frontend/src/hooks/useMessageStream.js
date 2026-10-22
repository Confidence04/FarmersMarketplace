import { useEffect, useRef } from 'react';
import { api } from '../api/client';

// One EventSource per tab, shared by every useMessageStream() consumer.
// Tickets are single-use, so each (re)connect mints a fresh one.

export const INITIAL_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30000;
export const HIDDEN_CLOSE_MS = 5 * 60 * 1000;

const subscribers = new Set();
let es = null;
let reconnectTimer = null;
let hiddenTimer = null;
let backoff = INITIAL_BACKOFF_MS;
let generation = 0;
let pausedForVisibility = false;
let visibilityBound = false;

function dispatch(type, event) {
  let data = null;
  try {
    data = event?.data ? JSON.parse(event.data) : null;
  } catch {
    data = event?.data ?? null;
  }
  subscribers.forEach(fn => {
    try { fn(type, data); } catch { /* a consumer must not break the stream */ }
  });
}

function closeStream() {
  generation += 1;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (es) {
    es.close();
    es = null;
  }
}

function scheduleReconnect(gen) {
  if (gen !== generation || subscribers.size === 0) return;
  const delay = backoff;
  backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  reconnectTimer = setTimeout(() => {
    if (gen === generation) connect();
  }, delay);
}

async function connect() {
  if (typeof EventSource === 'undefined' || subscribers.size === 0 || es || pausedForVisibility) return;
  const gen = ++generation;
  let url = '';
  try {
    url = await api.getMessagesStreamUrl();
  } catch {
    /* retry below */
  }
  if (gen !== generation || subscribers.size === 0) return;
  if (!url) {
    scheduleReconnect(gen);
    return;
  }
  const source = new EventSource(url);
  es = source;
  source.onopen = () => { backoff = INITIAL_BACKOFF_MS; };
  source.addEventListener('new_message', (e) => {
    backoff = INITIAL_BACKOFF_MS;
    dispatch('new_message', e);
  });
  source.onerror = () => {
    if (es !== source) return;
    source.close();
    es = null;
    scheduleReconnect(gen);
  };
}

function handleVisibility() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    clearTimeout(hiddenTimer);
    hiddenTimer = setTimeout(() => {
      pausedForVisibility = true;
      closeStream();
    }, HIDDEN_CLOSE_MS);
  } else {
    clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (pausedForVisibility) {
      pausedForVisibility = false;
      backoff = INITIAL_BACKOFF_MS;
      connect();
    }
  }
}

function bindVisibility() {
  if (visibilityBound || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleVisibility);
  visibilityBound = true;
}

function unbindVisibility() {
  if (!visibilityBound) return;
  document.removeEventListener('visibilitychange', handleVisibility);
  window.removeEventListener('focus', handleVisibility);
  clearTimeout(hiddenTimer);
  hiddenTimer = null;
  visibilityBound = false;
}

function subscribe(fn) {
  subscribers.add(fn);
  bindVisibility();
  connect();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      closeStream();
      unbindVisibility();
      pausedForVisibility = false;
      backoff = INITIAL_BACKOFF_MS;
    }
  };
}

/** Test helper: drop all shared state. */
export function __resetMessageStream() {
  subscribers.clear();
  closeStream();
  unbindVisibility();
  pausedForVisibility = false;
  backoff = INITIAL_BACKOFF_MS;
}

/**
 * Subscribe to the authenticated user's message stream.
 * @param {(type: string, data: any) => void} onEvent called for every stream event
 * @param {{ enabled?: boolean }} options pass `enabled: false` when logged out
 */
export function useMessageStream(onEvent, { enabled = true } = {}) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribe((type, data) => handlerRef.current?.(type, data));
  }, [enabled]);
}

export default useMessageStream;
