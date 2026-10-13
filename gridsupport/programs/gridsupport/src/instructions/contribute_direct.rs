use crate::{
    constants::{APPROVED_MOCK_USDC_MINT, MOCK_USDC_DECIMALS, RIDER_SEED},
    errors::GridSupportError,
    state::RiderProfile,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct ContributeDirect<'info> {
    pub fan: Signer<'info>,
    #[account(
        seeds = [RIDER_SEED, rider_profile.rider.as_ref()],
        bump
    )]
    pub rider_profile: Account<'info, RiderProfile>,
    #[account(
        constraint = APPROVED_MOCK_USDC_MINT == Some(mock_usdc_mint.key()) @ GridSupportError::InvalidMockUsdcMint,
        constraint = mock_usdc_mint.decimals == MOCK_USDC_DECIMALS @ GridSupportError::InvalidMintDecimals,
        constraint = amount > 0 @ GridSupportError::InvalidContributionAmount
    )]
    pub mock_usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = fan_token_account.owner == fan.key() @ GridSupportError::InvalidTokenAccountOwner,
        constraint = fan_token_account.mint == mock_usdc_mint.key() @ GridSupportError::InvalidTokenAccountMint
    )]
    pub fan_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = rider_token_account.owner == rider_profile.rider @ GridSupportError::InvalidTokenAccountOwner,
        constraint = rider_token_account.mint == mock_usdc_mint.key() @ GridSupportError::InvalidTokenAccountMint,
        constraint = rider_token_account.key() == get_associated_token_address(&rider_profile.rider, &mock_usdc_mint.key()) @ GridSupportError::InvalidRecipientTokenAccount
    )]
    pub rider_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
