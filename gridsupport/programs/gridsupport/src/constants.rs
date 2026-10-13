use anchor_lang::prelude::*;

pub const RIDER_SEED: &[u8] = b"rider";
pub const SEASON_SEED: &[u8] = b"season";
pub const EXPENSE_SEED: &[u8] = b"expense";
pub const SPONSORSHIP_SEED: &[u8] = b"sponsorship";
pub const MOCK_USDC_DECIMALS: u8 = 6;

// None deliberately rejects every contribution until a dedicated Devnet mint is
// created, reviewed, and pinned here. Never substitute a public stablecoin mint.
pub const APPROVED_MOCK_USDC_MINT: Option<Pubkey> = None;

pub fn canonical_season_address(rider: &Pubkey) -> Pubkey {
    let (profile, _) = Pubkey::find_program_address(&[RIDER_SEED, rider.as_ref()], &crate::ID);
    Pubkey::find_program_address(&[SEASON_SEED, profile.as_ref()], &crate::ID).0
}
