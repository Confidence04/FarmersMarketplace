# Contract Events Specification

**Event format version:** `2`

This document is the canonical reference for every event emitted by the
Soroban contracts in this repository. It exists so that off-chain consumers
(the backend `contractMonitor.js` and `creatorEarningsMonitor.js`) can decode
events deterministically without per-contract special-casing.

## Conventions

All events follow a single, uniform shape:

- **Topics** are always `Symbol`s, in the order
  `(contract_name, event_name, primary_id?)`.
  - `contract_name` — the emitting contract, e.g. `escrow`, `carbon`, `creator_earnings`.
  - `event_name` — the action, e.g. `deposit`, `claim`, `migrated`.
  - `primary_id` — optional identifier (e.g. `order_id`, `offset_id`).
    Omitted when the event has no natural primary key.
- **Data** is a single value (struct, tuple, or scalar) carrying the payload.
- Every state-changing function emits **exactly one** event.

> **Version bump:** the previous format mixed `symbol_short!` tuples with
> string tuples such as `("admin", "proposed")` and `("creator_earnings", "claim")`.
> That format is **version 1** and is no longer emitted. Consumers must treat
> any event whose first topic is a `String` as legacy and migrate to the
> `Symbol`-based topics described here (**version 2**).

## Escrow contract

| Function | Topics | Data |
| --- | --- | --- |
| `deposit` | `(escrow, deposit, order_id)` | `(buyer, amount)` |
| `release` | `(escrow, release, order_id)` | `(seller, amount)` |
| `refund` | `(escrow, refund, order_id)` | `(buyer, amount)` |
| `set_min_deposit` | `(escrow, min_deposit)` | `amount` |
| `set_auto_release_days` | `(escrow, auto_release)` | `days` |
| `set_coop` | `(escrow, set_coop)` | `coop_address` |
| `set_reward_token` | `(escrow, reward_token)` | `token_address` |
| `propose_admin` | `(escrow, admin_proposed)` | `new_admin` |
| `accept_admin` | `(escrow, admin_accepted)` | `new_admin` |
| `migrate` | `(escrow, migrated, order_id)` | `(from_version, to_version)` |

## Carbon-offset contract

| Function | Topics | Data |
| --- | --- | --- |
| `offset` | `(carbon, offset, offset_id)` | `(owner, amount)` |
| `retire` | `(carbon, retire, offset_id)` | `(owner, amount)` |
| `set_verifier` | `(carbon, set_verifier)` | `verifier_address` |

## Creator-earnings contract

| Function | Topics | Data |
| --- | --- | --- |
| `claim` | `(creator_earnings, claim, creator)` | `amount` |
| `accrue` | `(creator_earnings, accrue, creator)` | `amount` |

## Backend monitor notes

- `contractMonitor.js` and `creatorEarningsMonitor.js` should key on the
  `Symbol` topics above; the per-contract special-casing for string tuples can
  be removed once the version-2 contracts are deployed.
- Missed events previously caused DB/chain drift (BE-19). With a single
  uniform topic shape, monitors can subscribe generically and only branch on
  `event_name`.
