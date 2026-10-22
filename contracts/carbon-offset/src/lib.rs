use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OffsetRecord {
    pub order_id: u64,
    pub kg_co2: i128,
    pub verifier: Address,
    pub voided: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Verifier(Address),
    Verification(u64),
    Offset(u64),
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
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    fn require_admin(env: &Env) -> Address {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        admin
    }

    pub fn add_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        env.storage()
            .persistent()
            .set(&DataKey::Verifier(verifier.clone()), &true);
        env.events()
            .publish((Symbol::new(&env, "verifier_added"),), verifier);
    }

    pub fn remove_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        env.storage()
            .persistent()
            .remove(&DataKey::Verifier(verifier.clone()));
        env.events()
            .publish((Symbol::new(&env, "verifier_removed"),), verifier);
    }

    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Verifier(verifier))
            .unwrap_or(false)
    }

    pub fn authorize_offset(env: Env, order_id: u64, kg_co2: i128, verifier: Address) {
        verifier.require_auth();
        let registered: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Verifier(verifier.clone()))
            .unwrap_or(false);
        if !registered {
            panic!("unregistered verifier");
        }
        env.storage().persistent().set(
            &DataKey::Verification(order_id),
            &(verifier.clone(), kg_co2),
        );
        env.events().publish(
            (Symbol::new(&env, "offset_authorized"), order_id),
            (verifier, kg_co2),
        );
    }

    pub fn record_offset(env: Env, order_id: u64, kg_co2: i128) {
        Self::require_admin(&env);
        let (verifier, approved_kg): (Address, i128) = env
            .storage()
            .persistent()
            .get(&DataKey::Verification(order_id))
            .expect("no verification");
        if approved_kg != kg_co2 {
            panic!("kg_co2 mismatch");
        }
        env.storage()
            .persistent()
            .remove(&DataKey::Verification(order_id));
        env.storage().persistent().set(
            &DataKey::Offset(order_id),
            &OffsetRecord {
                order_id,
                kg_co2,
                verifier,
                voided: false,
            },
        );
        env.events()
            .publish((Symbol::new(&env, "offset_recorded"), order_id), kg_co2);
    }

    pub fn amend_offset(env: Env, order_id: u64, kg_co2: i128) {
        Self::require_admin(&env);
        let (verifier, approved_kg): (Address, i128) = env
            .storage()
            .persistent()
            .get(&DataKey::Verification(order_id))
            .expect("no verification");
        if approved_kg != kg_co2 {
            panic!("kg_co2 mismatch");
        }
        env.storage()
            .persistent()
            .remove(&DataKey::Verification(order_id));
        env.storage().persistent().set(
            &DataKey::Offset(order_id),
            &OffsetRecord {
                order_id,
                kg_co2,
                verifier,
                voided: false,
            },
        );
        env.events()
            .publish((Symbol::new(&env, "offset_amended"), order_id), kg_co2);
    }

    pub fn void_offset(env: Env, order_id: u64) {
        Self::require_admin(&env);
        let mut record: OffsetRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Offset(order_id))
            .expect("no offset");
        record.voided = true;
        env.storage()
            .persistent()
            .set(&DataKey::Offset(order_id), &record);
        env.events()
            .publish((Symbol::new(&env, "offset_voided"), order_id), ());
    }

    pub fn get_offset(env: Env, order_id: u64) -> Option<OffsetRecord> {
        env.storage().persistent().get(&DataKey::Offset(order_id))
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
