'use strict';

const db = require('../db/schema');
const { sendPayment } = require('../utils/stellar');
const { decryptUserSecretKey } = require('../utils/crypto');
const mailer = require('../utils/mailer');
const logger = require('../logger');

async function closeExpiredAuctions() {
  const nowExpression = db.isPostgres ? 'NOW()' : "datetime('now')";
  const { rows: expired } = await db.query(
    `SELECT a.*, u.stellar_public_key AS farmer_wallet, u.email AS farmer_email, u.name AS farmer_name
     FROM auctions a
     JOIN users u ON a.farmer_id = u.id
     WHERE a.status = 'active' AND a.ends_at <= ${nowExpression}`
  );

  for (const auction of expired) {
    const { rows: winnerRows } = await db.query(
      `SELECT b.buyer_id, b.amount,
              u.stellar_public_key AS buyer_wallet,
              u.stellar_secret_key AS buyer_secret,
              u.email AS buyer_email, u.name AS buyer_name
       FROM bids b
       JOIN users u ON b.buyer_id = u.id
       WHERE b.auction_id = $1
       ORDER BY b.amount DESC, b.created_at ASC
       LIMIT 1`,
      [auction.id]
    );
    const winner = winnerRows[0];

    if (!winner) {
      await db.query("UPDATE auctions SET status = 'cancelled' WHERE id = $1", [auction.id]);

      logger.info(`[auctionCron] Auction #${auction.id} cancelled (no bids)`);
      continue;
    }

    const reserveMet =
      auction.reserve_price === null ||
      auction.reserve_price === undefined ||
      winner.amount >= auction.reserve_price;

    if (!reserveMet) {
      await db.query(
        `UPDATE auctions
         SET status = 'ended_no_sale', winner_notified = true
         WHERE id = $1`,
        [auction.id]
      );

      const { rows: bidders } = await db.query(
        `SELECT DISTINCT u.email, u.name
         FROM bids b
         JOIN users u ON b.buyer_id = u.id
         WHERE b.auction_id = $1`,
        [auction.id]
      );

      for (const bidder of bidders) {
        await mailer
          .sendAuctionNoSaleEmail({ bidder, auction })
          .catch(() => {});
      }

      logger.info(
        `[auctionCron] Auction #${auction.id} ended_no_sale (reserve not met)`
      );
      continue;
    }

    try {
      // Claim the auction before touching Stellar. FOR UPDATE in the bid path
      // prevents bid races; this conditional claim prevents settlement races
      // between concurrent cron workers.
      if (db.isPostgres) {
        const claim = await db.query(
          `UPDATE auctions SET winner_notified = 2
           WHERE id = $1 AND status = 'active' AND COALESCE(winner_notified, 0) = 0
           RETURNING id`, [auction.id]
        );
        if (!claim.rows.length) continue;
      }
      const txHash = await sendPayment({
        senderSecret: await decryptUserSecretKey(winner.buyer_secret),
        receiverPublicKey: auction.farmer_wallet,
        amount: winner.amount,
        memo: `Auction#${auction.id}`,
      });

      if (db.isPostgres) {
        await db.query(
          `UPDATE auctions
           SET status = 'ended',
               winner_id = $1,
               winner_notified = 1,
               closed_at = NOW()
           WHERE id = $2 AND (winner_notified = 2 OR winner_notified = 0)`,
          [winner.buyer_id, auction.id]
        );

        await db.query(
          `INSERT INTO orders
           (buyer_id, product_id, quantity, total_price, status, stellar_tx_hash)
           VALUES ($1, $2, 1, $3, 'paid', $4)`,
          [winner.buyer_id, auction.product_id, winner.amount, txHash]
        );
      } else {
        db.prepare(
          `UPDATE auctions
           SET status = 'ended',
               winner_id = ?,
               winner_notified = 1,
               closed_at = datetime('now')
           WHERE id = ?`
        ).run(winner.buyer_id, auction.id);

        db.prepare(
          `INSERT INTO orders
           (buyer_id, product_id, quantity, total_price, status, stellar_tx_hash)
           VALUES (?, ?, 1, ?, 'paid', ?)`
        ).run(
          winner.buyer_id,
          auction.product_id,
          winner.amount,
          txHash
        );
      }
      await db.query(
        `UPDATE auctions
         SET status = 'ended',
             winner_id = $1,
             winner_notified = true,
             closed_at = ${nowExpression}
         WHERE id = $2`,
        [winner.buyer_id, auction.id]
      );

      await db.query(
        `INSERT INTO orders
         (buyer_id, product_id, quantity, total_price, status, stellar_tx_hash)
         VALUES ($1, $2, 1, $3, 'paid', $4)`,
        [winner.buyer_id, auction.product_id, winner.amount, txHash]
      );

      await mailer
        .sendAuctionWinnerEmail({ winner, auction, txHash })
        .catch(() => {});

      await mailer
        .sendAuctionSaleEmail({
          farmer: auction,
          winner,
          txHash,
        })
        .catch(() => {});

      logger.info(
        `[auctionCron] Auction #${auction.id} ended. Winner: ${winner.buyer_id} TX: ${txHash}`
      );
    } catch (e) {
      logger.error(
        `[auctionCron] Auction #${auction.id} payment failed: ${e.message}`
      );

      await db.query("UPDATE auctions SET status = 'cancelled' WHERE id = $1", [auction.id]);
    }
  }
}

function runAuctionJob() {
  closeExpiredAuctions().catch((error) => {
    logger.error('[auctionCron] Job error', {
      message: error.message,
    });
  });
}

function startAuctionJob() {
  setInterval(runAuctionJob, 60 * 1000);
  runAuctionJob();
}

module.exports = {
  closeExpiredAuctions,
  runAuctionJob,
  startAuctionJob,
};