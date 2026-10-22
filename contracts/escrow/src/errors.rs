use soroban_sdk::contracterror;

/// Typed errors returned by the escrow contract.
///
/// Codes are stable and must never be reused or renumbered (see CT-01).
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    /// Caller is not authorized to perform this action.
    Unauthorized = 1,
    /// The escrow has already been released.
    AlreadyReleased = 2,
    /// The escrow has already been refunded.
    AlreadyRefunded = 3,
    /// The requested escrow was not found.
    NotFound = 4,
    /// The provided amount is invalid.
    InvalidAmount = 5,
    /// The escrow has not yet reached its timeout.
    NotTimedOut = 6,
    /// The contract is paused by an admin (circuit breaker, CT-11).
    Paused = 7,
}
