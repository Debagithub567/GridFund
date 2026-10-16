# GridSupport frontend — Stage 4B Step 3

React 19, TypeScript, Vite, Framer Motion, and Solana wallet adapter. The approved Stage 4A presentation remains available in Demo mode.

## Run

Use Node 22.18+ or 24. From `frontend/`, run `npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`. Set `VITE_SOLANA_CLUSTER=localnet` or `devnet`; localnet is the default. An optional `VITE_SOLANA_RPC_URL` overrides the RPC. Set your wallet extension to the same network. `VITE_RIDER_PUBLIC_KEY` can preload the public Shop and Fan read views. Never put a private key in a frontend environment file.

Routes: `/`, `/racer`, `/shop`, `/fan`. Static hosting needs an `index.html` SPA fallback. Photos and the optional victory MP4 are under `public/`.

## Connected Rider workflow

The top-right button connects Phantom or another supported detected wallet. On `/racer`, choose **Connected**. The dashboard reads the connected wallet's canonical RiderProfile, Season, Expense and Sponsorship accounts. If no profile exists, click **Create Rider Profile**. Then enter a season title and budget and click **Create Season**. V1 allows one season per rider. The season budget is a planning target; the program does not cap expenses with it. Add an expense with a title, category, description and custom EUR amount. Confirmed expenses cannot be edited.

Every Rider action requests a wallet signature. The modal shows approval, submission, confirmation, and account verification progress. Success appears only after the transaction confirms and the new account is fetched. The signature links to the configured network in Solana Explorer. Localnet uses a custom Explorer URL; a locally running RPC is required to inspect it. The rider wallet needs enough SOL for account rent and fees. Devnet writes require the existing program ID to be deployed on Devnet; this step does not deploy it.

Shop and Fan Connected views read public Rider data by wallet address. Merchant in-kind coverage is taken from on-chain Expense accounts. Direct fan mock-USDC transfers remain separate from expense coverage. Their Connected mode transaction buttons are disabled until Step 4.

## Readable metadata

The program stores SHA-256 hashes, not readable text. This MVP keeps season titles and expense titles/descriptions in a browser `localStorage` registry keyed by cluster, program ID, account type, and the canonical account PDA. The bytes hashed are the UTF-8 encoding of the trimmed input text, with no prefix, Unicode normalization, or trailing newline. The season title is checked against its on-chain `title_hash`; the expense description is checked against `description_hash`, and its category must match. The expense title itself cannot be verified because the current account has no title hash. If a record is absent, corrupt, or fails hash verification, the UI displays the on-chain expense number and category/hash fallback. Metadata does not sync across devices, browsers, or cleared storage. A durable public metadata service belongs in a later step.

Demo mode uses its existing, separate `gridsupport-stage4a-v1` browser state. Switching modes never promotes demo support into confirmed account totals. Reset Demo only resets the preview. Community Impact remains an illustrative animation; it does not submit transactions or alter chain state.

## Verify

From `frontend/`: `npm test` and `npm run build` (the latter includes TypeScript). From the repository root: `npm run typecheck`, `npm run test:idl`, and `npm test` for the Anchor/LiteSVM suite.

To run the optional full RPC workflow test, start an isolated local validator from the repository root with the existing SBF artifact:

```sh
solana-test-validator --ledger "$(mktemp -d /tmp/gridsupport-step3.XXXXXX)" \
  --bpf-program H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ \
  target/deploy/gridsupport.so --rpc-port 8899
```

In another terminal, from `frontend/`, run `GRIDSUPPORT_LOCAL_RPC=http://127.0.0.1:8899 npm run test:local-validator`. The test generates and funds temporary test keypairs only on that local validator. It does not use the configured CLI wallet. Stop the validator when finished.

The frontend bundles the generated IDL and type in `src/chain/`. Sync both after any future Anchor interface change; frontend tests compare the bundled IDL to `target/idl/gridsupport.json`.
