# GridSupport local judge demo

## Start

Use two terminals. From the repository root, start the isolated validator. It builds with `local-test-mint`, loads the existing program ID and local mint, and restores the default build when stopped.

```sh
bash scripts/start-local-fan-validator.sh /tmp/gridsupport-judge-final
```

In terminal 2, run the real transaction walkthrough with temporary Rider, Shop and Fan keypairs. The test funds them only from the local validator, creates a local fan token account, mints local gsUSDC and prints confirmed signatures.

```sh
cd frontend
GRIDSUPPORT_LOCAL_RPC=http://127.0.0.1:8899 GRIDSUPPORT_LOCAL_MINT_AUTHORITY=/tmp/gridsupport-judge-final/mint-authority.json npm run test:local-validator
```

For the UI, run the following in terminal 2 after the test, or in a third terminal. Open the Vite URL it prints. Do not put wallet secrets or private RPC credentials in Vite variables. The default presentation hides Demo controls; set `VITE_ENABLE_DEMO=true` only for an explicitly labelled offline UI rehearsal.

```sh
cd frontend
VITE_SOLANA_CLUSTER=localnet VITE_SOLANA_RPC_URL=http://127.0.0.1:8899 npm run dev
```

The test generates ephemeral Rider, Shop and Fan keypairs and does not export them for a browser wallet. For a separate manual session with a compatible localnet wallet, use the temporary keypair and funding instructions in [the local fixture guide](STAGE4B_STEP5_LOCAL_GUIDE.md). Restarting the validator resets its ledger.

## Two-minute walkthrough

1. **Rider:** Open `/racer` with a wallet that can sign on the selected local validator. Review the editable prefill: Pol Espargaró, season 2026, tyres €500, fuel and travel €300, accommodation and food €200. Click **Confirm Racing Budget**. Approve each of the five separate transactions. The page shows each submitted, confirmed and verified step; the resulting profile, season and three expense PDAs appear in the refreshed account view. Refresh or click again to check that existing matching steps are skipped. If a step is rejected, completed accounts remain; retry after reviewing the draft.
2. **Shopkeeper:** Open `/shop` in the same browser profile. **Discover Riders** loads automatically. Select Pol Espargaró, check **Accommodation & food**, enter €50 and record the in-kind commitment. The confirmation shows the recipient, expense, exact amount, verified status and signature. The expense's merchant coverage becomes €50. Several selected expenses are submitted one at a time; any prior verified commitments remain visible if a later step fails.
3. **Fan:** Open `/fan`, select the same rider and enter 50 gsUSDC. The Fan chooses no expense. A local fan token account must hold at least 50 gsUSDC and enough SOL for fees and possibly the rider ATA. The confirmed result shows the recipient, 50 gsUSDC, signature, and a copy action. Fan balance falls by 50; the rider's canonical ATA rises by 50. Merchant expense coverage remains €50.
4. **Rider progress:** Return to `/racer` and refresh. Verify budget €1,000; merchant in-kind €50; locally recorded and reverified Fan contribution 50 gsUSDC; presentation combined support €100; remaining €900; progress 10%. The 1 gsUSDC = €1 convention is presentation only, not an exchange rate or an on-chain valuation. Current ATA balance is not used as donation history.
5. **Community Help:** Click **Community Help**. The illustrative animation moves through the racing dream, tyres, fuel and travel, accommodation and food, Fan support, and 100% presentation progress. Use Replay and Back. It sends no transaction and changes no real balances. `/media/rider-victory.mp4` is currently absent, so the existing six-second fallback appears before **EVERY RIDER DESERVES A CHANCE. THANK YOU 🏁**.

## Verify and recover

The local-validator test checks canonical PDAs, confirmation, exact EUR cents and token base units, source and destination balances, Rider Directory discovery, rejected signatures, partial Rider setup and safe retry, no duplicate creation, unchanged merchant coverage after Fan transfer, and a deduplicated signature receipt. It passed **5 tests, 0 failed, 0 skipped** on 17 October 2026. Its judge case submits three Rider setup transactions, rejects the fourth, resumes the remaining two, then confirms Shop and Fan transactions. These are real local-validator transactions using temporary keypairs, not browser wallet approvals.

For a transaction, copy its signature from the UI or test output and inspect it with `solana confirm <SIGNATURE> --url http://127.0.0.1:8899 --verbose`. Use the explicit local URL; the configured CLI endpoint may point to Devnet. On an interrupted or rejected UI transaction, refresh accounts and inspect the step list before retrying. A transaction reported as confirmed but not verified requires account inspection; it must not be presented as success. Do not repeat a Shop or Fan submission solely because the browser was closed before its verification finished.

Readable names and expense titles are browser-local metadata scoped to network, program and account. The program stores hashes, not names. Another browser may display `Rider #N`, `Racing season` and numbered expenses. The Rider dashboard discovers and verifies direct Fan transfers from the Rider token account's latest 100 transactions, plus older signatures saved in that browser. It uses the transaction instruction and token balance metadata, and does not count ordinary token transfers as GridSupport Fan support. Keep the same browser profile across roles when you want readable names and expense titles.

Phantom does not offer a custom localhost Solana network. No Phantom browser signature was verified in this local run; the actual transaction proof comes from the isolated local-validator test wallets. A browser recording of the full signed flow requires a wallet that supports this validator or a later, separately authorized Devnet deployment. A read-only browser view can show accounts created by the local test, but the test's temporary keypairs are not imported into Phantom. The missing MP4 remains a fallback, not a produced film.

## Later Devnet checklist — separate approval required

Confirm the default program build pins `Eu5ZdwKKpSNej1koShWYBm7SKoPE2utvtb3yLWSjRxf1` (six decimals, standard SPL Token) and excludes `local-test-mint`; verify the deployment keypair matches `H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ`; review the Devnet RPC, wallet funding and token distribution plan; obtain explicit authorization to deploy; then run a real Phantom Devnet browser pass for Rider, Shop, Fan, refresh, Explorer and failure states. None of these Devnet steps were performed here.
