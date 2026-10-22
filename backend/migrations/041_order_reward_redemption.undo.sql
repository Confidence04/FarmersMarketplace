ALTER TABLE orders DROP COLUMN IF EXISTS reward_mint_tx_hash;
ALTER TABLE orders DROP COLUMN IF EXISTS reward_redeem_tx_hash;
ALTER TABLE orders DROP COLUMN IF EXISTS reward_discount;
ALTER TABLE orders DROP COLUMN IF EXISTS reward_tokens_redeemed;
