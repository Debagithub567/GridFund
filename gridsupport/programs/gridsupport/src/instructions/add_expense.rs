use crate::{
    constants::{EXPENSE_SEED, RIDER_SEED, SEASON_ACTIVE, SEASON_SEED},
    errors::GridSupportError,
    events::ExpenseCreated,
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

pub(crate) fn handle(
    ctx: Context<AddExpense>,
    estimated_cost_cents: u64,
    category: u8,
    description_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.season.status == SEASON_ACTIVE,
        GridSupportError::SeasonNotActive
    );
    require!(
        estimated_cost_cents > 0,
        GridSupportError::InvalidExpenseAmount
    );
    let expense_id = ctx.accounts.season.expense_count;
    let next_count = super::next_count(expense_id)?;

    let expense = &mut ctx.accounts.expense;
    expense.season = ctx.accounts.season.key();
    expense.expense_id = expense_id;
    expense.estimated_cost_cents = estimated_cost_cents;
    expense.committed_coverage_cents = 0;
    expense.sponsorship_count = 0;
    expense.category = category;
    expense.description_hash = description_hash;
    expense.bump = ctx.bumps.expense;
    ctx.accounts.season.expense_count = next_count;

    emit!(ExpenseCreated {
        season: expense.season,
        expense: expense.key(),
        expense_id,
        estimated_cost_cents,
        category,
    });
    Ok(())
}
