/**
 * Reward token balance, vesting and history for the signed-in buyer (#1504).
 */
const router = require('express').Router();
const db = require('../db/schema');
const auth = require('../middleware/auth');
const { err } = require('../middleware/error');
const { getRewardSummary, maxRedeemableTokens } = require('../utils/rewardTokens');

const EARNING_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];

// GET /api/rewards?order_total=  — balances, next vesting date, redemption cap and history
router.get('/', auth, async (req, res) => {
  const { rows: users } = await db.query('SELECT stellar_public_key FROM users WHERE id = $1', [req.user.id]);
  const publicKey = users[0]?.stellar_public_key;
  if (!publicKey) return err(res, 404, 'No wallet found for this account', 'no_wallet');

  let summary;
  try {
    summary = await getRewardSummary(publicKey);
  } catch (e) {
    return err(res, 502, `Failed to read reward token contract: ${e.message}`, 'rpc_error');
  }
  if (!summary.configured) return res.json({ success: true, data: { configured: false } });

  const { rows: orders } = await db.query(
    `SELECT o.id, o.status, o.total_price, o.created_at, o.reward_tokens_redeemed,
            o.reward_redeem_tx_hash, o.reward_mint_tx_hash, p.name as product_name
     FROM orders o JOIN products p ON o.product_id = p.id
     WHERE o.buyer_id = $1
     ORDER BY o.created_at DESC
     LIMIT 200`,
    [req.user.id]
  );

  const history = [];
  for (const o of orders) {
    const earned = Math.floor(Number(o.total_price) || 0);
    if (EARNING_STATUSES.includes(o.status) && earned > 0) {
      history.push({ type: 'earned', order_id: o.id, product_name: o.product_name, amount: earned, tx_hash: o.reward_mint_tx_hash || null, created_at: o.created_at });
    }
    if (Number(o.reward_tokens_redeemed) > 0) {
      history.push({ type: 'redeemed', order_id: o.id, product_name: o.product_name, amount: Number(o.reward_tokens_redeemed), tx_hash: o.reward_redeem_tx_hash || null, created_at: o.created_at });
    }
  }

  // Each mint unlocks `vesting_period` ledgers later; the next unlock is the
  // oldest earning order whose vesting window has not elapsed yet.
  let nextVestingAt = null;
  if (summary.unvested > 0 && summary.vestingPeriodSeconds > 0) {
    const now = Date.now();
    const unlocks = history
      .filter((h) => h.type === 'earned')
      .map((h) => new Date(h.created_at).getTime() + summary.vestingPeriodSeconds * 1000)
      .filter((t) => Number.isFinite(t) && t > now);
    if (unlocks.length) nextVestingAt = new Date(Math.min(...unlocks)).toISOString();
  }

  const orderTotal = parseFloat(req.query.order_total);
  const maxRedeemable = Number.isFinite(orderTotal) && orderTotal > 0
    ? maxRedeemableTokens({ vested: summary.vested, maxRedemptionBps: summary.maxRedemptionBps, orderTotal, xlmPerToken: summary.xlmPerToken })
    : null;

  res.json({ success: true, data: { ...summary, nextVestingAt, maxRedeemable, history } });
});

module.exports = router;
