# Scripts

The four sponsorship instructions and the fan contribution are exercised by LiteSVM tests. `docs/architecture/MOCK_USDC_SETUP.md` contains the prepared Devnet CLI workflow; no Devnet mint creation, wallet funding, deployment, or transaction seeding command has been executed. The local program keypair is generated at `target/deploy/gridsupport-keypair.json` and is ignored by Git; a new checkout must generate or supply a matching keypair before `anchor build` checks program IDs.

On the inspected machine, the working SBF build command is `anchor build --arch v0 --tools-version v1.54`. The default tools version v1.57 is incomplete in its local cache. For token tests, build with `anchor build --arch v0 --tools-version v1.54 -- --features local-test-mint` and run `cargo test --offline --features local-test-mint`. Rebuild without that feature before `cargo test --offline` or any reviewed deployment. Run `npm test` after the default build.

