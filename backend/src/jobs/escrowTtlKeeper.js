'use strict';

/**
 * Escrow TTL keeper (CT-08).
 *
 * Soroban persistent entries (Escrow(order_id), Token(order_id)) are archived
 * once their TTL lapses. Escrows can legitimately outlive the default TTL
 * (~5.8-11.6 days), so this keeper periodically bumps active escrows whose
 * remaining TTL is under 3 days. The remaining TTL is read from RPC
 * `getLedgerEntries` -> `liveUntilLedgerSeq`.
 *
 * The on-chain `bump(order_id)` is callable by anyone and only costs the
 * caller's fees, so the backend can safely keep entries alive.
 */

const LEDGERS_PER_DAY = 17_280; // ~5 s per ledger
const BUMP_THRESHOLD_LEDGERS = 3 * LEDGERS_PER_DAY;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

/**
 * Build the ledger key for an escrow's persistent entries.
 * Mirrors the contract's `DataKey::Escrow(order_id)` / `DataKey::Token(order_id)`.
 */
function escrowLedgerKeys(contractId, orderId) {
  // The exact XDR encoding is produced by the Soroban SDK; callers may inject
  // a `buildLedgerKeys` helper. Fall back to a descriptive key list.
  return [
    { contractId, key: `Escrow(${orderId})` },
    { contractId, key: `Token(${orderId})` },
  ];
}

/**
 * Determine whether an entry needs a bump based on its `liveUntilLedgerSeq`.
 */
function needsBump(liveUntilLedgerSeq, currentLedgerSeq) {
  if (liveUntilLedgerSeq == null) return true;
  return liveUntilLedgerSeq - currentLedgerSeq < BUMP_THRESHOLD_LEDGERS;
}

/**
 * Run one keeper pass: list active escrows, read their TTLs, and bump the ones
 * that are close to expiry.
 *
 * @param {object} deps
 * @param {() => Promise<Array<{orderId: string}>>} deps.listActiveEscrows
 * @param {(keys: Array<object>) => Promise<Array<{liveUntilLedgerSeq?: number}>>} deps.getLedgerEntries
 * @param {() => Promise<number>} deps.getLatestLedger
 * @param {(orderId: string) => Promise<void>} deps.bumpEscrow
 * @param {string} deps.contractId
 * @param {(contractId: string, orderId: string) => Array<object>} [deps.buildLedgerKeys]
 * @param {{info: Function, warn: Function, error: Function}} [deps.logger]
 */
async function runKeeperPass(deps) {
  const {
    listActiveEscrows,
    getLedgerEntries,
    getLatestLedger,
    bumpEscrow,
    contractId,
    buildLedgerKeys = escrowLedgerKeys,
    logger = console,
  } = deps;

  const escrows = await listActiveEscrows();
  if (!escrows || escrows.length === 0) return { checked: 0, bumped: 0 };

  const currentLedgerSeq = await getLatestLedger();
  let bumped = 0;

  for (const { orderId } of escrows) {
    try {
      const keys = buildLedgerKeys(contractId, orderId);
      const entries = await getLedgerEntries(keys);

      // An escrow needs a bump if any of its entries is missing or close to
      // expiry. Missing entries may already be archived and require a restore.
      const stale = entries.length < keys.length ||
        entries.some((entry) => needsBump(entry.liveUntilLedgerSeq, currentLedgerSeq));

      if (!stale) continue;

      await bumpEscrow(orderId);
      bumped += 1;
      logger.info(`[escrowTtlKeeper] bumped escrow ${orderId}`);
    } catch (err) {
      logger.error(`[escrowTtlKeeper] failed to bump escrow ${orderId}: ${err && err.message ? err.message : err}`);
    }
  }

  return { checked: escrows.length, bumped };
}

/**
 * Start the keeper on a fixed interval. Returns a stop function.
 */
function startEscrowTtlKeeper(deps, intervalMs = DEFAULT_INTERVAL_MS) {
  const logger = deps.logger || console;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runKeeperPass(deps);
      logger.info(`[escrowTtlKeeper] pass complete: checked=${result.checked} bumped=${result.bumped}`);
    } catch (err) {
      logger.error(`[escrowTtlKeeper] pass failed: ${err && err.message ? err.message : err}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  // Kick off an initial pass without blocking startup.
  tick();

  return () => clearInterval(timer);
}

module.exports = {
  LEDGERS_PER_DAY,
  BUMP_THRESHOLD_LEDGERS,
  DEFAULT_INTERVAL_MS,
  escrowLedgerKeys,
  needsBump,
  runKeeperPass,
  startEscrowTtlKeeper,
};
