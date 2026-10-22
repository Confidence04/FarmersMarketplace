'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => (req, res, next) => {
  req.user = JSON.parse(req.headers['x-test-user'] || '{"id":999,"role":"buyer"}');
  next();
});
jest.mock('../db/schema', () => ({ query: jest.fn() }));

const db = require('../db/schema');
const receiptRouter = require('../routes/orderReceipt');
const authRouter = require('../routes/auth');
const { redactLogValue, REDACTED } = require('../utils/logRedaction');

function app() {
  const server = express();
  server.use('/api/v1/orders', receiptRouter);
  return server;
}

function authApp() {
  const server = express();
  server.use('/api/v1/auth', authRouter);
  return server;
}

describe('order receipts (#1480)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a PDF receipt to an authorized buyer with transaction explorer data', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      id: 12,
      buyer_id: 7,
      farmer_id: 8,
      quantity: 2,
      total_price: '14.5',
      status: 'paid',
      stellar_tx_hash: 'abc123',
      product_name: 'Maize',
      unit: 'kg',
      buyer_name: 'Buyer',
      buyer_email: 'buyer@example.test',
      farmer_name: 'Farmer',
      farmer_email: 'farmer@example.test',
    }] });

    const response = await request(app())
      .get('/api/v1/orders/12/receipt.pdf')
      .set('x-test-user', JSON.stringify({ id: 7, role: 'buyer' }));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain('order-12-receipt.pdf');
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM orders'), ['12']);
  });

  it('rejects an unrelated authenticated user before generating a receipt', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 12, buyer_id: 7, farmer_id: 8 }] });
    const response = await request(app())
      .get('/api/v1/orders/12/receipt.pdf')
      .set('x-test-user', JSON.stringify({ id: 99, role: 'buyer' }));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('forbidden');
  });
});

describe('secret-safe logging (#1465)', () => {
  it('redacts credential-shaped keys and sensitive values nested in errors', () => {
    const result = redactLogValue({
      password: 'hunter2',
      nested: { mnemonic: 'one two three', error: new Error('transaction envelope: SECRET') },
      safe: 'visible',
    });

    expect(result.password).toBe(REDACTED);
    expect(result.nested.mnemonic).toBe(REDACTED);
    expect(result.nested.error.message).toContain(REDACTED);
    expect(result.safe).toBe('visible');
  });
});

describe('account privacy controls (#1479)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exports account data without password, mnemonic, or private-key fields', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users')) {
        return { rows: [{ id: 7, name: 'Buyer', email: 'buyer@example.test', role: 'buyer', stellar_public_key: 'GPUBLIC' }] };
      }
      return { rows: [] };
    });

    const response = await request(authApp())
      .get('/api/v1/auth/export')
      .set('x-test-user', JSON.stringify({ id: 7, role: 'buyer' }));
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('farmers-marketplace-data-7.json');
    expect(response.body.profile.stellar_public_key).toBe('GPUBLIC');
    expect(response.body.profile.password).toBeUndefined();
    expect(response.body.profile.stellar_mnemonic).toBeUndefined();
  });

  it('accepts a deletion request by deactivating the account and revoking sessions', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValue({ rows: [] });

    const response = await request(authApp())
      .post('/api/v1/auth/account/deletion-request')
      .set('x-test-user', JSON.stringify({ id: 7, role: 'buyer' }));
    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET active = 0'),
      [7]
    );
    expect(db.query).toHaveBeenCalledWith('DELETE FROM refresh_tokens WHERE user_id = $1', [7]);
  });
});
