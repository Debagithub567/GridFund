# Open implementation dependencies

1. **Devnet mock-USDC mint:** no approved mint exists. Follow `MOCK_USDC_SETUP.md` only after explicit approval for its first broadcasting command, verify the six-decimal standard SPL mint and operator authority, then pin its actual public key in the default build. Devnet deployment remains blocked; the explicit local test build is ready.
2. **Deployment configuration:** the local program ID is `H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ`. The keypair exists only in ignored `target/deploy/` in this checkout. Choose and protect the Devnet program keypair and align `declare_id!` and `Anchor.toml` before deployment.
3. **Local SBF toolchain:** verify `anchor build` on the deployment machine. The current `cargo-build-sbf` environment may need an explicit platform tools path; see the handoff for actual command results.
4. **Stage 4 data source:** immediate fan recognition can use a confirmed signature plus `DirectContribution` event. Historical donation totals need reliable indexing or another explicit data source; the rider's current ATA balance cannot establish lifetime contributions.

