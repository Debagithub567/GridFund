# Security and test plan

## Stage 1 structural checks

- Rust serialization test compares `InitSpace` allocation with actual Anchor serialization for all four accounts: 41, 98, 106, 97 bytes.
- TypeScript test reads generated IDL to verify exactly five public instructions, argument names, account field layouts, and discriminators.
- TypeScript test derives RiderProfile, Season, Expense IDs 0 and 1, and Sponsorship IDs 0 and 1. It checks uniqueness and that merchant identity is not a PDA seed.
- LiteSVM transaction tests load the local SBF binary. They check that valid initialization reaches `NotImplemented` and creates no account, a wrong RiderProfile PDA fails validation, and a profile with the wrong program owner or stored rider fails before the handler. The test checks absence of created accounts; it does not assert exact fee behavior.

## Stage 2 behavior tests to implement then

- Create profile, active Season (ID 1, expense count 0), and positive Expense (ID 0, zero coverage and count). Check duplicate fixed PDA and unauthorized rider rejection.
- Sponsor €5 (500 cents), repeat from the same merchant, verify distinct permanent records and exact coverage/count updates. Reject zero amount, an amount above remaining capacity, fully covered expense, inactive Season, wrong Season–Expense relation, overflow, and wrong merchant signature.
- Use a pinned six-decimal dedicated Devnet or local test mint: contribute 2 mock USDC (2,000,000 base units), verify `transfer_checked` balances and `DirectContribution` event. Reject wrong mint, decimals, token program, source owner, source mint, wrong rider ATA, insufficient balance, and zero amount. Ensure no donation receipt PDA appears.
- Verify simulated sponsorships never create transactions or appear in verified coverage; euro cents and token units stay separate in UI calculations.

The deferred cases are specifications, not passing Stage 1 tests. A passing build or test suite is not a security audit.

