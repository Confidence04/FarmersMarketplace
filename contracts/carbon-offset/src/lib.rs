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
    }
}
