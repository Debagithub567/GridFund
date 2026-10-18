pub mod expense;
pub mod rider_profile;
pub mod season;
pub mod sponsorship;

pub use expense::*;
pub use rider_profile::*;
pub use season::*;
pub use sponsorship::*;

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;

    fn serialized_len<T: AccountSerialize>(account: &T) -> usize {
        let mut bytes = Vec::new();
        account.try_serialize(&mut bytes).unwrap();
        bytes.len()
    }

    #[test]
    fn fixed_allocations_match_anchor_serialization() {
        let key = Pubkey::default();
        let profile = RiderProfile {
            rider: key,
            bump: 0,
        };
        let season = Season {
            rider: key,
            season_id: 1,
            budget_cents: 0,
            title_hash: [0; 32],
            status: 1,
            expense_count: 0,
            bump: 0,
        };
        let expense = Expense {
            season: key,
            expense_id: 0,
            estimated_cost_cents: 1,
            committed_coverage_cents: 0,
            sponsorship_count: 0,
            category: 0,
            description_hash: [0; 32],
            bump: 0,
        };
        let sponsorship = Sponsorship {
            expense: key,
            merchant: key,
            sponsorship_id: 0,
            amount_cents: 1,
            created_at: 0,
            bump: 0,
        };
        assert_eq!((RiderProfile::SPACE, serialized_len(&profile)), (41, 41));
        assert_eq!((Season::SPACE, serialized_len(&season)), (98, 98));
        assert_eq!((Expense::SPACE, serialized_len(&expense)), (106, 106));
        assert_eq!((Sponsorship::SPACE, serialized_len(&sponsorship)), (97, 97));
    }
}
