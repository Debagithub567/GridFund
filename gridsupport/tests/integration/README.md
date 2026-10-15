# SBF integration tests

Run `npm test` from the `gridsupport` directory. The script builds the actual GridSupport SBF program with the existing `local-test-mint` feature, executes the Mocha suite in LiteSVM, restores the default fail-closed SBF artifact, verifies that the restored binary rejects the local mint, and runs the existing TypeScript IDL tests. Run `npm run typecheck` for a type check. `npm run test:integration:run` is an internal runner for a binary already built with the local mint feature.

The fixture loads `target/deploy/gridsupport.so` into LiteSVM and builds instructions from the generated IDL. It creates real serialized standard SPL Token mint and token accounts at the local test mint address. Assertions decode program accounts and events, inspect balances, and verify account bytes after failed transactions. No mocked instruction handler is used.

| Instruction | Integration coverage |
| --- | --- |
| `initialize_rider` | Canonical profile, authority, stored bump, event, duplicate, wrong PDA, missing signature. |
| `create_season` | Fields and event, unique season, zero and maximum budget, wrong rider, wrong PDA, wrong profile program owner. |
| `add_expense` | Sequential indices and events, estimates independent of budget, zero amount, wrong PDA, unauthorized and cross-rider substitution, wrong owner, inactive season, counter overflow, no orphan account on failure. |
| `sponsor_expense` | Repeated and multiple merchants, partial and full coverage, events, zero and excess amount, wrong PDA, owner and season, missing merchant signature, coverage and counter overflow, unchanged state on failure, no SPL transfer. |
| `contribute_direct` | Exact `transfer_checked` balances, supply and event, repeat fans, zero and insufficient amount, exact source balance, approved mint and decimals, source and destination token owner/mint/program, canonical rider ATA, profile substitution, missing fan signature, cross-rider substitution, multi-instruction rollback, unchanged sponsorship state. |

The contract permits a fan-owned source token account with the approved mint even when it is not the fan's ATA; the suite verifies this actual constraint. The rider destination must be the rider's canonical ATA. Arithmetic underflow is not exercised because these five instructions do not subtract state counters or balances in program logic. LiteSVM does not establish Devnet readiness or test frontend indexing and display.
