# Scripts

Stage 2's four operational instructions are exercised by LiteSVM tests; there are no separate transaction scripts. In particular, there is no mint creation, wallet funding, deployment, or transaction seeding script. The local program keypair is generated at `target/deploy/gridsupport-keypair.json` and is ignored by Git; a new checkout must generate or supply a matching keypair before `anchor build` checks program IDs.

On the inspected machine, the working SBF build command is `anchor build --arch v0 --tools-version v1.54`. The default tools version v1.57 is incomplete in its local cache. Run the LiteSVM and architecture tests with `cargo test --offline` and `npm test` after building.

