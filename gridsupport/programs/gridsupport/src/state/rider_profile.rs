use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RiderProfile {
    pub rider: Pubkey,
    pub bump: u8,
}

impl RiderProfile {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}
