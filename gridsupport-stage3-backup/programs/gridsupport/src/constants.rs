use anchor_lang::prelude::*;

pub const RIDER_SEED: &[u8] = b"rider";
pub const SEASON_SEED: &[u8] = b"season";
pub const EXPENSE_SEED: &[u8] = b"expense";
pub const SPONSORSHIP_SEED: &[u8] = b"sponsorship";
pub const V1_SEASON_ID: u64 = 1;
pub const SEASON_ACTIVE: u8 = 1;
pub const MOCK_USDC_DECIMALS: u8 = 6;

// This local-only address is backed by a standard SPL Mint account in LiteSVM.
// Never deploy a binary built with local-test-mint to Devnet.
#[cfg(feature = "local-test-mint")]
pub const APPROVED_MOCK_USDC_MINT: Option<Pubkey> = Some(Pubkey::new_from_array([77; 32]));

// A default build deliberately rejects all contributions until an independently
// verified dedicated Devnet mint is pinned here. Never use a public USDC mint.
#[cfg(not(feature = "local-test-mint"))]
pub const APPROVED_MOCK_USDC_MINT: Option<Pubkey> = None;

pub fn canonical_season_address(rider: &Pubkey) -> Pubkey {
    let (profile, _) = Pubkey::find_program_address(&[RIDER_SEED, rider.as_ref()], &crate::ID);
    Pubkey::find_program_address(&[SEASON_SEED, profile.as_ref()], &crate::ID).0
}
