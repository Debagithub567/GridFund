use crate::{constants::RIDER_SEED, state::RiderProfile};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeRider<'info> {
    #[account(mut)]
    pub rider: Signer<'info>,
    #[account(
        init,
        payer = rider,
        space = RiderProfile::SPACE,
        seeds = [RIDER_SEED, rider.key().as_ref()],
        bump
    )]
    pub rider_profile: Account<'info, RiderProfile>,
    pub system_program: Program<'info, System>,
}
