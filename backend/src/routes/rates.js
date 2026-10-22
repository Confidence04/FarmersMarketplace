const router = require('express').Router();
const db = require('../db/schema');
const { err } = require('../middleware/error');
const logger = require('../logger');

let cache = { rate: null, fetchedAt: 0 };
const CACHE_TTL = 60 * 1000; // 60 seconds

// GET /api/rates/xlm-usd
router.get('/xlm-usd', async (req, res) => {
  const now = Date.now();

  if (cache.rate && now - cache.fetchedAt < CACHE_TTL) {
    return res.json({ success: true, rate: cache.rate, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true });
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) throw new Error('CoinGecko request failed');
    const data = await response.json();
    const rate = data?.stellar?.usd;
    if (!rate) throw new Error('Rate not found in response');

    cache = { rate, fetchedAt: now };

    // BE-37: Persist rate to database for order fiat snapshots
    try {
      await db.query(
        'INSERT INTO exchange_rates (currency, rate, fetchedAt) VALUES ($1, $2, $3)',
        ['USD', rate, new Date(now).toISOString()]
      );
    } catch (dbErr) {
      logger.warn('[rates] Failed to persist rate to database', { error: dbErr.message });
    }

    res.json({ success: true, rate, fetchedAt: new Date(now).toISOString(), cached: false });
  } catch (e) {
    // Return stale cache if available rather than failing
    if (cache.rate) return res.json({ success: true, rate: cache.rate, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true, stale: true });
    err(res, 502, 'Unable to fetch exchange rate', 'rate_fetch_error');
  }
});

module.exports = router;
