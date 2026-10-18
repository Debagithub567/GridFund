# GridSupport Mock USDC setup

GridSupport Mock USDC (`gsUSDC`) is a demo label for a dedicated six-decimal **standard SPL Token** mint on Devnet. It has no monetary value. The token program ID is `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`. No Devnet mint has been created or approved in this repository; the default program build has `APPROVED_MOCK_USDC_MINT = None` and rejects every contribution.

## Local test configuration

`local-test-mint` is an explicit Cargo feature. It pins the deterministic address represented by `[77; 32]` and LiteSVM creates a real serialized standard SPL Mint account at that address, with six decimals and funded token accounts. This address is only a local fixture, never a Devnet candidate. Run:

```bash
anchor build --arch v0 --tools-version v1.54 -- --features local-test-mint
cargo test --offline --features local-test-mint
```

The local test build overwrites `target/deploy/gridsupport.so`. Rebuild without `local-test-mint` before any deployment or default configuration check:

```bash
anchor build --arch v0 --tools-version v1.54
cargo test --offline
```

Never deploy the local test artifact. The default build remains fail closed until a verified mint is pinned in `programs/gridsupport/src/constants.rs` under `#[cfg(not(feature = "local-test-mint"))]`.

## Devnet operator procedure (not executed)

The installed tools checked for this handoff are Solana CLI 3.1.14, SPL Token CLI 5.6.1, and Anchor CLI 1.2.0. Check versions and selected wallet before running the following commands. Keep the operator keypair outside Git; the commands use it as fee payer and mint authority. The fan and rider supply public wallet addresses only. Every network command specifies `devnet` and the standard token program explicitly.

```bash
solana --version
spl-token --version
solana address -k /absolute/private/path/operator.json
solana balance --url devnet -k /absolute/private/path/operator.json
solana rent --url devnet --lamports 82
solana rent --url devnet --lamports 165
```

After the operator confirms the wallet, cluster, expected rent, and funds, this is the **first broadcasting command**. It requires explicit user approval before execution:

```bash
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --fee-payer /absolute/private/path/operator.json create-token --decimals 6 --mint-authority <OPERATOR_PUBKEY>
```

Record the mint address printed by `create-token`. The `--mint-authority` value is the operator wallet's public key from `solana address`; the same private signer is supplied explicitly to `mint`. Do not insert a guessed address or an existing public USDC mint.

```bash
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA display <MINT>
solana account --url devnet <MINT>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA supply <MINT>
```

Verify that `display` reports six decimals, the expected mint authority, and no extensions or fees; `solana account` must show owner `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` and 82 data bytes. Record the actual mint public key, cluster (`devnet`), authority public key, and transaction signature in an operator record after execution. There are no fabricated values in this document.

Create the rider and fan canonical associated token accounts. The operator pays for both accounts; neither owner needs to sign account creation. Retrieve their addresses with `spl-token address`, then fund only the fan ATA. The amount `100` below means 100.000000 demo tokens, or 100,000,000 base units.

```bash
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --fee-payer /absolute/private/path/operator.json create-account --owner <RIDER_WALLET> <MINT>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --fee-payer /absolute/private/path/operator.json create-account --owner <FAN_WALLET> <MINT>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA address --owner <RIDER_WALLET> --token <MINT>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA address --owner <FAN_WALLET> --token <MINT>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --fee-payer /absolute/private/path/operator.json mint --mint-authority /absolute/private/path/operator.json <MINT> 100 <FAN_ATA>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA display <FAN_ATA>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA display <RIDER_ATA>
spl-token --url devnet --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA supply <MINT>
```

If a demo fan runs low, the operator can mint more demo tokens to that fan's verified ATA with the same `mint` command and mint authority, after checking the ATA owner and mint. The contribution instruction never mints and needs only the fan's signature; the rider does not sign to receive tokens.

## Cost and release gate

Expected account deposits are the live Devnet rent-exempt minimum for one 82-byte mint and two 165-byte ATAs, plus transaction fees for one mint creation, two ATA creations, and one mint transaction. At commonly published rent values (1,461,600 lamports for a mint and 2,039,280 for an ATA), that is **5,540,160 lamports (0.00554016 SOL) in refundable account deposits**. The four transactions have at least five signatures in total (mint creation uses the new mint keypair plus payer), or **25,000 lamports (0.000025 SOL) in base fees** at the documented 5,000-lamport signature rate; priority fees may add more. Thus budget roughly **0.00556516 SOL or more**, and query exact rent with the `solana rent` commands above immediately before use. Additional fan ATAs each require another 165-byte deposit and transaction fee. These are Devnet SOL costs, not a token price. A Devnet airdrop can fund a demo wallet, subject to faucet availability.

After independent verification, replace the default `None` with `Some(pubkey!("<VERIFIED_DEVNET_MINT>"))`, build **without** `local-test-mint`, rerun all checks, and review the source diff and SBF hash. Deploy only that reviewed artifact to the intended Devnet program ID. To check the deployed binary contains exactly the reviewed configuration, dump the deployed program with `solana program dump --url devnet <PROGRAM_ID> <OUTPUT_SO>` and compare its SHA-256 hash with the reviewed `target/deploy/gridsupport.so`; also run a confirmed Devnet contribution to the rider ATA and inspect both balances and event. A local successful test is not proof of Devnet integration.

Never use Mainnet URLs, a real USDC mint, or a binary built with `local-test-mint`. Keep keypair files and seed phrases outside the repository.

CLI workflow references: [Solana SPL Token CLI](https://solana.com/docs/references/spl-token-cli), [token quickstart](https://solana.com/docs/tokens/quickstart), [associated token accounts](https://solana.com/docs/tokens/basics/create-token-account), and [transaction fees](https://solana.com/docs/core/fees).
