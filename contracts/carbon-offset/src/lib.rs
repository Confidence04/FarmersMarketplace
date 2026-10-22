//! Carbon-offset contract.
//!
//! Tracks carbon-offset credits and lets the admin upgrade the contract
//! wasm. Upgrades are time-locked: the admin must first propose a new wasm
//! hash, wait for `UPGRADE_DELAY`, and only then execute it. A pending
//! proposal can be cancelled at any time before execution.

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol};

/// Default time-lock applied between `propose_upgrade` and `execute_upgrade`.
/// 48 hours, expressed in seconds.
pub const UPGRADE_DELAY: u64 = 48 * 60 * 60;

/// Time-lock used when the `testnet` feature flag is enabled. Testnet builds
/// may set the delay to 0 so upgrades can be exercised immediately.
#[cfg(feature = "testnet")]
pub const UPGRADE_DELAY_TESTNET: u64 = 0;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpgrade {
    pub new_wasm_hash: BytesN<32>,
    pub eta: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    PendingUpgrade,
}

#[contract]
pub struct CarbonOffsetContract;

#[contractimpl]
impl CarbonOffsetContract {
    /// Initialise the contract with an admin.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Propose a new wasm hash. Stores `(hash, eta = now + UPGRADE_DELAY)` and
    /// emits an `upgrade_proposed` event. Rejects the zero hash.
    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if new_wasm_hash == BytesN::from_array(&env, &[0u8; 32]) {
            panic!("InvalidWasmHash");
        }

        let eta = env.ledger().timestamp() + Self::upgrade_delay();
        let pending = PendingUpgrade {
            new_wasm_hash: new_wasm_hash.clone(),
            eta,
        };
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrade, &pending);

        env.events().publish(
            (Symbol::new(&env, "upgrade_proposed"),),
            (new_wasm_hash, eta),
        );
    }

    /// Execute a previously proposed upgrade. Only succeeds once `eta` has
    /// passed.
    pub fn execute_upgrade(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .expect("no pending upgrade");

        if env.ledger().timestamp() < pending.eta {
            panic!("upgrade not yet ready");
        }

        env.storage()
            .instance()
            .remove(&DataKey::PendingUpgrade);

        env.deployer()
            .update_current_contract_wasm(pending.new_wasm_hash.clone());

        env.events().publish(
            (Symbol::new(&env, "upgrade_executed"),),
            pending.new_wasm_hash,
        );
    }

    /// Cancel a pending upgrade proposal.
    pub fn cancel_upgrade(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage()
            .instance()
            .remove(&DataKey::PendingUpgrade);

        env.events()
            .publish((Symbol::new(&env, "upgrade_cancelled"),), ());
    }

    /// Returns the currently pending upgrade, if any.
    pub fn pending_upgrade(env: Env) -> Option<PendingUpgrade> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }

    /// The effective upgrade delay for this build.
    fn upgrade_delay() -> u64 {
        #[cfg(feature = "testnet")]
        {
            UPGRADE_DELAY_TESTNET
        }
        #[cfg(not(feature = "testnet"))]
        {
            UPGRADE_DELAY
        }
    }
}
