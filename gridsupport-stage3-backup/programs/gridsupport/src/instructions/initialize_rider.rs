use crate::{constants::RIDER_SEED, events::RiderInitialized, state::RiderProfile};
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

pub(crate) fn handle(ctx: Context<InitializeRider>) -> Result<()> {
    let profile = &mut ctx.accounts.rider_profile;
    profile.rider = ctx.accounts.rider.key();
    profile.bump = ctx.bumps.rider_profile;
    emit!(RiderInitialized {
        rider: profile.rider,
        rider_profile: profile.key(),
    });
    Ok(())
}
