# GridSupport V1 Stage 2 implementation handoff

## Workspace and preserved architecture

Work is in the existing `gridsupport/` Anchor workspace. The neighboring `gridfund/` workspace was not changed. The program still has exactly four account types and five public instructions, with the Stage 1 fields, PDA seeds, and allocations unchanged: RiderProfile 41, Season 98, Expense 106, Sponsorship 97 bytes, including discriminators. The existing `SponsorExpense` account list is sufficient: from the program-owned `season.rider` wallet, `canonical_season_address` derives the RiderProfile PDA and then the Season PDA. No additional read-only account or IDL account-interface change was needed.

The local program ID remains `H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ`. Its keypair and generated SBF/IDL artifacts are in ignored `target/`, so protect or replace the keypair before deployment and rebuild artifacts in a new checkout.

## Files changed for Stage 2

- `programs/gridsupport/src/lib.rs`: routes four approved instructions to operational handlers; `contribute_direct` still returns `NotImplemented`.
- `src/instructions/{initialize_rider,create_season,add_expense,sponsor_expense,mod}.rs`: initialization, sponsorship, active-status checks, checked arithmetic, event emission, and counter overflow helper.
- `src/constants.rs`: names the fixed season ID and Active status values.
- `src/errors.rs`: appends `InvalidSeasonBudget`, the only new error variant, because a zero season budget needs a specific failure. Appending preserves existing error codes.
- `programs/gridsupport/Cargo.toml`: adds `base64` as a test-only dependency for event log verification.
- `programs/gridsupport/tests/structural.rs`: replaces Stage 1 unimplemented-handler expectations with LiteSVM state-transition and security tests.
- `tests/architecture.spec.ts`: checks the frozen account lists in the generated IDL.
- `scripts/README.md`: records the Stage 2 test and build workflow.
- `docs/architecture/{PROJECT_CONTEXT,PROTOCOL_SPEC,SECURITY_TEST_PLAN,OPEN_QUESTIONS,IMPLEMENTATION_HANDOFF}.md`: updates implementation status, validation, tests, and Stage 3 dependencies.
- `Cargo.lock`: records the test dependency. Account state modules, events, token configuration, and `contribute_direct` constraints were not changed.

## Operational instructions

1. `initialize_rider`: Anchor requires the rider signer and initializes the canonical PDA; the handler stores wallet and bump, then emits `RiderInitialized`. A second initialization fails.
2. `create_season`: requires the canonical RiderProfile owned by the signer and a positive budget; initializes the unique Season PDA with ID 1, Active status, supplied budget/hash, zero expense count, and bump; emits `SeasonCreated`.
3. `add_expense`: requires the signer-owned canonical profile and Season, Active status, and positive estimated cost; initializes the PDA for the current expense count, stores supplied metadata with zero coverage/sponsorship count, increments the Season count using checked addition, and emits `ExpenseCreated`. The budget and sum of expenses remain independent.
4. `sponsor_expense`: requires a merchant signer, canonical Season and Expense relationship, Active status, positive amount, available capacity, and checked arithmetic. It initializes one immutable Sponsorship PDA using the current expense sponsorship count, stores merchant wallet and Solana Clock timestamp, updates coverage/count, and emits `SponsorshipCreated`. The rider does not sign. This is an in-kind declaration; no tokens move.

All account creation and state updates are atomic at the transaction level. Failed attempts leave parent counters and coverage unchanged and create no Sponsorship account. No cancellation, rider acceptance, merchant profile, escrow, or fulfillment state was introduced.

## Verification on 2026-10-13

| Command | Actual result |
| --- | --- |
| `cargo fmt --all -- --check` | Passed. |
| `cargo check --offline` | Passed without warnings. |
| `cargo test --offline` | Passed: 3 Rust unit tests plus 5 LiteSVM integration tests, 8 total. |
| `anchor build --arch v0 --tools-version v1.54` | Passed. Generated IDL retains five instructions, four accounts, five events and now 20 error variants. |
| `npm run typecheck` | Passed. |
| `npm test` | Passed: 3 TypeScript IDL/layout/PDA tests. |

The five LiteSVM tests execute actual SBF transactions for the Racer → Shop path. They cover duplicate and wrong PDA rejection, wrong program ownership, unauthorized relationships, zero values, sequential IDs, the €150 expense with €5 then €2 from the same merchant, a second merchant, exact remaining coverage, full-expense rejection, failed-operation atomicity, inactive Season, `u64::MAX` coverage overflow, and all four emitted event values. Unit tests cover fixed allocations, counter overflow, and sponsorship coverage boundaries. Invalid merchant signature is checked at transaction construction because the signed message requires that signature.

The local default `anchor build` toolchain v1.57 cache remains incomplete; use the explicit v1.54/v0 command. The local LiteSVM version loads the v0 artifact. Neither a Devnet deployment nor a security audit was performed.

## Stage 3 readiness and dependencies

`contribute_direct` is still non-operational and does not emit `DirectContribution`. `APPROVED_MOCK_USDC_MINT` remains `None`, which rejects arbitrary mints. Stage 3 needs a dedicated six-decimal Devnet standard SPL mint, a verified and pinned address, token account fixtures, and `transfer_checked` implementation and tests. It must keep mock-USDC token amounts separate from euro-cent in-kind sponsorship coverage. Do not create a donation receipt PDA or token escrow.

No commit or push was made. Stop here until Stage 3 is explicitly authorized.
