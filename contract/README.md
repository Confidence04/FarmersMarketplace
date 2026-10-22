# Legacy Escrow Contract (Deprecated)

> **⚠️ DEPRECATED — DO NOT DEVELOP HERE.**
>
> This crate (`contract/`) is the **legacy** escrow contract. It is no longer
> actively developed and is retained only for historical reference. See
> [ADR 0002](../docs/adr/0002-legacy-contract-deprecation.md) for the decision
> record.
>
> The actively developed escrow contract lives in
> [`contracts/escrow/`](../contracts/escrow/). All new features, bug fixes, and
> security patches must target that crate. It uses typed errors and a newer
> `soroban-sdk` version, whereas this legacy crate still uses `panic!` strings
> for authorisation failures.

## Status

- **Deployed:** No. This crate is not deployed to any network and its contract
  address has been removed from configuration.
- **CI:** Removed from the build matrices; it is not built or tested in CI.
- **Maintenance:** Frozen. No further changes are accepted here.

## What this crate contained

For reference, the legacy crate implemented:

- Role management: `grant_role`, `revoke_role`
- Fee configuration: `set_fee_rate`
- Circuit breaking: `pause` / `unpause`
- Dispute handling: `open_dispute` / `resolve_dispute`
- Product hashing: `compute_product_hash`

Any of these behaviours still required by the product must be ported to
`contracts/escrow/` (see ADR 0002 for the migration plan using the existing
`migrate_preview` / `migrate` functions).

## Do not

- Do not fix bugs in this crate.
- Do not add features here.
- Do not point the backend at a contract ID built from this crate.
