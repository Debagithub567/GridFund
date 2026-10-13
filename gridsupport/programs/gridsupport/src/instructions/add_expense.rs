use crate::{
    constants::{EXPENSE_SEED, RIDER_SEED, SEASON_SEED},
    errors::GridSupportError,
    state::{Expense, RiderProfile, Season},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AddExpense<'info> {
    #[account(mut)]
    pub rider: Signer<'info>,
    #[account(
        seeds = [RIDER_SEED, rider.key().as_ref()],
        bump,
        constraint = rider_profile.rider == rider.key() @ GridSupportError::UnauthorizedRider
    )]
    pub rider_profile: Account<'info, RiderProfile>,
    #[account(
        mut,
        seeds = [SEASON_SEED, rider_profile.key().as_ref()],
        bump,
        constraint = season.rider == rider.key() @ GridSupportError::InvalidSeason
    )]
    pub season: Account<'info, Season>,
    #[account(
        init,
        payer = rider,
        space = Expense::SPACE,
        seeds = [EXPENSE_SEED, season.key().as_ref(), &season.expense_count.to_le_bytes()],
        bump
    )]
    pub expense: Account<'info, Expense>,
    pub system_program: Program<'info, System>,
}
