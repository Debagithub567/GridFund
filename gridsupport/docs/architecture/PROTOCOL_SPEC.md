# Frozen V1 protocol specification

All accounts use Anchor's 8-byte discriminator and fixed-width Borsh fields. `InitSpace` derives each allocation constant.

| Account | Fields in serialized order | Bytes including discriminator | PDA seeds |
| --- | --- | ---: | --- |
| RiderProfile | `rider: Pubkey`, `bump: u8` | 41 | `b"rider"`, rider wallet |
| Season | `rider: Pubkey`, `season_id: u64`, `budget_cents: u64`, `title_hash: [u8;32]`, `status: u8`, `expense_count: u64`, `bump: u8` | 98 | `b"season"`, RiderProfile key |
| Expense | `season: Pubkey`, `expense_id: u64`, `estimated_cost_cents: u64`, `committed_coverage_cents: u64`, `sponsorship_count: u64`, `category: u8`, `description_hash: [u8;32]`, `bump: u8` | 106 | `b"expense"`, Season key, `expense_id.to_le_bytes()` |
| Sponsorship | `expense: Pubkey`, `merchant: Pubkey`, `sponsorship_id: u64`, `amount_cents: u64`, `created_at: i64`, `bump: u8` | 97 | `b"sponsorship"`, Expense key, `sponsorship_id.to_le_bytes()` |

`season_id = 1` and `status = 1` mean the only active season in V1; `status = 2` is reserved. Expense and sponsorship IDs start at zero and use the parent's count. Budgets are independent of listed expense totals. Category is numeric; hashes reference offchain title and description metadata. The merchant signer wallet identifies the business; no onchain name or logo exists. Season budget, expense estimate, and sponsorship amount must be positive.

| Public instruction | Arguments | Required signer and validation |
| --- | --- | --- |
| `initialize_rider` | none | Mutable rider signer; initialize canonical RiderProfile PDA with rider paying via System Program. |
| `create_season` | `budget_cents: u64`, `title_hash: [u8;32]` | Mutable rider signer; existing canonical RiderProfile with matching rider; initialize fixed Season PDA. |
| `add_expense` | `estimated_cost_cents: u64`, `category: u8`, `description_hash: [u8;32]` | Mutable rider signer; canonical profile and mutable Season belonging to rider; initialize Expense PDA at current `season.expense_count`. |
| `sponsor_expense` | `amount_cents: u64` | Mutable merchant signer; canonical Season derived from its rider; mutable canonical Expense in that Season; initialize Sponsorship PDA at current `expense.sponsorship_count`. Rider does not sign. |
| `contribute_direct` | `amount: u64` | Fan signer; canonical RiderProfile; approved standard SPL mint and six decimals; source token account owned by fan and matching mint; destination token account owned by rider, matching mint, at canonical ATA; standard SPL Token program. |

Anchor's `Account<T>` enforces account ownership and deserialization. `Program<Token>` fixes the standard SPL Token program. Existing PDA constraints recompute canonical bumps; the Season in `sponsor_expense` is checked against the canonical RiderProfile-derived address because that interface has no RiderProfile account. The canonical RiderProfile key is derived from `season.rider`, which is program-owned state set by `create_season`. Thus no additional RiderProfile account was added to `sponsor_expense`, and the generated IDL account interface is unchanged. Anchor's `init` enforces unique PDA initialization. Failed transactions roll back account creation and state changes atomically.

Operational Racer → Shop behavior: `initialize_rider` stores the signer and canonical bump; `create_season` sets ID 1, active status, budget/title hash, zero expense count, and bump; `add_expense` uses the current season count as its ID, initializes zero coverage/count, and increments the season count; `sponsor_expense` uses the current expense count as its ID, stores signer wallet and trusted `Clock::get()?.unix_timestamp`, updates coverage/count, and emits its event. These four instructions emit their corresponding existing event only after success. `contribute_direct` still returns `NotImplemented` and emits nothing.

Enforced arithmetic invariants: `estimated_cost_cents > 0`, `0 <= committed_coverage_cents <= estimated_cost_cents`, `amount_cents > 0`, and new coverage may not exceed estimated cost. Expense and sponsorship count increments and sponsorship coverage addition use checked arithmetic; overflow fails with `ArithmeticOverflow`. A fully covered expense rejects new sponsorship with `ExpenseFullyCovered`. Season must be active for expense and sponsorship creation. Every sponsorship is a permanent separate in-kind declaration, never a token transfer. Direct contribution amount must be positive and future transfer must use `transfer_checked`.

`InvalidSeasonBudget` was appended to the existing error enum for the new positive-budget rule, preserving the numeric codes of all Stage 1 errors.

Mock-USDC is **unconfigured** in `constants.rs`: `APPROVED_MOCK_USDC_MINT = None`, which rejects every mint. After a dedicated six-decimal Devnet standard SPL mint is created and its address independently verified, pin `Some(pubkey!("..."))`, then rebuild, test, and deploy. Do not accept a frontend supplied mint or substitute public USDC. No minting or faucet is part of this program.

Events: `RiderInitialized(rider, rider_profile)`, `SeasonCreated(rider, season, season_id, budget_cents)`, `ExpenseCreated(season, expense, expense_id, estimated_cost_cents, category)`, and `SponsorshipCreated(expense, sponsorship, merchant, sponsorship_id, amount_cents)` are emitted by successful Stage 2 instructions. `DirectContribution(fan, rider, mint, amount)` is defined for Stage 3 and is not emitted. Their field types follow the source declarations.

