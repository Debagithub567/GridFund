# GridSupport local judge demo

## Start

Use two terminals. From the repository root, start the isolated validator. It builds with `local-test-mint`, loads the existing program ID and local mint, and restores the default build when stopped.

```sh
bash scripts/start-local-fan-validator.sh /tmp/gridsupport-judge-final
```

In terminal 2, run the transaction tests with temporary Rider, Shopkeeper and Fan keypairs. The current Fan expense-support case uses the same `sponsor_expense` instruction as Shopkeeper. Legacy direct-token tests remain in the isolated suite for the existing contract instruction.

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

1. **Rider:** Open `/racer` with a wallet that can sign on the selected network. Review the editable prefill: Pol Espargaró, season 2026, tyres €500, fuel and travel €300, accommodation and food €200. Click **Confirm Racing Budget** for a new wallet and approve each required transaction. A verified wallet shows one compact **Rider registered successfully!** state and the Expense Dashboard button. Completed accounts are recognized on return, with no duplicate signing. A rejected step can be resumed after reviewing the draft.
2. **Shopkeeper:** Open `/shop` in the same browser profile. **Discover Riders** loads automatically. Select Pol Espargaró, check **Accommodation & food**, enter €50 and record the in-kind commitment. The confirmation shows the recipient, expense, exact amount, verified status and signature. The expense's merchant coverage becomes €50. Several selected expenses are submitted one at a time; any prior verified commitments remain visible if a later step fails.
3. **Fan:** Open `/fan`, select the same Rider and a verified racing expense, enter a EUR amount and click **Support Rider**. Approve the sponsorship transaction in Phantom on Devnet. The confirmation appears after the sponsorship account and expense coverage are verified, and links to the real Solana Explorer transaction. The signer is the Fan wallet; the program stores a sponsorship without a role label. This action does not transfer tokens.
4. **Rider progress:** Return to `/racer`, open **Expense Dashboard**, and check the verified expense coverage. If a €500 tyre expense has €60 from Shopkeeper and €50 from Fan, its verified coverage is €110 and remaining need is €390. The original budget and any additional €50 test expense remain separate.
5. **Community Effect:** Click **Community Effect**. The illustrative cinematic sequence and six-second video fallback play without sending a transaction or changing verified coverage. Return to the dashboard to see the same on-chain totals.

## Verify and recover

The isolated validator suite checks canonical PDAs, confirmation, exact EUR cents, Rider discovery, rejected signatures, partial Rider setup and safe retry, and both Shopkeeper and Fan wallets signing `sponsor_expense` for the same Rider expense. Legacy token-instruction cases remain separate. These are local-validator transactions using temporary keypairs, not browser Phantom approvals.

For a transaction, copy its signature from the UI or test output and inspect it with `solana confirm <SIGNATURE> --url http://127.0.0.1:8899 --verbose`. Use the explicit local URL; the configured CLI endpoint may point to Devnet. On an interrupted or rejected UI transaction, refresh accounts and inspect the step list before retrying. A transaction reported as confirmed but not verified requires account inspection; it must not be presented as success. Do not repeat a Shop or Fan submission solely because the browser was closed before its verification finished.

Readable names and expense titles are browser-local metadata scoped to network, program and account. The program stores hashes, not names. Another browser may display `Rider #N`, `Racing season` and numbered expenses. Expense coverage is read from verified sponsorship accounts and does not infer a Shopkeeper/Fan role from the signer.

Phantom does not offer a custom localhost Solana network. No Phantom browser signature was verified in this local run; the transaction proof comes from the isolated validator test wallets. A browser recording of the signed flow must use the existing configured Devnet program and Chainstack RPC with separately authorized test transactions. The missing MP4 remains a fallback.

## Manual Devnet browser check

Using the existing Chainstack Devnet configuration, verify Rider registration recognition, Shopkeeper sponsorship, Fan sponsorship, background Rider refresh, the real Explorer links, and the unchanged Community Effect balances in Phantom. Do not redeploy the existing program. No Devnet account or transaction was changed by this implementation.
