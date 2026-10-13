# GridSupport V1 Stage 3 implementation handoff

## Scope and files

Stage 3 is implemented in the existing `gridsupport/` workspace. The neighboring `gridfund/` workspace was not touched. No commit, push, Devnet mint, deployment, or frontend work was performed.

Changed program files: `programs/gridsupport/Cargo.toml`, `src/constants.rs`, `src/lib.rs`, `src/instructions/contribute_direct.rs`, and new `tests/contributions.rs`. Changed docs: `PROJECT_CONTEXT.md`, `PROTOCOL_SPEC.md`, `SECURITY_TEST_PLAN.md`, `OPEN_QUESTIONS.md`, this handoff, `MOCK_USDC_SETUP.md`, and `scripts/README.md`. No dependency or custom account layout was changed.

## Onchain behavior

`contribute_direct(amount)` now calls the standard SPL Token `transfer_checked` CPI. The fan signer is the transfer authority. Anchor enforces the canonical program-owned RiderProfile PDA; an approved mint address, six decimals, and standard Token program ownership; source token owner = fan and source mint = approved mint; destination token owner = stored rider, destination mint = approved mint, and destination address = the rider's canonical standard SPL ATA. `amount` must be positive and is in token base units. The CPI transfers directly from fan to rider, with no escrow, fee, minting, burn, SOL transfer, or sponsorship coverage change. `DirectContribution(fan, rider, mint, amount)` is emitted only after the CPI succeeds. A failed transaction rolls back token movement and emits no successful contribution event.

The four existing custom accounts and PDA seeds are unchanged: RiderProfile 41 bytes, Season 98 bytes, Expense 106 bytes, Sponsorship 97 bytes. The IDL still has five public instructions, four custom accounts, and five events. The four Stage 2 operational instructions continue to work.

## Mint configuration

The default build pins `APPROVED_MOCK_USDC_MINT = None`, deliberately rejecting every mint. The explicit `local-test-mint` Cargo feature pins `[77; 32]`; LiteSVM backs this address with a six-decimal standard SPL Mint account and funded token accounts. The local fixture is not a Devnet mint. Build with the feature only for local contribution tests. Rebuild without it before reviewing any deployable artifact.

No verified Devnet mint was present in configuration and none was created. `MOCK_USDC_SETUP.md` gives exact operator CLI commands, required signer, verification steps, approximate rent and fee budget, and a release gate. A verified dedicated Devnet mint must be created with explicit approval, pinned in the default constant, reviewed, rebuilt, tested, and deployed before Devnet contributions can work. Never substitute real USDC or deploy a local-feature binary.

## Verification on 2026-10-13

| Command | Actual result |
| --- | --- |
| `anchor build --arch v0 --tools-version v1.54 -- --features local-test-mint` | Passed; produced the local-test SBF artifact. |
| `cargo test --offline --features local-test-mint` | Passed: 3 Rust unit, 6 contribution integration, and 5 Stage 2 integration tests (14 total). |
| `cargo fmt --all -- --check` | Passed. |
| `cargo check --offline` | Passed. |
| `anchor build --arch v0 --tools-version v1.54` | Passed; restored the default fail-closed SBF artifact. |
| `cargo test --offline` | Passed: 3 Rust unit and 5 Stage 2 integration tests (8 total); feature-gated contribution tests do not run in the default configuration. |
| `npm run typecheck` | Passed. |
| `npm test` | Passed: 3 IDL/layout/PDA tests. |

The six contribution tests cover an exact 2,000,000-unit transfer, balance and supply checks, event fields, existing sponsorship state, multiple fans, wrong amount/mint/decimals/program/owner/account/ATA/profile, insufficient funds, missing signature, invalid serialization, and failure atomicity. The missing-signature check fails transaction construction because the message requires the fan signature. No failed or skipped enabled tests remain. The default build intentionally skips the feature-gated contribution suite.

## Stage 4 handoff and remaining gate

Stage 4 can consume the existing IDL and confirmed transaction signature to show immediate fan recognition. The frontend must derive the rider's canonical ATA for the pinned mint and standard Token program, display mock-USDC base units as six-decimal demo tokens, and keep them separate from euro-cent in-kind sponsorship coverage. Event logs alone do not provide verified lifetime donation totals; that needs indexing or another explicit data source. No frontend was implemented here.

Devnet readiness remains blocked by creation and independent verification of a dedicated mint, pinning its real address in the default build, choosing/protecting the Devnet program keypair, reviewing the default artifact, and an authorized Devnet deployment and transaction check. Local-test readiness is complete. Stop after Stage 3; Stage 4 requires explicit authorization.
