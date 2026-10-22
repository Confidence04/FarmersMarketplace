import { describe, it, expect } from 'vitest';
import { computeDisputeSplit, xlmToStroops } from '../utils/disputeSplit';

describe('computeDisputeSplit', () => {
  it('converts XLM to integer stroops', () => {
    expect(xlmToStroops(1.5)).toBe(15_000_000n);
  });

  it('refunds the buyer in full at 10000 bps', () => {
    const r = computeDisputeSplit({ amount: 10, buyerBps: 10000, feeBps: 250 });
    expect(r.buyerRefund).toBe(10);
    expect(r.farmerGross).toBe(0);
    expect(r.farmerNet).toBe(0);
  });

  it('deducts platform fee then cooperative royalty from the farmer share', () => {
    const r = computeDisputeSplit({ amount: 100, buyerBps: 5000, feeBps: 250, royaltyBps: 1000 });
    expect(r.buyerRefund).toBe(50);
    expect(r.farmerGross).toBe(50);
    expect(r.platformFee).toBe(1.25);
    expect(r.royalty).toBe(4.875);
    expect(r.farmerNet).toBe(43.875);
  });

  it('floors the buyer amount in stroops like the contract', () => {
    // 1 stroop × 3333 / 10000 floors to 0 for the buyer; the farmer keeps the stroop.
    const r = computeDisputeSplit({ amount: 0.0000001, buyerBps: 3333 });
    expect(r.buyerRefund).toBe(0);
    expect(r.farmerGross).toBeCloseTo(0.0000001, 10);
  });

  it('clamps out-of-range bps', () => {
    expect(computeDisputeSplit({ amount: 1, buyerBps: 20000 }).buyerBps).toBe(10000);
    expect(computeDisputeSplit({ amount: 1, buyerBps: -5 }).buyerBps).toBe(0);
  });
});
