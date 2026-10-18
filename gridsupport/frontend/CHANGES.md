# Stage 4A refinements

- Preserved the landing page, five-rider slideshow, imagery, navigation, existing dashboard routes and Connect Wallet button.
- Added create/edit expense forms with custom EUR amounts, descriptions and covered/remaining indicators.
- Added shared React state with localStorage persistence, session recovery and Reset Demo.
- Added custom shop and fan support amounts, separate contribution types, overcoverage protection and reusable pending/success/error result modals.
- Added a 12-second Community Impact sequence with scaled milestones, supporter waves, counters, notifications, replay, skip and close. Temporary coverage does not alter saved records.
- Added fullscreen victory celebration, six-second placeholder, optional custom MP4 with embedded audio, playback controls and a 2.8-second closing message.
- Added Stage 4B integration notes and regression tests for amounts, coverage, persistence, editing and visualization invariants.

At Stage 4A, no wallet, Anchor, program deployment, token mint or backend integration was added. The downloadable ZIP was deferred until the preview was approved.

## Community Impact opening fix

Initialized animation timing from the first animation-frame callback and clamped progress sampling to valid bounds. The modal now starts visibly. Added an interaction regression covering launch, full completion, victory fallback, replay, skip, close and unchanged saved contributions.

## Stage 4B Step 3 — Rider integration

- Added Connected mode with wallet-signed RiderProfile, Season and custom-amount Expense creation. The adapter confirms each signature and fetches the created account before showing success; the dashboard refreshes from that verified snapshot.
- Added public Rider account reads, canonical PDA derivation, on-chain merchant coverage, and a browser-local metadata registry for readable titles and descriptions. Demo state remains separate.
- Kept Shop and Fan Connected writes disabled for Step 4. The landing page, Shop/Fan Demo dashboards, and Community Impact sequence remain available.
- Added IDL, transaction, local-validator, and dashboard regression coverage. This step did not deploy the program or create a Devnet mint.

## Stage 4B Step 4 — Shopkeeper sponsorship

- Connected Shop now records wallet-signed in-kind sponsorships with the existing `sponsor_expense` instruction. It uses a fresh expense read, canonical sponsorship PDA, confirmation, and account verification before showing success.
- Shop coverage and remaining amounts refresh from program accounts. Rider and Shop read the same confirmed sponsorships; other sessions have a visible refresh button and 20-second polling.
- Added exact-cent validation, pending and duplicate-submission guards, wallet and RPC failure handling, and a distinct recorded-sponsorship result message. Demo support and Fan Connected writes remain separate.
- Added Shop adapter, dashboard, and isolated local-validator regressions without changing the program, PDA seeds, landing page, Community Impact, or victory media.

## Stage 4B Step 5 — Fan mock-USDC contribution

- Connected Fan now submits the existing `contribute_direct` instruction against the pinned local six-decimal standard SPL mint. It validates exact base-unit amounts, fan source balance and ownership, the recipient's canonical ATA, and wallet approval. A missing rider ATA is created in the signed transaction.
- The success modal appears only after confirmation, signature-specific source debit and rider credit verification, and refreshed token balances. It displays the actual amount, rider address, network, signature and Explorer link. Pending submissions cannot be duplicated.
- Connected Fan labels expense selection as optional presentation context. Token transfers do not change merchant coverage or imply a EUR value. Demo mode, landing page, Community Impact and media remain separate.
- Added a repeatable local mint/validator fixture and Fan unit, UI and isolated RPC tests. The default program mint stays unconfigured; no Devnet mint or deployment was created.

## Shared Rider Directory — Shop and Fan discovery

- Replaced typed rider addresses and the optional preloaded rider address with one shared on-chain Rider Directory for Connected Shop and Fan. It filters actual RiderProfile accounts by the IDL discriminator and size, validates canonical PDAs, and reuses the existing Season/Expense/Sponsorship reader.
- Added deterministic multi-rider cards, safe names and season metadata fallbacks, explicit empty/RPC-error states, selection, refresh and 20-second polling. Wallet changes clear the selected rider and hide stale account data.
- Shop and Fan keep their existing transaction adapters. Sponsorship updates directory merchant coverage; direct fan token transfers remain separate. Demo mode and presentation assets are unchanged.
- Added directory unit/UI coverage and an isolated validator Rider → Shop → Fan discovery workflow. No contract, PDA, program ID, mint policy, Devnet deployment, or network endpoint was changed.

## Final local judge presentation

- Added editable Pol Espargaró / 2026 / €1,000 Rider budget orchestration with verified sequential account creation, partial-step recovery and duplicate-safe retries.
- Added multi-expense Shop in-kind commitments, direct Fan support without expense selection, personalized verified confirmations, local signature copying and a presentation-only combined support display from verified Rider ATA transaction history. Rider accounts refresh every 20 seconds while connected.
- Made Rider discovery the primary Shop/Fan view, hid the large technical account panel and default Demo switch, and kept Demo fixtures behind `VITE_ENABLE_DEMO=true`.
- Added Community Help storyline and final messages while preserving the existing animation and missing-video fallback. Added the judge runbook and an isolated local-validator exact-amount workflow. The default Rust and frontend mint configurations now pin the separately verified Devnet mint; no Devnet deployment or token minting occurred.
