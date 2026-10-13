# Security and test plan

## Current executable checks

- Rust serialization test compares `InitSpace` allocation with actual Anchor serialization for all four accounts: 41, 98, 106, 97 bytes.
- TypeScript test reads generated IDL to verify exactly five public instructions, argument names, account field layouts, and discriminators.
- TypeScript test derives RiderProfile, Season, Expense IDs 0 and 1, and Sponsorship IDs 0 and 1. It checks uniqueness and that merchant identity is not a PDA seed.
- LiteSVM tests load the local SBF binary and execute all four operational instructions. They verify stored fields and bumps, sequential IDs, repeated sponsorship by one merchant, a second merchant, exact remaining coverage, positive amounts, active Season, account relationships, wrong program ownership, invalid PDAs, duplicate initialization, missing merchant signature, near-`u64::MAX` overflow, and unchanged state/no new account on failure.
- The same transaction tests decode Anchor event logs and compare all four successful event schemas and values. Failed business instructions must have no emitted success event.
- Isolated Rust unit tests cover fixed-width serialization, counter overflow, and sponsorship coverage boundaries/overflow.

## Stage 3 behavior tests to implement later

- Use a pinned six-decimal dedicated Devnet or local test mint: contribute 2 mock USDC (2,000,000 base units), verify `transfer_checked` balances and `DirectContribution` event. Reject wrong mint, decimals, token program, source owner, source mint, wrong rider ATA, insufficient balance, and zero amount. Ensure no donation receipt PDA appears.
- Verify simulated sponsorships never create transactions or appear in verified coverage; euro cents and token units stay separate in UI calculations.

The Stage 3 cases are specifications, not passing Stage 2 tests. A passing build or test suite is not a security audit.

