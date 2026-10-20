'use strict';

const { Horizon, SorobanRpc } = require('@stellar/stellar-sdk');
const db = require('./db');
const logger = require('./logger');

const CONTRACT_IDS = (process.env.CONTRACT_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const POLL_INTERVAL_MS = Number(process.env.CONTRACT_MONITOR_INTERVAL_MS || 30000);

// Soroban contract events are emitted as topics; the upgrade proposal event
// uses the symbol topic "upgrade_proposed" (see contracts/*/src/lib.rs).
const UPGRADE_PROPOSED_TOPIC = 'upgrade_proposed';

function getRpcServer() {
  const url = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  return new SorobanRpc.Server(url, { allowHttp: url.startsWith('http://') });
}

async function recordAlert(contractId, kind, payload) {
  await db.query(
    `INSERT INTO contract_alerts (contract_id, kind, payload, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [contractId, kind, JSON.stringify(payload)]
  );
}

function decodeUpgradeProposal(event) {
  // Event value carries (wasm_hash, eta). We keep the raw value as payload so
  // operators can inspect it even if the encoding changes.
  return {
    ledger: event.ledger,
    txHash: event.txHash,
    topics: event.topic,
    value: event.value,
  };
}

async function pollContract(server, contractId, cursor) {
  const response = await server.getEvents({
    startLedger: cursor,
    filters: [
      {
        type: 'contract',
        contractIds: [contractId],
      },
    ],
    limit: 100,
  });

  let latestLedger = cursor;
  for (const event of response.events || []) {
    latestLedger = Math.max(latestLedger, event.ledger);
    const topics = event.topic || [];
    const isUpgradeProposal = topics.some((topic) => {
      try {
        return topic.sym && topic.sym().toString() === UPGRADE_PROPOSED_TOPIC;
      } catch (_err) {
        return false;
      }
    });

    if (isUpgradeProposal) {
      await recordAlert(contractId, 'upgrade_proposed', decodeUpgradeProposal(event));
      logger.warn({ contractId, ledger: event.ledger }, 'Contract upgrade proposed');
    }
  }

  return latestLedger;
}

async function runOnce() {
  const server = getRpcServer();
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - 100);

  for (const contractId of CONTRACT_IDS) {
    try {
      await pollContract(server, contractId, startLedger);
    } catch (err) {
      logger.error({ err, contractId }, 'Failed to poll contract events');
    }
  }
}

function start() {
  if (CONTRACT_IDS.length === 0) {
    logger.info('contractMonitor: no CONTRACT_IDS configured, skipping');
    return null;
  }

  runOnce().catch((err) => logger.error({ err }, 'contractMonitor initial poll failed'));
  const timer = setInterval(() => {
    runOnce().catch((err) => logger.error({ err }, 'contractMonitor poll failed'));
  }, POLL_INTERVAL_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { start, runOnce, UPGRADE_PROPOSED_TOPIC };
