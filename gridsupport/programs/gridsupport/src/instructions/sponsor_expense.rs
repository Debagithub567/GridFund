use crate::{
    constants::{canonical_season_address, EXPENSE_SEED, SPONSORSHIP_SEED},
    errors::GridSupportError,
    state::{Expense, Season, Sponsorship},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SponsorExpense<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(
        constraint = season.key() == canonical_season_address(&season.rider) @ GridSupportError::InvalidSeason
    )]
    pub season: Account<'info, Season>,
    #[account(
        mut,
        seeds = [EXPENSE_SEED, season.key().as_ref(), &expense.expense_id.to_le_bytes()],
        bump,
        constraint = expense.season == season.key() @ GridSupportError::InvalidExpense
    )]
    pub expense: Account<'info, Expense>,
    #[account(
        init,
        payer = merchant,
        space = Sponsorship::SPACE,
        seeds = [SPONSORSHIP_SEED, expense.key().as_ref(), &expense.sponsorship_count.to_le_bytes()],
        bump
    )]
    pub sponsorship: Account<'info, Sponsorship>,
    pub system_program: Program<'info, System>,
}
