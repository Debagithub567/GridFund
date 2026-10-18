# Stage 4B Step 5 local test guide

Use only temporary wallets and the isolated validator. The fixture mint `6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS` is six-decimal standard SPL Token, approved only by the `local-test-mint` build. It is not real USDC. Nothing here deploys to Devnet.

## Start and verify the isolated chain

From the repository root, run this in terminal 1:

```sh
bash scripts/start-local-fan-validator.sh /tmp/gridsupport-fan-step5
```

The launcher writes `/tmp/gridsupport-fan-step5/mint-authority.json` and `mint.json`, loads the local program, and keeps the validator running at `http://127.0.0.1:8899`. Its ledger resets on each start. From terminal 2:

```sh
solana account 6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS --url http://127.0.0.1:8899
cd frontend
GRIDSUPPORT_LOCAL_RPC=http://127.0.0.1:8899 GRIDSUPPORT_LOCAL_MINT_AUTHORITY=/tmp/gridsupport-fan-step5/mint-authority.json npm run test:local-validator
```

The test creates temporary Rider, Shop and Fan keypairs, RiderProfiles, Seasons, Expenses, Shop sponsorships and Fan token transfers. Its shared-directory case creates two riders, discovers both through filtered `getProgramAccounts`, selects one for Shop and Fan transactions, and verifies that token support leaves merchant coverage unchanged. It funds fans only on this validator, creates rider ATAs in Fan transactions, prints test assertions and exits. Inspect a transaction signature with `solana confirm <SIGNATURE> --url http://127.0.0.1:8899 --verbose`, or copy the signature from the localnet confirmation UI. Localnet does not use a Devnet Explorer link.

## Start the frontend

In another terminal, from `frontend/`:

```sh
cp .env.example .env.local
npm run dev
```

Keep `VITE_SOLANA_CLUSTER=localnet` and `VITE_SOLANA_RPC_URL=http://127.0.0.1:8899` in `.env.local`. Open the URL printed by Vite. Connected mode is the default. Set `VITE_ENABLE_DEMO=true` for an explicitly labelled offline preview; it needs no wallet. Connected Shop and Fan discover RiderProfiles directly from the validator and present them as selectable cards; no rider-address environment variable is needed. The app never accepts a private key in an environment variable.

## Temporary wallet funding

For a separate manual local session, generate new keypairs outside the repository; never import a personal wallet:

```sh
mkdir -p /tmp/gridsupport-fan-step5/wallets
solana-keygen new --silent --no-bip39-passphrase --outfile /tmp/gridsupport-fan-step5/wallets/rider.json
solana-keygen new --silent --no-bip39-passphrase --outfile /tmp/gridsupport-fan-step5/wallets/shop.json
solana-keygen new --silent --no-bip39-passphrase --outfile /tmp/gridsupport-fan-step5/wallets/fan.json
solana address -k /tmp/gridsupport-fan-step5/wallets/rider.json
solana address -k /tmp/gridsupport-fan-step5/wallets/shop.json
solana address -k /tmp/gridsupport-fan-step5/wallets/fan.json
solana address -k /tmp/gridsupport-fan-step5/mint-authority.json
```

Copy each printed public address and request local SOL for each with `solana airdrop 2 <PUBLIC_ADDRESS> --url http://127.0.0.1:8899`. Airdrop the fixture mint authority too, since it pays to create the fan ATA and mint local tokens:

```sh
solana airdrop 2 <AUTHORITY_PUBLIC_ADDRESS> --url http://127.0.0.1:8899
spl-token --url http://127.0.0.1:8899 --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --fee-payer /tmp/gridsupport-fan-step5/mint-authority.json create-account --owner <FAN_PUBLIC_ADDRESS> 6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS
spl-token --url http://127.0.0.1:8899 --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA address --owner <FAN_PUBLIC_ADDRESS> --token 6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS
spl-token --url http://127.0.0.1:8899 --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --fee-payer /tmp/gridsupport-fan-step5/mint-authority.json mint --mint-authority /tmp/gridsupport-fan-step5/mint-authority.json 6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS 100 <FAN_ATA>
spl-token --url http://127.0.0.1:8899 --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA display <FAN_ATA>
```

The `100` mint amount means 100.000000 gsUSDC. The Fan transaction creates the canonical rider ATA if it is absent, with the fan paying its rent. Inspect it afterward with `spl-token --url http://127.0.0.1:8899 --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA address --owner <RIDER_PUBLIC_ADDRESS> --token 6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS` and `spl-token ... display <RIDER_ATA>` using the same URL and program ID.

## Browser transaction sequence and present limitation

[Phantom's current developer settings](https://help.phantom.com/articles/use-testnets-in-phantom-5997313271699) expose Solana Devnet and Testnet, but no custom local validator RPC. **There is no Phantom setting that makes this isolated local chain its network.** Do not select Devnet in Phantom while the app points at localnet, and do not expose the validator to the internet to work around this. The current frontend registers Phantom, so the full browser wallet-extension signing sequence has not been verified locally. The isolated RPC test above is the completed Rider → Shop → Fan transaction proof.

When a supported localnet signing wallet is added and verified in a later step, use the temporary funded keypairs: connect rider on `/racer`, create a profile, season and custom expense; connect shop on `/shop`, select the newly discovered rider card and record in-kind sponsorship; connect fan on `/fan`, select the same rider card, enter a custom gsUSDC amount and sign. Check the modal's real signature, the fan debit and rider ATA credit, and that Shop/Rider merchant expense coverage remains unchanged by the Fan transfer. Rejected signatures and insufficient balances must show errors. Demo mode, Community Impact and Reset Demo can be exercised separately without a wallet.

Stop terminal 1 with Ctrl-C. The launcher restores the default SBF build. Restarting it with the same directory resets the isolated ledger. Delete `/tmp/gridsupport-fan-step5` when finished to remove the temporary authority and wallet keypairs.
