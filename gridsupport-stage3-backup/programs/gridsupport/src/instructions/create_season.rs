use crate::{
    constants::{RIDER_SEED, SEASON_ACTIVE, SEASON_SEED, V1_SEASON_ID},
    errors::GridSupportError,
    events::SeasonCreated,
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

pub(crate) fn handle(
    ctx: Context<CreateSeason>,
    budget_cents: u64,
    title_hash: [u8; 32],
) -> Result<()> {
    require!(budget_cents > 0, GridSupportError::InvalidSeasonBudget);
    let season = &mut ctx.accounts.season;
    season.rider = ctx.accounts.rider.key();
    season.season_id = V1_SEASON_ID;
    season.budget_cents = budget_cents;
    season.title_hash = title_hash;
    season.status = SEASON_ACTIVE;
    season.expense_count = 0;
    season.bump = ctx.bumps.season;
    emit!(SeasonCreated {
        rider: season.rider,
        season: season.key(),
        season_id: season.season_id,
        budget_cents,
    });
    Ok(())
}
