# GridSupport V1 context

GridSupport is a Solana demonstration for grassroots motorcycle racing micro-sponsorship. The Racer tab shows season budget, listed expenses, in-kind coverage and remaining costs. The Shop tab lets a wallet declare a goods or services commitment to one expense. The Fan tab will transfer dedicated Devnet mock USDC directly to a rider.

The five demo scenes are: introduce the rider and season; show the expense gap; record one real merchant in-kind commitment; make one real fan token contribution; show a cinematic simulation in which roughly 100 businesses cover 80–90% of costs. The final scene is frontend-only and its simulated entries must never appear as verified onchain sponsorships.

In-kind commitments are euro cents of promised goods or services. They are not payments and do not prove delivery. Fan contributions are actual SPL token amounts in six-decimal mock USDC. Never sum, convert, or label these as one financial total.

Current stage: the Racer → Shop onchain path and fan contribution instruction are operational in local tests. A rider can create a profile, create the one V1 season, add expenses, and merchants can record permanent in-kind sponsorship declarations. Fans can transfer approved six-decimal mock USDC directly to the rider's canonical ATA and receive a transaction event. The default build has no approved Devnet mint, so Devnet contribution deployment remains blocked pending operator setup and approval. Affiliate shopping, promotional obligations, merchant profiles, escrow, fulfillment, NFT badges, fiat payments, real voice recognition, and multiplier or celebration animation are outside V1 onchain scope.

