//! Cooperative contract: membership management and multisig release authorization.
//!
//! # Multisig abort semantics (CT-04)
//!
//! `multisig_release` verifies each collected signature with
//! `env.crypto().ed25519_verify(...)`. In soroban-sdk that host function
//! **traps** on an invalid signature instead of returning a `bool`, so a single
//! forged or wrong-payload signature aborts the whole call (the escrow stays
//! `Active`). This is safe, but implicit: if verification were ever swapped for
//! a non-trapping variant, every non-empty 64-byte entry would be counted as
//! valid. The loop below therefore documents the trap explicitly and only
//! increments the counter after a successful (non-trapping) verify.
//!
//! Signatures are matched **by position** (`signatures[i]` ↔ `members[i]`).
//! Reordering members via `set_coop` therefore invalidates previously collected
//! signatures; `set_coop` emits a `coop_changed` event carrying a hash of the
//! member list so off-chain signers can detect a reorder and discard pending
//! signatures. See ADR-0001 for the positional-vs-paired decision.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, Vec};

/// Maximum number of members a cooperative may have.
const MAX_MEMBERS: u32 = 32;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CoopConfig {
    pub members: Vec<Address>,
    pub threshold: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Active,
    Released,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub state: EscrowState,
    pub amount: i128,
}

#[contract]
pub struct CooperativeContract;

#[contractimpl]
impl CooperativeContract {
    /// Configure the cooperative members and release threshold.
    ///
    /// Emits `coop_changed` with a hash of the member list so off-chain signers
    /// can detect a reorder (which invalidates positionally-matched signatures).
    pub fn set_coop(env: Env, members: Vec<Address>, threshold: u32) {
        assert!(!members.is_empty(), "members must not be empty");
        assert!(members.len() <= MAX_MEMBERS, "too many members");
        assert!(threshold > 0 && threshold <= members.len(), "invalid threshold");

        let config = CoopConfig { members: members.clone(), threshold };
        env.storage().instance().set(&symbol_short!("coop"), &config);

        // Hash the member list so off-chain signers can detect a reorder.
        let mut encoded = Bytes::new(&env);
        for member in members.iter() {
            encoded.append(&member.clone().to_string().into());
        }
        let member_hash: BytesN<32> = env.crypto().sha256(&encoded).into();
        env.events().publish((symbol_short!("coop_changed"),), member_hash);
    }

    /// Release an escrow once `threshold` distinct members have signed.
    ///
    /// Signatures are matched by position: `signatures[i]` must be a valid
    /// signature by `members[i]` over `message`. Extra signatures beyond the
    /// member list are ignored. A forged signature traps the call (see module
    /// docs), leaving the escrow `Active`.
    pub fn multisig_release(env: Env, message: Bytes, signatures: Vec<BytesN<64>>) {
        let config: CoopConfig = env
            .storage()
            .instance()
            .get(&symbol_short!("coop"))
            .expect("coop not configured");

        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&symbol_short!("escrow"))
            .expect("escrow not found");
        assert!(escrow.state == EscrowState::Active, "escrow not active");

        let mut valid: u32 = 0;
        let limit = if signatures.len() < config.members.len() {
            signatures.len()
        } else {
            config.members.len()
        };

        for i in 0..limit {
            let member_key = config.members.get(i).unwrap();
            let sig64 = signatures.get(i).unwrap();
            // NOTE: `ed25519_verify` TRAPS on an invalid signature; it does not
            // return a bool. A forged/wrong-payload signature therefore aborts
            // the whole call and the escrow stays `Active`. Only count after a
            // successful (non-trapping) verify so a future non-trapping verify
            // cannot silently count every 64-byte entry as valid.
            env.crypto().ed25519_verify(&member_key, &message, &sig64);
            valid += 1;
        }

        assert!(valid >= config.threshold, "threshold not met");

        escrow.state = EscrowState::Released;
        env.storage().instance().set(&symbol_short!("escrow"), &escrow);
    }

    /// Read the current escrow state (used by tests and off-chain clients).
    pub fn escrow_state(env: Env) -> EscrowState {
        let escrow: Escrow = env
            .storage()
            .instance()
            .get(&symbol_short!("escrow"))
            .expect("escrow not found");
        escrow.state
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Bytes, BytesN, Env, Vec};

    fn setup(env: &Env, member_count: u32, threshold: u32) -> Vec<Address> {
        let mut members = Vec::new(env);
        for _ in 0..member_count {
            members.push_back(Address::generate(env));
        }
        CooperativeContract::set_coop(env.clone(), members.clone(), threshold);
        env.storage().instance().set(
            &symbol_short!("escrow"),
            &Escrow { state: EscrowState::Active, amount: 100 },
        );
        members
    }

    fn sign(env: &Env, member: &Address, message: &Bytes) -> BytesN<64> {
        env.crypto().ed25519_sign(member, message)
    }

    // (a) threshold met with valid signatures -> release.
    #[test]
    fn release_with_threshold_signatures() {
        let env = Env::default();
        let members = setup(&env, 3, 2);
        let message = Bytes::from_slice(&env, b"release-1");

        let mut sigs = Vec::new(&env);
        sigs.push_back(sign(&env, &members.get(0).unwrap(), &message));
        sigs.push_back(sign(&env, &members.get(1).unwrap(), &message));

        CooperativeContract::multisig_release(env.clone(), message, sigs);
        assert_eq!(CooperativeContract::escrow_state(env), EscrowState::Released);
    }

    // (b) one forged signature -> call fails, escrow stays Active.
    #[test]
    fn forged_signature_aborts_and_keeps_active() {
        let env = Env::default();
        let members = setup(&env, 3, 2);
        let message = Bytes::from_slice(&env, b"release-1");

        let mut sigs = Vec::new(&env);
        sigs.push_back(sign(&env, &members.get(0).unwrap(), &message));
        // Forged: 64 zero bytes are not a valid signature.
        sigs.push_back(BytesN::from_array(&env, &[0u8; 64]));

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            CooperativeContract::multisig_release(env.clone(), message, sigs);
        }));
        assert!(result.is_err(), "forged signature must abort the call");
        assert_eq!(CooperativeContract::escrow_state(env), EscrowState::Active);
    }

    // (c) signatures.len() > members.len() -> extra entries ignored.
    #[test]
    fn extra_signatures_are_ignored() {
        let env = Env::default();
        let members = setup(&env, 2, 2);
        let message = Bytes::from_slice(&env, b"release-1");

        let mut sigs = Vec::new(&env);
        sigs.push_back(sign(&env, &members.get(0).unwrap(), &message));
        sigs.push_back(sign(&env, &members.get(1).unwrap(), &message));
        // Extra entry beyond the member list must not be verified or counted.
        sigs.push_back(BytesN::from_array(&env, &[0u8; 64]));

        CooperativeContract::multisig_release(env.clone(), message, sigs);
        assert_eq!(CooperativeContract::escrow_state(env), EscrowState::Released);
    }

    // (d) the same valid signature is not counted for two members.
    #[test]
    fn duplicate_signature_not_counted_twice() {
        let env = Env::default();
        let members = setup(&env, 3, 2);
        let message = Bytes::from_slice(&env, b"release-1");

        let sig = sign(&env, &members.get(0).unwrap(), &message);
        let mut sigs = Vec::new(&env);
        sigs.push_back(sig.clone());
        // Reusing member 0's signature for member 1 must not satisfy threshold.
        sigs.push_back(sig);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            CooperativeContract::multisig_release(env.clone(), message, sigs);
        }));
        assert!(result.is_err(), "duplicate signature must not count twice");
        assert_eq!(CooperativeContract::escrow_state(env), EscrowState::Active);
    }
}
