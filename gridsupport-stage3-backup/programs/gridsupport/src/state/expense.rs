use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Expense {
    pub season: Pubkey,
    pub expense_id: u64,
    pub estimated_cost_cents: u64,
    pub committed_coverage_cents: u64,
    pub sponsorship_count: u64,
    pub category: u8,
    pub description_hash: [u8; 32],
    pub bump: u8,
}

impl Expense {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}
