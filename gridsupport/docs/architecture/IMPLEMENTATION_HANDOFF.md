# Stage 1 implementation handoff

## Workspace and files

The separate `gridsupport/` Anchor workspace contains one program, `gridsupport`. The pre-existing sibling `gridfund/` workspace was not modified. There were no tracked files in the repository before this work, and no commit or push was made.

- Workspace: `Anchor.toml`, `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`.
- Program: `programs/gridsupport/Cargo.toml`; `src/lib.rs`, `constants.rs`, `errors.rs`, `events.rs`; four files in `src/state/`; five files in `src/instructions/` and their `mod.rs` files.
- Tests: `tests/architecture.spec.ts` and `programs/gridsupport/tests/structural.rs`; the account serialization unit test is in `src/state/mod.rs`.
- Documentation: all six files in `docs/architecture/`, plus `scripts/README.md`.

The program ID `H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ` was generated for this local workspace. Its keypair is ignored at `target/deploy/gridsupport-keypair.json`; protect or replace it before any deployment. Generated `target/idl/gridsupport.json` and `target/deploy/gridsupport.so` are also ignored and must be rebuilt in a new checkout.

## Architecture delivered

Four fixed-width Anchor accounts have allocation constants and tested serialized sizes: RiderProfile 41, Season 98, Expense 106, Sponsorship 97 bytes. The five exact public instruction interfaces and their PDA, signer, owner, mint, token account, and ATA constraints compile. All handlers return `NotImplemented`; no account state transition, token transfer, or success event occurs. A failed `init` instruction rolls back its attempted account creation atomically.

There are five future event definitions and the specified error variants. `APPROVED_MOCK_USDC_MINT` is `None`, so every direct contribution is deliberately rejected before it could become operational. Standard SPL Token types and `Program<Token>` are used. For Anchor SPL 1.2.0 IDL generation, the `idl-build` feature enables `anchor-spl/token_2022` only to compile that dependency's IDL helper; the program uses no Token-2022 account or program.

## Verification run on 2026-10-13

| Command | Actual result |
| --- | --- |
| `cargo fmt --all -- --check` | Passed. |
| `cargo check --offline` | Passed. |
| `cargo test --offline` | Passed: 1 Rust layout test and 3 LiteSVM structural transaction tests. |
| `npm run typecheck` | Passed. |
| `npm test` | Passed: 3 TypeScript IDL, layout, and PDA tests. |
| `anchor build --arch v0 --tools-version v1.54` | Passed; generated a 192 KB SBF binary and IDL with exactly five instructions, four accounts, five events, and 19 error variants. |
| `anchor build` | Failed in local `cargo-build-sbf` toolchain setup: `generate_toolchain_name` panicked because the default v1.57 platform-tools cache lacks `rust/bin/rustc`. Use the explicit v1.54 command above on this machine. |

The local LiteSVM runner rejected the default v3 SBF artifact with `Instruction(InvalidAccountData)` at load time; the v0 build loads and all structural tests pass. This is a local test-toolchain compatibility finding, not a program transaction failure. The earlier TypeScript `tsx --test` launcher also failed because the sandbox disallowed its IPC pipe; `node --import tsx --test` is the working script.

## Stage 2 work, after approval

1. Implement initialization of profile, season, and expense fields with the specified IDs, active status, zero counters, bumps, positive expense cost, and events.
2. Implement sponsorship creation as an in-kind declaration. Check active Season, positive amount, remaining capacity, and checked addition for coverage and counters. Record merchant and timestamp; emit the event. Do not transfer tokens or add a rider approval step.
3. Create and verify a dedicated six-decimal Devnet standard SPL mock-USDC mint outside this program. Pin the verified address as `Some(pubkey!(...))`, rebuild, then implement direct `transfer_checked`, positive amount enforcement, and the event. Do not add a receipt PDA, faucet, or minting instruction.
4. Add the deferred behavior and security tests listed in `SECURITY_TEST_PLAN.md`. Keep simulated merchant coverage entirely in frontend state and separate euro-cent coverage from token amounts.

No deployment, mint creation, wallet funding, frontend, or later-stage business logic was performed. Passing tests and builds do not constitute a security audit.
