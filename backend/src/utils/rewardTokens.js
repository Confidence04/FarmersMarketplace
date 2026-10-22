/**
 * Reward token (contract/reward-token) read + redemption helpers (#1504).
 *
 * Token amounts are handled in the contract's raw integer units. Orders mint
 * `floor(totalPrice)` raw units (see routes/orders.js), and each raw unit is
 * worth `REWARD_TOKEN_XLM_VALUE` XLM when redeemed at checkout (default 0.01).
 */
const { simulateContractCall, invokeContract } = require('./stellar-contracts');

// Stellar closes a ledger roughly every 5 seconds.
const LEDGER_SECONDS = 5;

function contractId() {
  return process.env.REWARD_TOKEN_CONTRACT_ID || null;
}

function xlmValuePerToken() {
  const v = parseFloat(process.env.REWARD_TOKEN_XLM_VALUE);
  return Number.isFinite(v) && v > 0 ? v : 0.01;
}

function toNumber(value) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function read(method, args = []) {
  const sim = await simulateContractCall(contractId(), method, args);
  if (!sim.success) throw new Error(sim.error || `${method} simulation failed`);
  return sim.result;
}

/**
 * Largest number of raw tokens a buyer may redeem against an order total.
 * Capped by the vested balance and by `max_redemption_bps` of the order total.
 */
function maxRedeemableTokens({ vested, maxRedemptionBps, orderTotal, xlmPerToken = xlmValuePerToken() }) {
  if (!(vested > 0) || !(maxRedemptionBps > 0) || !(orderTotal > 0) || !(xlmPerToken > 0)) return 0;
  const capXlm = (orderTotal * maxRedemptionBps) / 10000;
  return Math.max(0, Math.min(Math.floor(vested), Math.floor(capXlm / xlmPerToken)));
}

/**
 * Reads balance, vested balance and token metadata for `publicKey`.
 * Returns `{ configured: false }` when no reward contract is configured.
 */
async function getRewardSummary(publicKey) {
  if (!contractId()) return { configured: false };
  const addr = [{ type: 'address', value: publicKey }];
  const [balance, vested, symbol, decimals, vestingPeriod, maxRedemptionBps] = await Promise.all([
    read('balance', addr),
    read('vested_balance', addr),
    read('symbol'),
    read('decimals'),
    read('vesting_period'),
    read('max_redemption_bps'),
  ]);
  const total = toNumber(balance);
  const vestedN = Math.min(total, toNumber(vested));
  return {
    configured: true,
    contractId: contractId(),
    symbol: String(symbol ?? ''),
    decimals: toNumber(decimals),
    balance: total,
    vested: vestedN,
    unvested: Math.max(0, total - vestedN),
    vestingPeriodLedgers: toNumber(vestingPeriod),
    vestingPeriodSeconds: toNumber(vestingPeriod) * LEDGER_SECONDS,
    maxRedemptionBps: toNumber(maxRedemptionBps),
    xlmPerToken: xlmValuePerToken(),
  };
}

/** Burns `amount` raw tokens from the buyer against `orderId`. */
async function redeemRewardTokens({ buyerSecret, buyerPublicKey, orderId, amount }) {
  if (!contractId()) throw new Error('REWARD_TOKEN_CONTRACT_ID is not configured');
  const { hash } = await invokeContract({
    contractId: contractId(),
    method: 'redeem',
    args: [
      { type: 'address', value: buyerPublicKey },
      { type: 'u64', value: Number(orderId) },
      { type: 'i128', value: BigInt(amount) },
    ],
    signerSecret: buyerSecret,
  });
  return hash;
}

/** Re-mints tokens redeemed against an order whose payment failed. */
async function reissueRedeemedTokens({ buyerPublicKey, orderId, amount }) {
  const adminSecret = process.env.REWARD_TOKEN_ADMIN_SECRET;
  if (!contractId() || !adminSecret) throw new Error('Reward token admin is not configured');
  const { hash } = await invokeContract({
    contractId: contractId(),
    method: 'reissue_redeemed',
    args: [
      { type: 'address', value: buyerPublicKey },
      { type: 'u64', value: Number(orderId) },
      { type: 'i128', value: BigInt(amount) },
    ],
    signerSecret: adminSecret,
  });
  return hash;
}

module.exports = {
  LEDGER_SECONDS,
  xlmValuePerToken,
  maxRedeemableTokens,
  getRewardSummary,
  redeemRewardTokens,
  reissueRedeemedTokens,
};
