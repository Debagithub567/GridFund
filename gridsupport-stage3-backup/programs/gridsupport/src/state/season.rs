use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Season {
    pub rider: Pubkey,
    pub season_id: u64,
    pub budget_cents: u64,
    pub title_hash: [u8; 32],
    pub status: u8,
    pub expense_count: u64,
    pub bump: u8,
}

impl Season {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}
