use anchor_lang::prelude::*;

pub const RIDER_SEED: &[u8] = b"rider";
pub const SEASON_SEED: &[u8] = b"season";
pub const EXPENSE_SEED: &[u8] = b"expense";
pub const SPONSORSHIP_SEED: &[u8] = b"sponsorship";

pub const V1_SEASON_ID: u64 = 1;
pub const SEASON_ACTIVE: u8 = 1;
pub const MOCK_USDC_DECIMALS: u8 = 6;

// Local-only mint for LiteSVM and isolated validator tests.
// Never deploy a binary built with local-test-mint.
#[cfg(feature = "local-test-mint")]
pub const APPROVED_MOCK_USDC_MINT: Option<Pubkey> =
    Some(Pubkey::new_from_array([77; 32]));

// Verified six-decimal standard SPL Token mint on Solana Devnet.
#[cfg(not(feature = "local-test-mint"))]
pub const APPROVED_MOCK_USDC_MINT: Option<Pubkey> =
    Some(pubkey!("Eu5ZdwKKpSNej1koShWYBm7SKoPE2utvtb3yLWSjRxf1"));

pub fn canonical_season_address(rider: &Pubkey) -> Pubkey {
    let (profile, _) =
        Pubkey::find_program_address(&[RIDER_SEED, rider.as_ref()], &crate::ID);

    Pubkey::find_program_address(
        &[SEASON_SEED, profile.as_ref()],
        &crate::ID,
    ).0
}