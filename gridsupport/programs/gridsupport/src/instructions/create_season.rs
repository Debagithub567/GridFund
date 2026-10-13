use crate::{
    constants::{RIDER_SEED, SEASON_SEED},
    errors::GridSupportError,
    state::{RiderProfile, Season},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateSeason<'info> {
    #[account(mut)]
    pub rider: Signer<'info>,
    #[account(
        seeds = [RIDER_SEED, rider.key().as_ref()],
        bump,
        constraint = rider_profile.rider == rider.key() @ GridSupportError::UnauthorizedRider
    )]
    pub rider_profile: Account<'info, RiderProfile>,
    #[account(
        init,
        payer = rider,
        space = Season::SPACE,
        seeds = [SEASON_SEED, rider_profile.key().as_ref()],
        bump
    )]
    pub season: Account<'info, Season>,
    pub system_program: Program<'info, System>,
}
