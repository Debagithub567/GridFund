# GridSupport frontend — Stage 4B Step 5

React 19, TypeScript, Vite, Framer Motion, and Solana wallet adapter. The approved Stage 4A presentation remains available in Demo mode.

## Run

Use Node 22.18+ or 24. From `frontend/`, run `npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`. Set `VITE_SOLANA_CLUSTER=localnet` or `devnet`; localnet is the default. An optional `VITE_SOLANA_RPC_URL` overrides the RPC. A signing wallet must support the selected network; Phantom does not offer a custom local validator network. `VITE_RIDER_PUBLIC_KEY` can preload the public Shop and Fan read views. Never put a private key in a frontend environment file.

Routes: `/`, `/racer`, `/shop`, `/fan`. Static hosting needs an `index.html` SPA fallback. Photos and the optional victory MP4 are under `public/`.

## Connected Rider workflow

The top-right button connects Phantom or another supported detected wallet. On `/racer`, choose **Connected**. The dashboard reads the connected wallet's canonical RiderProfile, Season, Expense and Sponsorship accounts. If no profile exists, click **Create Rider Profile**. Then enter a season title and budget and click **Create Season**. V1 allows one season per rider. The season budget is a planning target; the program does not cap expenses with it. Add an expense with a title, category, description and custom EUR amount. Confirmed expenses cannot be edited.

Every Rider action requests a wallet signature. The modal shows approval, submission, confirmation, and account verification progress. Success appears only after the transaction confirms and the new account is fetched. The signature links to the configured network in Solana Explorer. Localnet uses a custom Explorer URL; a locally running RPC is required to inspect it. The rider wallet needs enough SOL for account rent and fees. Devnet writes require the existing program ID to be deployed on Devnet; this step does not deploy it.

After verification, Connected mode replaces its account snapshot automatically, including the new profile, season or expense. The new expense becomes selected. A rejected wallet request or failed confirmation does not show success. If a wallet changes while a transaction is in flight, reconnect the original rider wallet and refresh its accounts before continuing.

Shop and Fan Connected views read public Rider data by wallet address. Merchant in-kind coverage is taken from on-chain Expense accounts. Direct fan mock-USDC transfers remain separate from expense coverage.

## Connected Shop sponsorship workflow

On `/shop`, choose **Connected**, connect a merchant wallet, enter the rider's public wallet address, and load their on-chain expenses. Select an expense and enter any positive EUR amount with up to two decimal places, no greater than the displayed remaining merchant coverage. **Record Sponsorship** asks the merchant wallet to sign and pay the Solana transaction fee. It records an in-kind commitment; the instruction transfers no SOL or tokens and does not verify delivery of goods or services. The rider does not sign.

The app re-reads the expense immediately before building the instruction, derives the next canonical sponsorship PDA from its current sponsorship count, confirms the signature, and re-reads both the sponsorship and expense before showing **Sponsorship Recorded!**. The modal shows the actual signature, network and Explorer link. A rejected signature, failed transaction, changed wallet, or unverified account cannot show success. Failed submissions trigger an account refresh, including when another merchant has filled the expense first. A fully covered expense cannot be sponsored again. Repeated valid commitments by the same merchant create separate sponsorship accounts.

Shop and Rider views use the same program accounts for merchant coverage; Demo support and fan token transfers are excluded. Successful Shop submissions refresh the current dashboard immediately. Other sessions and wallets can use **Refresh Accounts** or wait for the 20-second account poll. This is polling, not real-time synchronization.

## Connected Fan contribution workflow

On `/fan`, choose **Connected**, connect a fan wallet, and load the recipient RiderProfile by public wallet address. The recipient address and current fan/rider token account balances appear above the amount field. Enter a positive mock-USDC amount with at most six decimal places and click **Support Rider**. The fan needs local SOL for fees and, if missing, creation of the rider's canonical associated token account (ATA). The app never mints tokens to a connected wallet.

The local build approves only the dedicated six-decimal standard SPL Token mint `6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS`. The default program build has no approved mint; Fan writes are unavailable on Devnet until a reviewed mint and program deployment are separately approved. The app checks the mint, fan source account and rider ATA, then requests one wallet signature for ATA creation if needed and `contribute_direct`. It waits for confirmation, verifies the exact source debit and destination credit in that transaction's token balance metadata, and refreshes both displayed balances before showing **Contribution Transferred!** with the real signature and Explorer link. A rejected or unverifiable transaction cannot show success.

Expense selection in Connected Fan mode is optional presentation context. The transfer goes directly to the rider wallet and creates no expense attribution, merchant sponsorship, EUR valuation or merchant coverage. The rider ATA balance is a current balance, not a lifetime contribution total. Other sessions can use **Refresh Accounts** or wait for the 20-second poll.

## Readable metadata

The program stores SHA-256 hashes, not readable text. This MVP keeps season titles and expense titles/descriptions in a browser `localStorage` registry keyed by cluster, program ID, account type, and the canonical account PDA. The bytes hashed are the UTF-8 encoding of the trimmed input text, with no prefix, Unicode normalization, or trailing newline. The season title is checked against its on-chain `title_hash`; the expense description is checked against `description_hash`, and its category must match. The expense title itself cannot be verified because the current account has no title hash. If a record is absent, corrupt, or fails hash verification, the UI displays the on-chain expense number and category/hash fallback. Metadata does not sync across devices, browsers, or cleared storage. A durable public metadata service belongs in a later step.

Demo mode uses its existing, separate `gridsupport-stage4a-v1` browser state. Switching modes never promotes demo support into confirmed account totals. Reset Demo only resets the preview. Community Impact remains an illustrative animation; it does not submit transactions or alter chain state.

## Verify

From `frontend/`: `npm test` and `npm run build` (the latter includes TypeScript). From the repository root: `npm run typecheck`, `npm run test:idl`, and `npm test` for the Anchor/LiteSVM suite.

To run the full Rider, Shop and Fan RPC workflow test, start an isolated local validator from the repository root:

```sh
bash scripts/start-local-fan-validator.sh /tmp/gridsupport-fan-step5
```

In another terminal, from `frontend/`, run `GRIDSUPPORT_LOCAL_RPC=http://127.0.0.1:8899 GRIDSUPPORT_LOCAL_MINT_AUTHORITY=/tmp/gridsupport-fan-step5/mint-authority.json npm run test:local-validator`. The test generates and funds temporary test keypairs only on that local validator. It does not use the configured CLI wallet. Stop the validator with Ctrl-C; the launcher restores the default SBF build. The [Step 5 local guide](../docs/architecture/STAGE4B_STEP5_LOCAL_GUIDE.md) covers funding, balances, and the Phantom browser limitation.

The frontend bundles the generated IDL and type in `src/chain/`. Sync both after any future Anchor interface change; frontend tests compare the bundled IDL to `target/idl/gridsupport.json`.

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
