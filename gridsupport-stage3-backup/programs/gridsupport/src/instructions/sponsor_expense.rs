use crate::{
    constants::{canonical_season_address, EXPENSE_SEED, SEASON_ACTIVE, SPONSORSHIP_SEED},
    errors::GridSupportError,
    events::SponsorshipCreated,
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

pub(crate) fn handle(ctx: Context<SponsorExpense>, amount_cents: u64) -> Result<()> {
    require!(
        ctx.accounts.season.status == SEASON_ACTIVE,
        GridSupportError::SeasonNotActive
    );
    let expense = &mut ctx.accounts.expense;
    let new_coverage = checked_coverage(
        expense.committed_coverage_cents,
        expense.estimated_cost_cents,
        amount_cents,
    )?;
    let sponsorship_id = expense.sponsorship_count;
    let next_count = super::next_count(sponsorship_id)?;
    let created_at = Clock::get()?.unix_timestamp;

    let sponsorship = &mut ctx.accounts.sponsorship;
    sponsorship.expense = expense.key();
    sponsorship.merchant = ctx.accounts.merchant.key();
    sponsorship.sponsorship_id = sponsorship_id;
    sponsorship.amount_cents = amount_cents;
    sponsorship.created_at = created_at;
    sponsorship.bump = ctx.bumps.sponsorship;
    expense.committed_coverage_cents = new_coverage;
    expense.sponsorship_count = next_count;

    emit!(SponsorshipCreated {
        expense: sponsorship.expense,
        sponsorship: sponsorship.key(),
        merchant: sponsorship.merchant,
        sponsorship_id,
        amount_cents,
    });
    Ok(())
}

fn checked_coverage(current: u64, estimated: u64, amount: u64) -> Result<u64> {
    require!(amount > 0, GridSupportError::InvalidSponsorshipAmount);
    require!(current <= estimated, GridSupportError::CoverageExceeded);
    require!(current < estimated, GridSupportError::ExpenseFullyCovered);
    let new_coverage = current
        .checked_add(amount)
        .ok_or_else(|| error!(GridSupportError::ArithmeticOverflow))?;
    require!(
        new_coverage <= estimated,
        GridSupportError::CoverageExceeded
    );
    Ok(new_coverage)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coverage_boundaries_and_overflow() {
        assert_eq!(checked_coverage(0, 15_000, 500).unwrap(), 500);
        assert_eq!(checked_coverage(14_500, 15_000, 500).unwrap(), 15_000);
        assert!(checked_coverage(15_000, 15_000, 1).is_err());
        assert!(checked_coverage(0, 15_000, 0).is_err());
        assert!(checked_coverage(14_500, 15_000, 501).is_err());
        assert!(checked_coverage(u64::MAX - 1, u64::MAX, 2).is_err());
    }
}
