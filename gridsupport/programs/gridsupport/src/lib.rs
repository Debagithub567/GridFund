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

    pub fn initialize_rider(_ctx: Context<InitializeRider>) -> Result<()> {
        Err(errors::GridSupportError::NotImplemented.into())
    }

    pub fn create_season(
        _ctx: Context<CreateSeason>,
        budget_cents: u64,
        title_hash: [u8; 32],
    ) -> Result<()> {
        let _ = (budget_cents, title_hash);
        Err(errors::GridSupportError::NotImplemented.into())
    }

    pub fn add_expense(
        _ctx: Context<AddExpense>,
        estimated_cost_cents: u64,
        category: u8,
        description_hash: [u8; 32],
    ) -> Result<()> {
        let _ = (estimated_cost_cents, category, description_hash);
        Err(errors::GridSupportError::NotImplemented.into())
    }

    pub fn sponsor_expense(_ctx: Context<SponsorExpense>, amount_cents: u64) -> Result<()> {
        let _ = amount_cents;
        Err(errors::GridSupportError::NotImplemented.into())
    }

    pub fn contribute_direct(_ctx: Context<ContributeDirect>, amount: u64) -> Result<()> {
        let _ = amount;
        Err(errors::GridSupportError::NotImplemented.into())
    }
}
