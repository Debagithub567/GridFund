use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Sponsorship {
    pub expense: Pubkey,
    pub merchant: Pubkey,
    pub sponsorship_id: u64,
    pub amount_cents: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Sponsorship {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}
