pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
pub use instructions::*;

declare_id!("H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ");

#[program]
pub mod gridsupport {
    use super::*;

    pub fn initialize_rider(ctx: Context<InitializeRider>) -> Result<()> {
        instructions::initialize_rider::handle(ctx)
    }

    pub fn create_season(
        ctx: Context<CreateSeason>,
        budget_cents: u64,
        title_hash: [u8; 32],
    ) -> Result<()> {
        instructions::create_season::handle(ctx, budget_cents, title_hash)
    }

    pub fn add_expense(
        ctx: Context<AddExpense>,
        estimated_cost_cents: u64,
        category: u8,
        description_hash: [u8; 32],
    ) -> Result<()> {
        instructions::add_expense::handle(ctx, estimated_cost_cents, category, description_hash)
    }

    pub fn sponsor_expense(ctx: Context<SponsorExpense>, amount_cents: u64) -> Result<()> {
        instructions::sponsor_expense::handle(ctx, amount_cents)
    }

    pub fn contribute_direct(ctx: Context<ContributeDirect>, amount: u64) -> Result<()> {
        instructions::contribute_direct::handle(ctx, amount)
    }
}
