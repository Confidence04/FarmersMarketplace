-- Reward token redemption at checkout (#1504)
ALTER TABLE orders ADD COLUMN reward_tokens_redeemed INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN reward_discount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN reward_redeem_tx_hash TEXT;
ALTER TABLE orders ADD COLUMN reward_mint_tx_hash TEXT;
