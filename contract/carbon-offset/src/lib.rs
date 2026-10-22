#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol,
};

const ADMIN: Symbol = symbol_short!("ADMIN");
const PENDING_ADMIN: Symbol = symbol_short!("PEND_ADM");

// Conservative TTL bump so offset records don't get archived between writes.
// Values are in ledgers (~5s each): ~6 days threshold, ~30 days bump.
const BUMP_THRESHOLD: u32 = 100_000;
const BUMP_AMOUNT: u32 = 500_000;

// Instance TTL bounds: ~6 days threshold, ~30 days bump. Instance storage holds
// the admin config, so every state-changing entrypoint must extend it to avoid
// the config being archived on a quiet deployment.
const TTL_MIN: u32 = 100_000;
const TTL_MAX: u32 = 500_000;

/// Typed errors for the carbon-offset contract. Codes are stable and must not
/// be renumbered; clients map them to user-facing messages.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CarbonError {
    /// 1 — `initialize` was already called.
    AlreadyInitialized = 1,
    /// 2 — contract has not been initialized yet.
    NotInitialized = 2,
    /// 3 — `kg_co2` must be greater than zero.
    InvalidOffsetAmount = 3,
    /// 4 — an offset is already recorded for this order.
    OffsetAlreadyRecorded = 4,
    /// 5 — no verifier approval exists for this order.
    VerifierApprovalRequired = 5,
    /// 6 — verifier approval does not match the requested offset.
    VerifierApprovalMismatch = 6,
    /// 7 — cannot amend a voided offset.
    CannotAmendVoided = 7,
    /// 8 — no active offset record found for this order.
    OffsetNotFound = 8,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Offset(u64),
    Verification(u64),
    Voided(u64),
}

#[derive(Clone)]
#[contracttype]
pub struct VerifierApproval {
    pub kg_co2: u64,
    pub verifier: Address,
}

/// On-chain carbon offset certificate for a single order.
#[derive(Clone)]
#[contracttype]
pub struct CarbonOffset {
    pub order_id: u64,
    pub kg_co2: u64,
    pub offset_paid: bool,
    pub verifier: Address,
}

#[contract]
pub struct CarbonOffsetContract;

/// Extend the instance storage TTL so admin/config data is never archived.
fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
}

#[contractimpl]
impl CarbonOffsetContract {
    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    fn require_positive_offset(kg_co2: u64) -> Result<(), CarbonError> {
        if kg_co2 == 0 {
            return Err(CarbonError::InvalidOffsetAmount);
        }
        Ok(())
    }

    fn load_admin(env: &Env) -> Result<Address, CarbonError> {
        env.storage()
            .instance()
            .get(&ADMIN)
            .ok_or(CarbonError::NotInitialized)
    }

    /// One-time setup: sets the platform admin address allowed to call `record_offset`.
    pub fn initialize(env: Env, admin: Address) -> Result<(), CarbonError> {
        admin.require_auth();
        if env.storage().instance().has(&ADMIN) {
            return Err(CarbonError::AlreadyInitialized);
        }
        env.storage().instance().set(&ADMIN, &admin);
        Self::bump_instance_ttl(&env);
        Ok(())
    }

    /// A verifier must authorize the exact offset amount before the platform can record it.
    pub fn authorize_offset(
        env: Env,
        order_id: u64,
        kg_co2: u64,
        verifier: Address,
    ) -> Result<(), CarbonError> {
        Self::require_positive_offset(kg_co2)?;
        verifier.require_auth();
        let key = DataKey::Verification(order_id);
        env.storage().persistent().set(
            &key,
            &VerifierApproval {
                kg_co2,
                verifier: verifier.clone(),
            },
        );
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("verify")),
            (order_id, kg_co2, verifier),
        );
        bump_instance(&env);
        Ok(())
    }

    /// Record a verified carbon offset for `order_id`. Callable only by the platform admin.
    /// Emits ("carbon", "offset", order_id, kg_co2).
    pub fn record_offset(
        env: Env,
        order_id: u64,
        kg_co2: u64,
        verifier: Address,
    ) -> Result<(), CarbonError> {
        Self::require_positive_offset(kg_co2)?;
        let admin = Self::load_admin(&env)?;
        admin.require_auth();

        let key = DataKey::Offset(order_id);
        let void_key = DataKey::Voided(order_id);
        let was_voided: bool = env.storage().persistent().get(&void_key).unwrap_or(false);
        if env.storage().persistent().has(&key) && !was_voided {
            return Err(CarbonError::OffsetAlreadyRecorded);
        }

        let verification_key = DataKey::Verification(order_id);
        let approval: VerifierApproval = env
            .storage()
            .persistent()
            .get(&verification_key)
            .ok_or(CarbonError::VerifierApprovalRequired)?;
        if approval.kg_co2 != kg_co2 || approval.verifier != verifier {
            return Err(CarbonError::VerifierApprovalMismatch);
        }

        let previous: Option<CarbonOffset> = if was_voided {
            env.storage().persistent().get(&key)
        } else {
            None
        };
        let record = CarbonOffset {
            order_id,
            kg_co2,
            // Payment is not handled or verified by this contract.
            offset_paid: false,
            verifier,
        };

        // Write state before publishing the event — no external calls occur in this
        // function, so there is no reentrancy window, but this keeps the pattern
        // consistent with the escrow contracts (state settled before any side effect).
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.storage().persistent().remove(&verification_key);
        if was_voided {
            env.storage().persistent().remove(&void_key);
        }
        Self::bump_instance_ttl(&env);

        if let Some(previous) = previous {
            env.events().publish(
                (symbol_short!("carbon"), symbol_short!("reissued")),
                (order_id, previous.kg_co2, kg_co2, record.verifier.clone()),
            );
        }

        bump_instance(&env);

        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("offset")),
            (order_id, kg_co2),
        );
        Ok(())
    }

    /// Public, read-only lookup of an order's carbon offset record.
    pub fn get_offset(env: Env, order_id: u64) -> Option<CarbonOffset> {
        if env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&DataKey::Voided(order_id))
            .unwrap_or(false)
        {
            return None;
        }
        env.storage().persistent().get(&DataKey::Offset(order_id))
    }

    /// Amend an incorrect record. The verifier must authorize the corrected amount.
    pub fn amend_offset(
        env: Env,
        order_id: u64,
        kg_co2: u64,
        verifier: Address,
    ) -> Result<(), CarbonError> {
        Self::require_positive_offset(kg_co2)?;
        let admin = Self::load_admin(&env)?;
        admin.require_auth();
        verifier.require_auth();
        if env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&DataKey::Voided(order_id))
            .unwrap_or(false)
        {
            return Err(CarbonError::CannotAmendVoided);
        }
        let key = DataKey::Offset(order_id);
        let mut record: CarbonOffset = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(CarbonError::OffsetNotFound)?;
        let previous_kg_co2 = record.kg_co2;
        record.kg_co2 = kg_co2;
        record.verifier = verifier.clone();
        record.offset_paid = false;
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        Self::bump_instance_ttl(&env);
        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("amended")),
            (order_id, previous_kg_co2, kg_co2, verifier),
        );
        Ok(())
    }

    /// Void an incorrect record so it can be reissued after a new verifier approval.
    pub fn void_offset(env: Env, order_id: u64) -> Result<(), CarbonError> {
        let admin = Self::load_admin(&env)?;
        admin.require_auth();
        let key = DataKey::Offset(order_id);
        if !env.storage().persistent().has(&key)
            || env
                .storage()
                .persistent()
                .get::<DataKey, bool>(&DataKey::Voided(order_id))
                .unwrap_or(false)
        {
            return Err(CarbonError::OffsetNotFound);
        }
        let record: CarbonOffset = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(CarbonError::OffsetNotFound)?;
        let void_key = DataKey::Voided(order_id);
        env.storage().persistent().set(&void_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&void_key, BUMP_THRESHOLD, BUMP_AMOUNT);
        Self::bump_instance_ttl(&env);
        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("voided")),
            (order_id, record.kg_co2),
        );
        Ok(())
    }
}
