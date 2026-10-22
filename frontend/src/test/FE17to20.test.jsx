import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from './a11y';

vi.mock('../api/client', () => ({
  api: {
    getOrderHistory: vi.fn(),
    getOrderCarbon: vi.fn(),
    getRewards: vi.fn(),
  },
}));
import { api } from '../api/client';
import OrderStatusTimeline, { stepTimestamps } from '../components/orders/OrderStatusTimeline';
import CarbonOffsetBadge from '../components/CarbonOffsetBadge';
import RewardTokenCard from '../components/wallet/RewardTokenCard';
import StarRating from '../components/StarRating';
import { announcementFor, ENDED_MESSAGE } from '../components/FlashSaleCountdown';

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('FE-17 order status timeline (#1501)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps history rows to first-entry timestamps', () => {
    const t = stepTimestamps([{ to_status: 'paid', created_at: 'a' }, { to_status: 'paid', created_at: 'b' }], 'c');
    expect(t).toEqual({ pending: 'c', paid: 'a' });
  });

  it('renders the stepper, escrow state and has no axe violations', async () => {
    api.getOrderHistory.mockResolvedValue({ data: {
      history: [{ to_status: 'paid', created_at: '2026-01-01T10:00:00Z' }],
      escrow: { state: 'held', auto_release_at: '2026-01-15T00:00:00Z' },
    } });
    const { container } = render(<OrderStatusTimeline order={{ id: 7, status: 'paid', created_at: '2026-01-01T09:00:00Z' }} />);
    await flush();
    expect(screen.getByRole('list', { name: /Order #7 progress/ })).toBeTruthy();
    expect(container.querySelector('[aria-current="step"]').textContent).toMatch(/paid/);
    expect(screen.getByTestId('order-escrow-7').textContent).toMatch(/funds held/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the failure reason and a Retry action', async () => {
    api.getOrderHistory.mockResolvedValue({ data: { history: [], failure_reason: 'coupon_exhausted' } });
    const onRetry = vi.fn();
    render(<OrderStatusTimeline order={{ id: 3, status: 'failed' }} onRetry={onRetry} />);
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/coupon reached its usage limit/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('FE-18 accessibility (#1502)', () => {
  it('StarRating is a radio group with arrow-key support', () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);
    const group = screen.getByRole('radiogroup');
    expect(group).toBeTruthy();
    const four = screen.getByRole('radio', { name: '4 out of 5 stars' });
    const three = screen.getByRole('radio', { name: '3 out of 5 stars' });
    expect(three.getAttribute('aria-checked')).toBe('true');
    expect(three.tabIndex).toBe(0);
    expect(four.tabIndex).toBe(-1);
    fireEvent.keyDown(three, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('read-only StarRating exposes a text alternative', () => {
    render(<StarRating value={4} />);
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeTruthy();
  });

  it('FlashSaleCountdown only announces at 1 h / 10 min / 1 min / ended', () => {
    expect(announcementFor(3601, 3600)).toMatch(/1 hour/);
    expect(announcementFor(601, 600)).toMatch(/10 minutes/);
    expect(announcementFor(61, 60)).toMatch(/1 minute/);
    expect(announcementFor(1, 0)).toBe(ENDED_MESSAGE);
    expect(announcementFor(500, 499)).toBeNull();
    expect(announcementFor(59, 58)).toBeNull();
  });
});

describe('FE-19 carbon offset badge (#1503)', () => {
  it('shows the verified offset with a tooltip linking to the contract', async () => {
    api.getOrderCarbon.mockResolvedValue({ data: { kg_co2: 12, contractId: 'CABC' } });
    const { container } = render(<CarbonOffsetBadge orderId={5} />);
    await flush();
    expect(screen.getByTestId('carbon-offset-badge').textContent).toMatch(/12 kg CO₂ offset \(verified\)/);
    expect(screen.getByRole('tooltip', { hidden: true }).querySelector('a').href).toMatch(/stellar\.expert.*contract\/CABC/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders nothing for voided (missing) offsets', async () => {
    api.getOrderCarbon.mockRejectedValue(new Error('not found'));
    const { container } = render(<CarbonOffsetBadge orderId={6} />);
    await flush();
    expect(container.innerHTML).toBe('');
  });
});

describe('FE-20 reward token card (#1504)', () => {
  it('shows total / vested / unvested balances and history', async () => {
    api.getRewards.mockResolvedValue({ data: {
      configured: true, symbol: 'FRT', decimals: 0, balance: 30, vested: 20, unvested: 10,
      nextVestingAt: '2026-11-01T00:00:00Z',
      history: [{ type: 'earned', order_id: 1, amount: 10, tx_hash: 'abc', created_at: '2026-10-01' }],
    } });
    const { container } = render(<MemoryRouter><RewardTokenCard /></MemoryRouter>);
    await flush();
    const card = screen.getByTestId('reward-token-card');
    expect(card.textContent).toMatch(/30 FRT/);
    expect(card.textContent).toMatch(/20 FRT/);
    expect(card.textContent).toMatch(/10 FRT/);
    expect(card.textContent).toMatch(/Next vesting/);
    expect(screen.getByRole('link', { name: 'View tx' }).href).toMatch(/tx\/abc/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
