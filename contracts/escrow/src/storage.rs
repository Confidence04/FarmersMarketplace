//! Storage helpers for the escrow contract.
//!
//! All persistent state lives under typed keys so that reads and writes stay
//! explicit and collision-free. Instance storage is reserved for small,
//! frequently-read configuration values (admin, pause flag, token address).

use soroban_sdk::{contracttype, Address, Env};

use crate::errors::EscrowError;

/// Storage keys used by the escrow contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Address of the contract administrator.
    Admin,
    /// Whether the contract is currently paused (circuit breaker).
    Paused,
    /// Address of the escrowed token.
    Token,
    /// Per-escrow record, keyed by escrow id.
    Escrow(u64),
    /// Monotonic counter for the next escrow id.
    NextId,
}

/// Returns the stored admin address, if any.
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

/// Persists the admin address in instance storage.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

/// Returns `true` when the contract is paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Persists the pause flag in instance storage.
pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}

/// Returns an error if the contract is currently paused.
///
/// Used by state-mutating entry points that must be halted by the circuit
/// breaker. Refund paths intentionally do not call this so buyers can always
/// exit while paused.
pub fn require_not_paused(env: &Env) -> Result<(), EscrowError> {
    if is_paused(env) {
        return Err(EscrowError::Paused);
    }
    Ok(())
}
