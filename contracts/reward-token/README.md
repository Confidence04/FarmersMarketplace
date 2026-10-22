# reward-token

SEP-41 compliant reward token with vesting and a transfer fee.

## SEP-41 interface

The contract exposes the standard SEP-41 token interface exactly as wallets and
explorers (Freighter, stellar.expert) expect it:

| Function | Signature |
| --- | --- |
| `allowance` | `allowance(from: Address, spender: Address) -> i128` |
| `approve` | `approve(from: Address, spender: Address, amount: i128, expiration_ledger: u32)` |
| `balance` | `balance(id: Address) -> i128` |
| `transfer` | `transfer(from: Address, to: Address, amount: i128)` |
| `transfer_from` | `transfer_from(spender: Address, from: Address, to: Address, amount: i128)` |
| `burn` | `burn(from: Address, amount: i128)` |
| `burn_from` | `burn_from(spender: Address, from: Address, amount: i128)` |
| `decimals` | `decimals() -> u32` |
| `name` | `name() -> String` |
| `symbol` | `symbol() -> String` |

### Events

Events follow the SEP-41 topic/data layouts exactly:

- `["transfer", from, to]` with data `amount`
- `["approve", from, spender]` with data `(amount, expiration_ledger)`
- `["mint", admin, to]` with data `amount`
- `["burn", from]` with data `amount`

### `approve` expiration

Per the SEP-41 spec, `approve` with an `expiration_ledger` lower than the current
ledger and an `amount` greater than zero is rejected. Setting `amount` to `0`
revokes an allowance regardless of `expiration_ledger`.

## Vesting and the transfer fee

`balance()` returns the full token balance, **including unvested tokens**. This is
intentional: SEP-41 has no notion of vesting, so wallets and explorers will display
the total balance. Unvested tokens are not spendable — `transfer` and
`transfer_from` enforce vested-only amounts and reject any attempt to move tokens
that have not yet vested.

A transfer fee is applied on `transfer`/`transfer_from`. The fee is deducted from
the transferred amount and does not affect the SEP-41 function signatures or event
layouts; the emitted `transfer` event reports the amount actually credited to the
recipient.

## Compliance test

`contracts/reward-token/src/test.rs` includes a compliance test that drives the
contract through `soroban_sdk::token::TokenClient`, exercising every SEP-41
function (`allowance`, `approve`, `balance`, `transfer`, `transfer_from`, `burn`,
`burn_from`, `decimals`, `name`, `symbol`) and asserting the emitted event topics
and data match the SEP-41 layouts above.
