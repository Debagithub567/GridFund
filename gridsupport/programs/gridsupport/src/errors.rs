use anchor_lang::prelude::*;

#[error_code]
pub enum GridSupportError {
    #[msg("Instruction is reserved for a later implementation stage")]
    NotImplemented,
    #[msg("Only the rider may perform this action")]
    UnauthorizedRider,
    #[msg("Invalid rider profile")]
    InvalidRiderProfile,
    #[msg("Invalid season")]
    InvalidSeason,
    #[msg("Season is not active")]
    SeasonNotActive,
    #[msg("Invalid expense")]
    InvalidExpense,
    #[msg("Expense amount must be positive")]
    InvalidExpenseAmount,
    #[msg("Sponsorship amount must be positive")]
    InvalidSponsorshipAmount,
    #[msg("Expense is fully covered")]
    ExpenseFullyCovered,
    #[msg("Sponsorship exceeds remaining expense coverage")]
    CoverageExceeded,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid merchant signer")]
    InvalidMerchant,
    #[msg("Mock USDC mint is not the approved mint or is not configured")]
    InvalidMockUsdcMint,
    #[msg("Mock USDC mint must have six decimals")]
    InvalidMintDecimals,
    #[msg("Token account has the wrong owner")]
    InvalidTokenAccountOwner,
    #[msg("Token account has the wrong mint")]
    InvalidTokenAccountMint,
    #[msg("Recipient must be the rider's canonical associated token account")]
    InvalidRecipientTokenAccount,
    #[msg("Only the standard SPL Token program is allowed")]
    InvalidTokenProgram,
    #[msg("Contribution amount must be positive")]
    InvalidContributionAmount,
}
