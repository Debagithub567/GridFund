# Security and test plan

## Current executable checks

- Rust serialization test compares `InitSpace` allocation with actual Anchor serialization for all four accounts: 41, 98, 106, 97 bytes.
- TypeScript test reads generated IDL to verify exactly five public instructions, argument names, account field layouts, and discriminators.
- TypeScript test derives RiderProfile, Season, Expense IDs 0 and 1, and Sponsorship IDs 0 and 1. It checks uniqueness and that merchant identity is not a PDA seed.
- LiteSVM tests load the local SBF binary and execute all four operational instructions. They verify stored fields and bumps, sequential IDs, repeated sponsorship by one merchant, a second merchant, exact remaining coverage, positive amounts, active Season, account relationships, wrong program ownership, invalid PDAs, duplicate initialization, missing merchant signature, near-`u64::MAX` overflow, and unchanged state/no new account on failure.
- The same transaction tests decode Anchor event logs and compare all four successful event schemas and values. Failed business instructions must have no emitted success event.
- Isolated Rust unit tests cover fixed-width serialization, counter overflow, and sponsorship coverage boundaries/overflow.

## Stage 3 executable checks

- `cargo test --offline --features local-test-mint` loads the local-feature SBF binary in LiteSVM, which contains the standard SPL Token program. A real `transfer_checked` CPI moves 2,000,000 base units; source and destination balances, unchanged mint supply, exact `DirectContribution` fields, unchanged profile/season/expense/sponsorship state, and no new receipt PDA are checked.
- Isolated fixtures reject zero amount, insufficient balance, wrong pinned mint, wrong decimals, wrong mint owner, wrong token program, source owner/mint/program, destination owner/mint/program, another wallet's ATA, a noncanonical rider token account, forged profile, and invalid source serialization. Each failed transaction leaves both token account data unchanged and emits no successful contribution event. A missing fan signature fails transaction construction.
- Three successful transfers by two fans verify independent events, accumulated rider balance, and no rider receiving signature. The original Stage 2 LiteSVM tests run again under the local feature and default build.
- Frontend indexing and presentation of historical donations remain for Stage 4. An event log alone is not a permanent donation aggregate. Passing local tests is not a security audit or Devnet verification.

