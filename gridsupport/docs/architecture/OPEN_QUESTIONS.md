# Open implementation dependencies

1. **Devnet mock-USDC mint:** create a dedicated standard SPL Token mint with six decimals outside this program, verify the address and authority policy, then replace `APPROVED_MOCK_USDC_MINT = None` with a compile-time `Some(pubkey!(...))`. The contribution interface is intentionally unusable until then.
2. **Deployment configuration:** the local program ID is `H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ`. The keypair exists only in ignored `target/deploy/` in this checkout. Choose and protect the Devnet program keypair and align `declare_id!` and `Anchor.toml` before deployment.
3. **Local SBF toolchain:** verify `anchor build` on the deployment machine. The current `cargo-build-sbf` environment may need an explicit platform tools path; see the handoff for actual command results.
4. **Stage 3 token test fixture:** LiteSVM already runs the Stage 2 Racer → Shop transactions locally. Provision a standard SPL six-decimal token mint and funded fan/rider token accounts for the later donation tests; do not use a frontend-supplied mint.

