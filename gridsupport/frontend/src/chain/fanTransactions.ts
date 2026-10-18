import {BN} from '@anchor-lang/core';
import type {Program} from '@anchor-lang/core';
import {PublicKey, Transaction} from '@solana/web3.js';
import type {Connection, AccountInfo} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync, getMint, unpackAccount} from '@solana/spl-token';
import type {Gridsupport} from './gridsupport';
import type {RiderSend} from './riderTransactions';
import {riderProfilePda} from './pdas';
import {cluster} from './config';

export const MOCK_USDC_DECIMALS = 6;
export const LOCAL_MOCK_USDC_MINT = new PublicKey(new Uint8Array(32).fill(77));
export const DEVNET_MOCK_USDC_MINT = new PublicKey('Eu5ZdwKKpSNej1koShWYBm7SKoPE2utvtb3yLWSjRxf1');
export const approvedMockMint = cluster === 'localnet' ? LOCAL_MOCK_USDC_MINT : DEVNET_MOCK_USDC_MINT;
const U64_MAX = (1n << 64n) - 1n;
export type FanProgress = {stage: 'awaiting-wallet' | 'submitted' | 'confirming' | 'verifying' | 'confirmed'; signature?: string};
export type TokenBalances = {fan: bigint; rider: bigint | null; riderAta: PublicKey; fanAta: PublicKey | null; fanAtaExists: boolean};
export type FanTransactionContext = {program: Program<Gridsupport>; connection: Connection; fan: PublicKey;
  send: RiderSend; onProgress: (value: FanProgress) => void};
export type FanTransactionResult = {signature: string; rider: PublicKey; source: PublicKey; amount: bigint; balances: TokenBalances};

export function parseMockUsdc(value: string): bigint {
  const raw = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) throw new Error('Enter a positive mock-USDC amount with at most six decimal places.');
  const [whole, fraction = ''] = raw.split('.');
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0') || '0');
  if (amount <= 0n || amount > U64_MAX) throw new Error('Enter a valid positive mock-USDC amount.');
  return amount;
}

export function formatMockUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} gsUSDC`;
}

function decodeToken(address: PublicKey, info: AccountInfo<Buffer>) {
  if (!info.owner.equals(TOKEN_PROGRAM_ID)) throw new Error('Token account uses the wrong token program.');
  return unpackAccount(address, info, TOKEN_PROGRAM_ID);
}

async function tokenAccounts(connection: Connection, fan: PublicKey, mint: PublicKey) {
  const response = await connection.getTokenAccountsByOwner(fan, {mint}, 'confirmed');
  return response.value.map(({pubkey, account}) => {
    const decoded = decodeToken(pubkey, account);
    if (!decoded.owner.equals(fan) || !decoded.mint.equals(mint)) throw new Error('Fan token account has the wrong owner or mint.');
    return {address: pubkey, amount: decoded.amount};
  });
}

async function riderToken(connection: Connection, rider: PublicKey, mint: PublicKey) {
  const address = getAssociatedTokenAddressSync(mint, rider, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const info = await connection.getAccountInfo(address, 'confirmed');
  if (!info) return {address, amount: null};
  const account = decodeToken(address, info);
  if (!account.owner.equals(rider) || !account.mint.equals(mint)) throw new Error('Rider ATA has the wrong owner or mint.');
  return {address, amount: account.amount};
}

export async function fetchTokenBalances(connection: Connection, fan: PublicKey | null, rider: PublicKey): Promise<TokenBalances> {
  if (!approvedMockMint) throw new Error('No approved mock-USDC mint is configured for this network.');
  const mint = await getMint(connection, approvedMockMint, 'confirmed', TOKEN_PROGRAM_ID);
  if (mint.decimals !== MOCK_USDC_DECIMALS) throw new Error('The approved mock-USDC mint must have six decimals.');
  const [sources, destination] = await Promise.all([
    fan ? tokenAccounts(connection, fan, approvedMockMint) : Promise.resolve([]),
    riderToken(connection, rider, approvedMockMint),
  ]);
  const fanAta = fan ? getAssociatedTokenAddressSync(approvedMockMint, fan, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID) : null;
  return {fan: sources.reduce((sum, account) => sum + account.amount, 0n), rider: destination.amount, riderAta: destination.address,
    fanAta, fanAtaExists: !!fanAta && sources.some(account => account.address.equals(fanAta))};
}

export async function prepareFanTokenAccount(ctx: FanTransactionContext): Promise<{signature: string; address: PublicKey}> {
  const mint = await getMint(ctx.connection, approvedMockMint, 'confirmed', TOKEN_PROGRAM_ID);
  if (mint.decimals !== MOCK_USDC_DECIMALS) throw new Error('The approved gsUSDC mint must have six decimals.');
  const address = getAssociatedTokenAddressSync(approvedMockMint, ctx.fan, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const existing = await ctx.connection.getAccountInfo(address, 'confirmed');
  if (existing) {
    const account = decodeToken(address, existing);
    if (!account.owner.equals(ctx.fan) || !account.mint.equals(approvedMockMint)) throw new Error('Fan token account has the wrong owner or mint.');
    throw new Error('The Fan gsUSDC token account already exists. Refresh token accounts.');
  }
  const {blockhash, lastValidBlockHeight} = await ctx.connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({feePayer: ctx.fan, blockhash, lastValidBlockHeight}).add(
    createAssociatedTokenAccountIdempotentInstruction(ctx.fan, address, ctx.fan, approvedMockMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  ctx.onProgress({stage: 'awaiting-wallet'});
  const signature = await ctx.send(transaction, ctx.connection);
  ctx.onProgress({stage: 'submitted', signature});
  ctx.onProgress({stage: 'confirming', signature});
  const confirmation = await ctx.connection.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed');
  if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  ctx.onProgress({stage: 'verifying', signature});
  const info = await ctx.connection.getAccountInfo(address, 'confirmed');
  if (!info) throw new Error(`Transaction ${signature} confirmed, but the token account could not be verified. Refresh before retrying.`);
  const account = decodeToken(address, info);
  if (!account.owner.equals(ctx.fan) || !account.mint.equals(approvedMockMint)) throw new Error('Fan token account has the wrong owner or mint.');
  ctx.onProgress({stage: 'confirmed', signature});
  return {signature, address};
}

function metaAmount(balances: readonly {accountIndex: number; mint: string; uiTokenAmount: {amount: string}}[] | null | undefined,
  index: number, mint: PublicKey): bigint | null {
  const entry = balances?.find(balance => balance.accountIndex === index && balance.mint === mint.toBase58());
  return entry ? BigInt(entry.uiTokenAmount.amount) : null;
}

export async function contributeDirect(ctx: FanTransactionContext, rider: PublicKey, amount: bigint): Promise<FanTransactionResult> {
  if (amount <= 0n || amount > U64_MAX) throw new Error('Enter a valid positive mock-USDC amount.');
  if (!approvedMockMint) throw new Error('No approved mock-USDC mint is configured for this network.');
  const mint = await getMint(ctx.connection, approvedMockMint, 'confirmed', TOKEN_PROGRAM_ID);
  if (mint.decimals !== MOCK_USDC_DECIMALS) throw new Error('The approved mock-USDC mint must have six decimals.');
  const profile = riderProfilePda(rider);
  const profileInfo = await ctx.connection.getAccountInfo(profile, 'confirmed');
  if (!profileInfo || !profileInfo.owner.equals(ctx.program.programId)) throw new Error('Load a rider with a valid on-chain RiderProfile.');
  const decodedProfile = ctx.program.coder.accounts.decode<{rider: PublicKey}>('riderProfile', profileInfo.data);
  if (!decodedProfile.rider.equals(rider)) throw new Error('The RiderProfile does not match the selected rider.');
  const sources = await tokenAccounts(ctx.connection, ctx.fan, approvedMockMint);
  const source = sources.find(account => account.amount >= amount);
  if (!source) throw new Error(sources.length ? 'Insufficient gsUSDC balance in one Fan token account. Ask the authorized test-token holder to fund it.' : 'Set up a standard SPL gsUSDC token account and ask the authorized test-token holder to fund it.');
  const destination = await riderToken(ctx.connection, rider, approvedMockMint);
  const instruction = await ctx.program.methods.contributeDirect(new BN(amount.toString())).accountsStrict({
    fan: ctx.fan, riderProfile: profile, mockUsdcMint: approvedMockMint, fanTokenAccount: source.address,
    riderTokenAccount: destination.address, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
  const {blockhash, lastValidBlockHeight} = await ctx.connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({feePayer: ctx.fan, blockhash, lastValidBlockHeight});
  if (destination.amount === null) transaction.add(createAssociatedTokenAccountIdempotentInstruction(
    ctx.fan, destination.address, rider, approvedMockMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  transaction.add(instruction);
  ctx.onProgress({stage: 'awaiting-wallet'});
  const signature = await ctx.send(transaction, ctx.connection);
  ctx.onProgress({stage: 'submitted', signature});
  ctx.onProgress({stage: 'confirming', signature});
  const confirmation = await ctx.connection.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed');
  if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  ctx.onProgress({stage: 'verifying', signature});

  // Signature-bound token balance metadata proves this transaction's exact
  // debit/credit even if other transfers alter the accounts concurrently.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const record = await ctx.connection.getTransaction(signature, {commitment: 'confirmed', maxSupportedTransactionVersion: 0});
      if (record?.meta && !record.meta.err) {
        if (!('accountKeys' in record.transaction.message)) throw new Error('Expected the submitted legacy transaction.');
        const keys = record.transaction.message.accountKeys;
        const sourceIndex = keys.findIndex(key => key.equals(source.address));
        const destinationIndex = keys.findIndex(key => key.equals(destination.address));
        const sourceBefore = metaAmount(record.meta.preTokenBalances, sourceIndex, approvedMockMint);
        const sourceAfter = metaAmount(record.meta.postTokenBalances, sourceIndex, approvedMockMint);
        const destinationBefore = metaAmount(record.meta.preTokenBalances, destinationIndex, approvedMockMint) ?? (destination.amount === null ? 0n : null);
        const destinationAfter = metaAmount(record.meta.postTokenBalances, destinationIndex, approvedMockMint);
        if (sourceBefore !== null && sourceAfter !== null && destinationBefore !== null && destinationAfter !== null &&
          sourceBefore - sourceAfter === amount && destinationAfter - destinationBefore === amount) {
          const sourceInfo = await ctx.connection.getAccountInfo(source.address, 'confirmed');
          if (!sourceInfo) throw new Error('The fan source token account is no longer available.');
          const currentSource = decodeToken(source.address, sourceInfo);
          if (!currentSource.owner.equals(ctx.fan) || !currentSource.mint.equals(approvedMockMint)) {
            throw new Error('The fan source token account changed owner or mint.');
          }
          const balances = await fetchTokenBalances(ctx.connection, ctx.fan, rider);
          if (balances.rider !== null) return {signature, rider, source: source.address, amount, balances};
        }
      }
    } catch {
      // Confirmed transaction metadata or account reads can briefly lag.
    }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`Transaction ${signature} confirmed, but its token debit and credit could not be verified. Refresh token accounts before retrying.`);
}
