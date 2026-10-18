import type {Program} from '@anchor-lang/core';
import {getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {PublicKey} from '@solana/web3.js';
import type {Connection} from '@solana/web3.js';
import type {Gridsupport} from './gridsupport';
import {approvedMockMint} from './fanTransactions';
import {cluster, programId} from './config';
import {riderProfilePda} from './pdas';

export type FanReceipt = {signature: string; rider: string; fan: string; source: string; amount: string};
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeBase58(value: string): Uint8Array {
  let number = 0n;
  for (const char of value) { const digit = alphabet.indexOf(char); if (digit < 0) throw new Error('Invalid instruction data.'); number = number * 58n + BigInt(digit); }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  return Uint8Array.from([...Array.from(value.match(/^1*/)?.[0] || '').map(() => 0), ...bytes]);
}
const prefix = () => `gridsupport-fan-receipts-v1:${cluster}:${programId.toBase58()}:${approvedMockMint?.toBase58() || 'none'}:`;
const key = (rider: string) => prefix() + rider;

export function saveFanReceipt(receipt: FanReceipt): void {
  if (!approvedMockMint) return;
  try {
    const previous = JSON.parse(localStorage.getItem(key(receipt.rider)) || '[]') as FanReceipt[];
    const unique = [...previous.filter(item => item.signature !== receipt.signature), receipt];
    localStorage.setItem(key(receipt.rider), JSON.stringify(unique));
  } catch { /* The transfer succeeded; this browser cannot retain its presentation receipt. */ }
}

async function verifiedReceipt(connection: Connection, program: Program<Gridsupport>, rider: PublicKey,
  signature: string): Promise<FanReceipt | null> {
  const destination = getAssociatedTokenAddressSync(approvedMockMint, rider).toBase58();
  const profile = riderProfilePda(rider).toBase58();
  const tx = await connection.getTransaction(signature, {commitment: 'confirmed', maxSupportedTransactionVersion: 0});
  if (!tx?.meta || tx.meta.err || !('accountKeys' in tx.transaction.message)) return null;
  const message = tx.transaction.message;
  const keys = message.accountKeys.map(address => address.toBase58());
  const instruction = message.instructions.find(ix => {
    if (!('programIdIndex' in ix) || keys[ix.programIdIndex] !== programId.toBase58()) return false;
    const bytes = decodeBase58(ix.data);
    const discriminator = program.idl.instructions.find(item => item.name === 'contributeDirect')?.discriminator;
    return !!discriminator && bytes.length === 16 && discriminator.every((byte, index) => bytes[index] === byte);
  });
  if (!instruction) return null;
  const [fanIndex, profileIndex, mintIndex, sourceIndex, destinationIndex, tokenIndex] = instruction.accounts;
  if (instruction.accounts.length !== 6 || ![fanIndex, profileIndex, mintIndex, sourceIndex, destinationIndex, tokenIndex]
    .every(index => Number.isInteger(index) && index >= 0 && index < keys.length) ||
    keys[profileIndex] !== profile || keys[mintIndex] !== approvedMockMint.toBase58() ||
    keys[destinationIndex] !== destination || keys[tokenIndex] !== TOKEN_PROGRAM_ID.toBase58() ||
    fanIndex >= message.header.numRequiredSignatures || !keys[fanIndex]) return null;
  const bytes = decodeBase58(instruction.data);
  const amount = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(8, true);
  if (amount <= 0n) return null;
  const before = tx.meta.preTokenBalances || [], after = tx.meta.postTokenBalances || [];
  const token = (entries: typeof before, index: number) => entries.find(entry =>
    entry.accountIndex === index && entry.mint === approvedMockMint.toBase58());
  const sourceBefore = token(before, sourceIndex), sourceAfter = token(after, sourceIndex);
  const destinationBefore = token(before, destinationIndex), destinationAfter = token(after, destinationIndex);
  if (!sourceBefore || !sourceAfter || !destinationAfter ||
    sourceBefore.owner !== keys[fanIndex] || sourceAfter.owner !== keys[fanIndex] ||
    destinationAfter.owner !== rider.toBase58() ||
    BigInt(sourceBefore.uiTokenAmount.amount) - BigInt(sourceAfter.uiTokenAmount.amount) !== amount ||
    BigInt(destinationAfter.uiTokenAmount.amount) - BigInt(destinationBefore?.uiTokenAmount.amount || '0') !== amount) return null;
  return {signature, rider: rider.toBase58(), fan: keys[fanIndex], source: keys[sourceIndex], amount: amount.toString()};
}

export async function verifiedFanReceipts(connection: Connection, program: Program<Gridsupport>, rider: PublicKey): Promise<FanReceipt[]> {
  if (!approvedMockMint) return [];
  let records: unknown;
  try { records = JSON.parse(localStorage.getItem(key(rider.toBase58())) || '[]'); } catch { records = []; }
  const destination = getAssociatedTokenAddressSync(approvedMockMint, rider);
  const recent = await connection.getSignaturesForAddress(destination, {limit: 100}, 'confirmed');
  const saved = Array.isArray(records) ? (records as FanReceipt[]).slice(0, 100) : [];
  const candidates = new Map<string, FanReceipt | null>();
  for (const item of saved) {
    if (typeof item?.signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(item.signature))
      candidates.set(item.signature, item);
  }
  for (const item of recent) if (!item.err) candidates.set(item.signature, null);
  const valid: FanReceipt[] = [];
  for (const [signature, savedItem] of candidates) {
    try {
      const receipt = await verifiedReceipt(connection, program, rider, signature);
      if (receipt && (!savedItem || (receipt.rider === savedItem.rider && receipt.fan === savedItem.fan &&
        receipt.source === savedItem.source && receipt.amount === savedItem.amount))) valid.push(receipt);
    } catch (reason) { throw new Error(`Unable to verify fan transaction ${signature.slice(0, 10)}: ${reason instanceof Error ? reason.message : 'RPC unavailable'}`); }
  }
  return valid;
}
