//! Shared Soroban test fixtures: generated accounts and minimal mock tokens.
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, testutils::Address as _, Address, Env};

/// Generate `N` fresh accounts.
pub fn accounts<const N: usize>(env: &Env) -> [Address; N] {
    core::array::from_fn(|_| Address::generate(env))
}

/// Generate a fresh account and mint `amount` of `token` (a [`MockToken`]) to it.
pub fn funded_account(env: &Env, token: &Address, amount: i128) -> Address {
    let account = Address::generate(env);
    MockTokenClient::new(env, token).mint(&account, &amount);
    account
}

/// Register a [`MockToken`] and return its address.
pub fn register_mock_token(env: &Env) -> Address {
    env.register(MockToken, ())
}

/// Register a [`NoopToken`] and return its address.
pub fn register_noop_token(env: &Env) -> Address {
    env.register(NoopToken, ())
}

/// Register a [`MockRewardToken`] and return its address.
///
/// The mock mirrors the real `reward-token` surface used by escrow:
/// `mint(to, amount)` (minter-auth) and `mint_for_order(to, xlm_amount)`
/// (which applies its own `reward_rate_bps`). It also enforces a supply cap
/// so tests can exercise the `MaxSupplyExceeded` failure path.
pub fn register_mock_reward_token(env: &Env) -> Address {
    env.register(MockRewardToken, ())
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Balance(Address),
}

/// Minimal SEP-41-style token: `mint`, `balance` and a balance-checked `transfer`.
#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn mint(env: Env, to: Address, amount: i128) {
        let bal = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&Key::Balance(to), &(bal + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Key::Balance(id))
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_bal = Self::balance(env.clone(), from.clone());
        assert!(from_bal >= amount, "insufficient balance");
        env.storage()
            .persistent()
            .set(&Key::Balance(from), &(from_bal - amount));
        Self::mint(env, to, amount);
    }
}

/// Token whose `transfer` does nothing; for tests that only need a callable token.
pub mod noop {
    use soroban_sdk::{contract, contractimpl, Address, Env};

    #[contract]
    pub struct NoopToken;

    #[contractimpl]
    impl NoopToken {
        pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
    }
}
pub use noop::NoopToken;

#[contracttype]
#[derive(Clone)]
enum RewardKey {
    Minter,
    RateBps,
    MaxSupply,
    TotalSupply,
    Balance(Address),
}

/// Mock of the real `reward-token` contract surface used by escrow.
///
/// Exposes `mint(to, amount)` (minter-auth) and `mint_for_order(to, xlm_amount)`
/// which applies the token's own `reward_rate_bps`. A `max_supply` cap lets
/// tests trigger `MaxSupplyExceeded` to verify escrow's `try_` handling.
#[contract]
pub struct MockRewardToken;

#[contractimpl]
impl MockRewardToken {
    pub fn initialize(env: Env, minter: Address, rate_bps: u32, max_supply: i128) {
        env.storage().instance().set(&RewardKey::Minter, &minter);
        env.storage().instance().set(&RewardKey::RateBps, &rate_bps);
        env.storage().instance().set(&RewardKey::MaxSupply, &max_supply);
        env.storage().instance().set(&RewardKey::TotalSupply, &0i128);
    }

    pub fn set_minter(env: Env, minter: Address) {
        env.storage().instance().set(&RewardKey::Minter, &minter);
    }

    pub fn minter(env: Env) -> Address {
        env.storage().instance().get(&RewardKey::Minter).unwrap()
    }

    pub fn reward_rate_bps(env: Env) -> u32 {
        env.storage().instance().get(&RewardKey::RateBps).unwrap()
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let minter: Address = env.storage().instance().get(&RewardKey::Minter).unwrap();
        minter.require_auth();
        Self::do_mint(&env, to, amount);
    }

    pub fn mint_for_order(env: Env, to: Address, xlm_amount: i128) -> i128 {
        let minter: Address = env.storage().instance().get(&RewardKey::Minter).unwrap();
        minter.require_auth();
        let rate: u32 = env.storage().instance().get(&RewardKey::RateBps).unwrap();
        let reward = xlm_amount * (rate as i128) / 10_000;
        Self::do_mint(&env, to, reward);
        reward
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&RewardKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&RewardKey::TotalSupply)
            .unwrap_or(0)
    }

    fn do_mint(env: &Env, to: Address, amount: i128) {
        let total: i128 = env
            .storage()
            .instance()
            .get(&RewardKey::TotalSupply)
            .unwrap_or(0);
        let max: i128 = env
            .storage()
            .instance()
            .get(&RewardKey::MaxSupply)
            .unwrap_or(i128::MAX);
        if total + amount > max {
            panic!("MaxSupplyExceeded");
        }
        let bal = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&RewardKey::Balance(to), &(bal + amount));
        env.storage()
            .instance()
            .set(&RewardKey::TotalSupply, &(total + amount));
    }
}
