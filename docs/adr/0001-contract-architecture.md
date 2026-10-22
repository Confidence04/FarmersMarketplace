# ADR 0001: Contract Architecture

## Status

Accepted

## Context

The protocol is split across multiple Soroban contract crates (`contract/` and `contracts/*`). Historically each crate pinned its own `soroban-sdk` version (`21.0.0` / `=21.0.0` in `contract/`, `=21.7.7` in one crate, `=22.0.0` in `contracts/*`). Mixing SDK generations prevented sharing a common `test-utils` crate, complicated CI caching, and left older crates without host fixes.

Because a shared test-utils crate was not possible, small pure helpers such as `compute_fee` were copied into each contract.

## Decision

1. **Single SDK version.** All contract crates pin the same exact `soroban-sdk` version using `=` (currently the latest stable 22.x line, at least two weeks old).
2. **Workspace pinning.** `contract/` and `contracts/` pin `soroban-sdk` through `[workspace.dependencies]` so the version is declared once per workspace and cannot drift between crates.
3. **Shared `fm-math` crate.** Pure math helpers, starting with `compute_fee`, live in a shared `fm-math` crate that every contract depends on. The three duplicated copies of `compute_fee` are removed in favour of this crate.
4. **WASM size tracking.** WASM sizes are recorded before and after SDK/refactor changes using `wasm-profile.sh` so regressions are visible in review.

## Consequences

- A shared `test-utils` crate is now possible because all crates agree on the SDK generation.
- CI caching is simpler and host fixes propagate to every contract at once.
- `compute_fee` has a single source of truth, reducing the risk of divergent fee logic.
- Upgrading the SDK is a single coordinated change across both workspaces.
