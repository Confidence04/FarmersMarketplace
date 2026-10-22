import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useMessageStream, __resetMessageStream, HIDDEN_CLOSE_MS } from '../hooks/useMessageStream';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: { getMessagesStreamUrl: vi.fn() },
}));

class MockEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    MockEventSource.instances.push(this);
  }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  removeEventListener() {}
  close() { this.closed = true; }
  emit(type, data) { (this.listeners[type] || []).forEach(cb => cb({ data: JSON.stringify(data) })); }
}
MockEventSource.instances = [];

function Consumer({ onEvent, enabled = true }) {
  useMessageStream(onEvent, { enabled });
  return null;
}

const open = () => MockEventSource.instances.filter(es => !es.closed);

describe('useMessageStream (FE-10)', () => {
  let original;
  let ticket = 0;

  beforeEach(() => {
    original = globalThis.EventSource;
    globalThis.EventSource = MockEventSource;
    MockEventSource.instances = [];
    __resetMessageStream();
    api.getMessagesStreamUrl.mockReset();
    api.getMessagesStreamUrl.mockImplementation(async () => `/api/v1/messages/events?ticket=t${++ticket}`);
  });

  afterEach(() => {
    __resetMessageStream();
    globalThis.EventSource = original;
    vi.useRealTimers();
  });

  it('opens a single /api/v1 ticket stream shared by multiple consumers', async () => {
    const a = vi.fn();
    const b = vi.fn();
    render(<><Consumer onEvent={a} /><Consumer onEvent={b} /></>);
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    expect(MockEventSource.instances[0].url).toMatch(/^\/api\/v1\/messages\/events\?ticket=/);
    act(() => MockEventSource.instances[0].emit('new_message', { id: 1 }));
    expect(a).toHaveBeenCalledWith('new_message', { id: 1 });
    expect(b).toHaveBeenCalledWith('new_message', { id: 1 });
  });

  it('reconnects with a fresh ticket using exponential backoff', async () => {
    vi.useFakeTimers();
    render(<Consumer onEvent={() => {}} />);
    await act(async () => {});
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => MockEventSource.instances[0].onerror());
    await act(async () => { vi.advanceTimersByTime(999); });
    expect(MockEventSource.instances).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => MockEventSource.instances[1].onerror());
    await act(async () => { vi.advanceTimersByTime(1999); });
    expect(MockEventSource.instances).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(MockEventSource.instances).toHaveLength(3);
    expect(MockEventSource.instances[2].url).not.toBe(MockEventSource.instances[1].url);
  });

  it('closes the stream when disabled (logged out)', async () => {
    const { rerender } = render(<Consumer onEvent={() => {}} />);
    await waitFor(() => expect(open()).toHaveLength(1));
    rerender(<Consumer onEvent={() => {}} enabled={false} />);
    expect(open()).toHaveLength(0);
  });

  it('closes after 5 min hidden and reopens when visible', async () => {
    vi.useFakeTimers();
    render(<Consumer onEvent={() => {}} />);
    await act(async () => {});
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { vi.advanceTimersByTime(HIDDEN_CLOSE_MS); });
    expect(open()).toHaveLength(0);

    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(open()).toHaveLength(1);
    visibility.mockRestore();
  });
});
