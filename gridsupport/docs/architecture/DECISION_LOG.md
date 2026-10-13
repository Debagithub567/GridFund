# Frozen V1 decisions

| # | Decision | Rationale |
| ---: | --- | --- |
| 1 | One active season per rider | Keeps V1 state unambiguous. |
| 2 | One fixed Season PDA per RiderProfile | Enforces that limit by address. |
| 3 | No rollover or closure instruction | Avoids lifecycle scope in V1. |
| 4 | Business identity is signer wallet | Gives declarations an onchain origin. |
| 5 | Business names and logos are frontend metadata | Avoids mutable presentation data onchain. |
| 6 | A merchant can sponsor an expense repeatedly | Supports multiple independent commitments. |
| 7 | Each sponsorship is a permanent record | Preserves declaration history. |
| 8 | No editing or cancellation | Keeps the record append-only. |
| 9 | Signing commits sponsorship automatically | Keeps the merchant flow direct. |
| 10 | No per-sponsorship rider approval | Avoids a second signature and approval state. |
| 11 | No promotional obligations onchain | V1 records coverage only. |
| 12 | No payment or escrow for in-kind sponsorship | A promise of goods is distinct from tokens. |
| 13 | Fans use standard SPL Token | Uses the standard token path. |
| 14 | Fan contributions emit events, no receipt PDA | Transfer history is carried by token movement and logs. |
| 15 | Mock-USDC mint is pinned to trusted configuration | Prevents arbitrary frontend mint substitution. |
| 16 | Monetary arithmetic is integer-only | Avoids floating-point rounding. |
| 17 | Coverage cannot exceed estimate | Prevents impossible expense coverage. |
| 18 | Multiplier and win animation are frontend-only | Simulation cannot alter verified state. |
| 19 | No custom merchant profile | Wallet is sufficient V1 identity. |
| 20 | No affiliate campaign or purchase receipt accounts | Affiliate ideas remain illustrative. |

