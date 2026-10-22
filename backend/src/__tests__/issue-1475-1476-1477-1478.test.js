'use strict';
const fs = require('fs');
const path = require('path');

jest.mock('../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 99, role: 'buyer' };
  next();
});
jest.mock('../middleware/requireEmailVerified', () => (_req, _res, next) => next());
jest.mock('../db/schema', () => ({ isPostgres: false, query: jest.fn() }));
jest.mock('../logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../middleware/error', () => ({ err: jest.fn() }));

describe('issue batch security and payment invariants', () => {
  it('enforces the greater of configured, one-percent, and 0.1 XLM increments', () => {
    const { validateBidRules } = require('../routes/auctions');
    const auction = {
      status: 'active',
      ends_at: new Date(Date.now() + 60_000),
      start_price: 10,
      current_bid: 10,
      min_increment: 0,
      highest_bidder_id: 1,
      farmer_id: 2,
    };
    expect(validateBidRules(auction, 3, 10.05).code).toBe('bid_below_increment');
    expect(validateBidRules(auction, 3, 10.1).ok).toBe(true);
    expect(validateBidRules({ ...auction, current_bid: 100, min_increment: 2 }, 3, 101).code).toBe('bid_below_increment');
  });

  it('keeps the four production fixes wired to their durable safeguards', () => {
    const root = path.resolve(__dirname, '../../');
    const auth = fs.readFileSync(path.join(root, 'src/routes/auth.js'), 'utf8');
    const subscription = fs.readFileSync(path.join(root, 'src/jobs/processSubscriptions.js'), 'utf8');
    const cron = fs.readFileSync(path.join(root, 'src/jobs/auctionCron.js'), 'utf8');
    expect(auth).toContain('replaced_by');
    expect(auth).toContain('token_reuse_detected');
    expect(auth).toContain("router.post('/2fa/login'");
    expect(subscription).toContain('getSpendableBalance');
    expect(subscription).toContain('retry_after');
    expect(cron).toContain('COALESCE(winner_notified, 0) = 0');
  });
});
