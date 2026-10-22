// Mirrors the escrow contract's resolve_dispute() arithmetic (contracts/escrow
// split_payout + compute_fee). All maths is done in integer stroops with floor
// division so the preview matches what the contract will actually pay out.
const STROOPS_PER_XLM = 10_000_000n;
const BPS_DENOMINATOR = 10_000n;

export function xlmToStroops(xlm) {
  const [whole, frac = ''] = String(Number(xlm || 0).toFixed(7)).split('.');
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(frac.padEnd(7, '0'));
}

export function stroopsToXlm(stroops) {
  return Number(stroops) / Number(STROOPS_PER_XLM);
}

function bpsOf(amount, bps) {
  return (amount * BigInt(bps)) / BPS_DENOMINATOR;
}

/**
 * @param {object} p
 * @param {number} p.amount        escrowed amount in XLM
 * @param {number} p.buyerBps      0–10000
 * @param {number} [p.feeBps]      platform fee in bps
 * @param {number} [p.royaltyBps]  cooperative royalty in bps (0 when no cooperative)
 * @returns amounts in XLM: buyerRefund, farmerGross, platformFee, royalty, farmerNet
 */
export function computeDisputeSplit({ amount, buyerBps, feeBps = 0, royaltyBps = 0 }) {
  const bps = Math.min(10000, Math.max(0, Math.round(Number(buyerBps) || 0)));
  const total = xlmToStroops(amount);
  const buyer = bpsOf(total, bps);
  const farmerGross = total - buyer;
  const fee = bpsOf(farmerGross, Math.round(feeBps));
  const afterFee = farmerGross - fee;
  const royalty = bpsOf(afterFee, Math.round(royaltyBps));
  return {
    buyerBps: bps,
    buyerRefund: stroopsToXlm(buyer),
    farmerGross: stroopsToXlm(farmerGross),
    platformFee: stroopsToXlm(fee),
    royalty: stroopsToXlm(royalty),
    farmerNet: stroopsToXlm(afterFee - royalty),
  };
}
