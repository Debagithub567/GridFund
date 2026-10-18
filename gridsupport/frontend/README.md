# GridSupport frontend — shared Rider Directory

React 19, TypeScript, Vite, Framer Motion, and Solana wallet adapter. The previous Stage 4A presentation remains available through the optional Demo flag.

## Run

Use Node 22.18+ or 24. From `frontend/`, run `npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`. Set `VITE_SOLANA_CLUSTER=localnet` or `devnet`; localnet is the default. Connected mode is the presentation default; `VITE_ENABLE_DEMO=true` exposes the offline Demo switch. An optional `VITE_SOLANA_RPC_URL` overrides the RPC and can point to a privately configured Chainstack Devnet endpoint. A signing wallet must support the selected network; Phantom does not offer a custom local validator network. Never put a private key or RPC credential in a committed frontend environment file.

Routes: `/`, `/racer`, `/shop`, `/fan`. Static hosting needs an `index.html` SPA fallback. Photos and the optional victory MP4 are under `public/`.

## Connected Rider workflow

The app starts in Connected mode. On `/racer`, connect a compatible wallet and review the editable Pol Espargaró / 2026 draft: Racing tyres €500, Fuel & travel €300, Accommodation & food €200. Additional expenses can be added in the same form. **Confirm Racing Budget** signs only missing profile, season and expense transactions. Each step confirms and verifies its account before the next. A stored draft helps resume an interrupted attempt, but registration and the dashboard require verified accounts. Existing unrelated expenses stay separate from the submitted budget. Names and readable labels are browser-local metadata, not public program fields.

A verified Rider keeps the registration form visible with one compact success message and a small Expense Dashboard button. The dashboard shows required, covered and remaining amounts from verified sponsorship records. Returning to Rider or opening the dashboard triggers a fresh account read without clearing the current view.

## Discover Riders

`/shop` and `/fan` automatically query real RiderProfile accounts from the selected RPC using filtered `getProgramAccounts`. The directory validates canonical PDAs and joins Season, Expense and Sponsorship accounts. It shows only riders with a verified profile, season and at least one expense. **Discover Riders** cards show a locally known name when available, or `Rider #N`, season, sponsorship needs and verified amounts. Loading, empty, error, selection and a small refresh action are present. The RPC must support the filtered query. No manual address entry is needed.

## Shopkeeper support

Select a rider, check one or more expenses, and enter a separate EUR amount for each. The `sponsor_expense` adapter rereads remaining coverage, signs and confirms each transaction, then verifies the sponsorship and updated expense. Several selected expenses are processed sequentially; a later rejection leaves earlier verified commitments visible. Sponsorship is an in-kind promise, not a payment or proof of fulfillment. Local signatures can be copied; Devnet signatures link to Solana Explorer.

## Fan support

Select a registered rider, choose one verified expense and enter an amount in EUR. Fan uses the same `sponsor_expense` adapter as Shopkeeper, with the connected Fan wallet as signer. Success appears only after transaction confirmation and verification of the sponsorship account and updated coverage. The contract records a sponsorship and does not distinguish Fan from Shopkeeper signers; no token transfer occurs in this dashboard flow. Devnet signatures link to Solana Explorer.

## Readable metadata and presentation

Season and expense descriptions are SHA-256 hashes on-chain. This browser stores readable season and expense labels under cluster, program and PDA keys, and checks stored season/description hashes against chain data. Rider names are browser-local and cannot be verified from this account schema; unknown riders retain numbered fallbacks. Both Shopkeeper and Fan expense support is counted once from verified sponsorship accounts. Demo fixtures remain available with `VITE_ENABLE_DEMO=true`; that flag exposes the old Demo controls for offline rehearsal. Community Effect is illustrative and does not write to Solana. The victory MP4 is absent, so the existing fallback plays.

The [judge demo runbook](../docs/architecture/JUDGE_DEMO_RUNBOOK.md) gives local commands, the expense-sponsorship walkthrough, recovery and browser wallet limitations.

## Verify

From `frontend/`: `npm test` and `npm run build` (the latter includes TypeScript). From the repository root: `npm run typecheck`, `npm run test:idl`, and `npm test` for the Anchor/LiteSVM suite.

To run the full Rider, Shop and Fan RPC workflow test, start an isolated local validator from the repository root:

```sh
bash scripts/start-local-fan-validator.sh /tmp/gridsupport-fan-step5
```

In another terminal, from `frontend/`, run `GRIDSUPPORT_LOCAL_RPC=http://127.0.0.1:8899 GRIDSUPPORT_LOCAL_MINT_AUTHORITY=/tmp/gridsupport-fan-step5/mint-authority.json npm run test:local-validator`. The test generates and funds temporary test keypairs only on that local validator. It does not use the configured CLI wallet. Stop the validator with Ctrl-C; the launcher restores the default SBF build. The [Step 5 local guide](../docs/architecture/STAGE4B_STEP5_LOCAL_GUIDE.md) covers funding, balances, and the Phantom browser limitation.

The frontend bundles the generated IDL and type in `src/chain/`. Sync both after any future Anchor interface change; frontend tests compare the bundled IDL to `target/idl/gridsupport.json`.

The dated checkpoints below describe earlier stages. The final local judge flow and current mint setup are documented above and in the runbook.

## Step 3 verification (17 October 2026)

- Frontend regression suite: 16 passed, 0 failed. This includes Demo amount/persistence rules, the Community Impact interaction, Shop/Fan and Connected dashboard behavior, IDL/account decoding, wallet transaction progress, delayed account visibility, and confirmation failure.
- Frontend production build and TypeScript check: passed. Vite reports one bundle-size advisory for the main JavaScript chunk.
- Root typecheck: passed. Root IDL suite: 3 passed, 0 failed. LiteSVM integration suite: 24 passed, 0 failed. Rider structural Rust suite: 5 passed, 0 failed.
- Fresh isolated local-validator workflow: 1 passed, 0 failed. It confirmed RiderProfile, Season and two distinct custom-amount Expense transactions and checked duplicate, invalid input, wrong signer/PDA and rejected-wallet cases. Temporary test wallets were funded only by that validator, which was stopped after the run.

The tests use a generated test wallet, not a browser wallet extension. A manual wallet-extension pass and Devnet deployment remain outside this local verification.

## Step 4 verification (17 October 2026)

- Frontend regression suite: 18 passed, 0 failed, including Shop adapter account order, confirmation/verification failure, duplicate-click prevention, Connected coverage display, and Step 3 Rider regressions.
- Isolated local validator: 2 passed, 0 failed (Rider workflow and Shop workflow). The Shop case confirmed three sponsorship transactions and checked custom cents, PDA sequence, coverage and remaining amounts, repeated/full sponsorship, signer and PDA failures, wrong season, wallet rejection, and matching Rider/Shop reads.
- Frontend TypeScript and production build, root typecheck, root IDL suite (3 passed), LiteSVM integration suite (24 passed), and Rider structural suite (5 passed): passed.

Only temporary validator wallets were used. No Devnet deployment or browser wallet-extension transaction was performed.

## Step 5 verification (17 October 2026)

- Frontend regression suite: 20 passed, 0 failed, including Fan amount parsing, Connected Fan UI, Demo isolation and existing Rider/Shop regressions. Frontend TypeScript and production build passed.
- Isolated local validator: 3 passed, 0 failed (Rider, Shop and Fan workflows). The Fan case confirmed a `1.234432` gsUSDC transfer: fan `100.000000 → 98.765568`, rider `0 → 1.234432`; merchant coverage stayed at zero. It also exercised the requested Fan rejection cases.
- Root typecheck passed. IDL suite: 3 passed, 0 failed; LiteSVM integration suite: 24 passed, 0 failed; default-mint regression: 1 passed, 0 failed; Rider/Shop structural Rust suite: 5 passed, 0 failed.

Only temporary local validator wallets were used. Phantom has no custom local validator RPC setting, so a browser wallet-extension transaction was not performed. No Devnet deployment was made.

## Shared Rider Directory verification (17 October 2026)

- Frontend regression suite: 24 passed, 0 failed, 0 skipped. This includes IDL-filtered zero/one/multiple-rider discovery, deterministic ordering, coverage refresh, RPC error and fallback states, wallet-switch clearing, Connected UI selection, Demo isolation and existing transaction regressions.
- Isolated local validator: 4 passed, 0 failed, 0 skipped. The new case discovered two real RiderProfiles, selected one for a confirmed Shop sponsorship and Fan transfer, and verified that merchant coverage remained unchanged by the Fan transfer.
- Frontend TypeScript and production build passed. Root typecheck passed; LiteSVM integration: 24 passed, default-mint: 1 passed, IDL: 3 passed, Rust structural: 5 passed. The default SBF build was restored after local testing.

No browser wallet signing pass or Chainstack/Devnet query was performed. The configured Devnet program must exist at the bundled program ID, and the selected RPC must support filtered `getProgramAccounts`.
