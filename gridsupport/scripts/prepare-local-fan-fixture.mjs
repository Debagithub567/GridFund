import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Keypair, PublicKey} from '@solana/web3.js';
import {MintLayout, TOKEN_PROGRAM_ID} from '@solana/spl-token';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/prepare-local-fan-fixture.mjs <temporary-directory>');
const mint = new PublicKey(new Uint8Array(32).fill(77));
const authority = Keypair.generate();
const data = Buffer.alloc(MintLayout.span);
MintLayout.encode({mintAuthorityOption: 1, mintAuthority: authority.publicKey,
  supply: 0n, decimals: 6, isInitialized: true,
  freezeAuthorityOption: 0, freezeAuthority: PublicKey.default}, data);
await mkdir(directory, {recursive: true});
await writeFile(path.join(directory, 'mint.json'), JSON.stringify({pubkey: mint.toBase58(), account: {lamports: 10_000_000,
  data: [data.toString('base64'), 'base64'], owner: TOKEN_PROGRAM_ID.toBase58(),
  executable: false, rentEpoch: 0}}, null, 2));
await writeFile(path.join(directory, 'mint-authority.json'), JSON.stringify(Array.from(authority.secretKey)), {mode: 0o600});
console.log(`Local-only mock-USDC mint: ${mint.toBase58()}`);
console.log(`Fixture mint authority: ${path.join(directory, 'mint-authority.json')}`);
