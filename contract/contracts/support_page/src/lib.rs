#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    SupportCount,
}

#[derive(Clone)]
#[contracttype]
pub struct SupportEvent {
    pub supporter: Address,
    pub recipient: Address,
    pub amount: i128,
    pub asset_code: String,
    pub message: String,
    pub timestamp: u64,
}

#[contract]
pub struct SupportPageContract;

#[contractimpl]
impl SupportPageContract {
    pub fn support(
        env: Env,
        supporter: Address,
        recipient: Address,
        amount: i128,
        asset_code: String,
        message: String,
    ) -> u32 {
        supporter.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let count = env
            .storage()
            .persistent()
            .get::<DataKey, u32>(&DataKey::SupportCount)
            .unwrap_or(0)
            + 1;

        env.storage()
            .persistent()
            .set(&DataKey::SupportCount, &count);

        let topic: Symbol = symbol_short!("support");
        let event = SupportEvent {
            supporter,
            recipient,
            amount,
            asset_code,
            message,
            timestamp: env.ledger().timestamp(),
        };

        env.events().publish((topic,), event);

        count
    }

    pub fn support_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get::<DataKey, u32>(&DataKey::SupportCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Events as _}, Env, String};

    #[test]
    fn records_support_event_and_count() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SupportPageContract, ());
        let client = SupportPageContractClient::new(&env, &contract_id);

        let supporter = Address::generate(&env);
        let recipient = Address::generate(&env);

        let count = client.support(
            &supporter,
            &recipient,
            &10_i128,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, "Thanks for building on Stellar"),
        );

        assert_eq!(count, 1);
        assert_eq!(client.support_count(), 1);
    }

    #[test]
    fn support_event_includes_ledger_timestamp() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| {
            l.timestamp = 1_700_000_000;
        });

        let contract_id = env.register(SupportPageContract, ());
        let client = SupportPageContractClient::new(&env, &contract_id);

        let supporter = Address::generate(&env);
        let recipient = Address::generate(&env);

        client.support(
            &supporter,
            &recipient,
            &5_i128,
            &String::from_str(&env, "XLM"),
            &String::from_str(&env, "Timestamped support"),
        );

        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let (_, _, data) = events.get(0).unwrap();
        let event: SupportEvent = data.try_into_val(&env).expect("deserialize SupportEvent");
        assert_eq!(event.timestamp, 1_700_000_000);
    }
}
