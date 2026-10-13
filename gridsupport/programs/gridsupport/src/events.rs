use anchor_lang::prelude::*;

#[event]
pub struct RiderInitialized {
    pub rider: Pubkey,
    pub rider_profile: Pubkey,
}

#[event]
pub struct SeasonCreated {
    pub rider: Pubkey,
    pub season: Pubkey,
    pub season_id: u64,
    pub budget_cents: u64,
}

#[event]
pub struct ExpenseCreated {
    pub season: Pubkey,
    pub expense: Pubkey,
    pub expense_id: u64,
    pub estimated_cost_cents: u64,
    pub category: u8,
}

#[event]
pub struct SponsorshipCreated {
    pub expense: Pubkey,
    pub sponsorship: Pubkey,
    pub merchant: Pubkey,
    pub sponsorship_id: u64,
    pub amount_cents: u64,
}

#[event]
pub struct DirectContribution {
    pub fan: Pubkey,
    pub rider: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}
