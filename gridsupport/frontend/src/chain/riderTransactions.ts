import {BN} from '@anchor-lang/core';
import type {Program} from '@anchor-lang/core';
import {PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import type {TransactionInstruction} from '@solana/web3.js';
import type {Connection} from '@solana/web3.js';
import type {Gridsupport} from './gridsupport';
import {fetchRiderSnapshot} from './accounts';
import type {ChainSnapshot} from './accounts';
import {expensePda, riderProfilePda, seasonPda} from './pdas';
import {sha256Text} from './metadata';

export type RiderAction = 'profile' | 'season' | 'expense';
export type RiderStage = 'awaiting-wallet' | 'submitted' | 'confirming' | 'verifying' | 'confirmed';
export type RiderProgress = {stage: RiderStage; signature?: string};
export type RiderSend = (transaction: Transaction, connection: Connection) => Promise<string>;
export type RiderTransactionContext = {
  program: Program<Gridsupport>;
  connection: Connection;
  rider: PublicKey;
  send: RiderSend;
  onProgress: (progress: RiderProgress) => void;
};
export type RiderTransactionResult = {signature: string; address: PublicKey; snapshot: ChainSnapshot; hash?: number[]};

export function riderError(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  if (/reject|declin|cancel|User denied/i.test(text)) return 'Wallet approval was rejected. This step was not submitted.';
  if (/insufficient|0x1\b|Attempt to debit/i.test(text)) return 'Insufficient SOL for account rent and transaction fees. Fund this wallet on the selected network.';
  if (/already in use|already initialized|custom program error: 0x0\b/i.test(text)) return 'This account already exists. Refresh your on-chain accounts.';
  if (/blockhash|expired|not confirmed/i.test(text)) return 'Transaction confirmation expired. Refresh accounts before trying again.';
  return text || 'The Solana transaction failed.';
}

async function latestSnapshot(ctx: RiderTransactionContext) {
  return fetchRiderSnapshot(ctx.program, ctx.rider);
}

async function sendAndVerify(ctx: RiderTransactionContext, instruction: TransactionInstruction,
  address: PublicKey, verify: (snapshot: ChainSnapshot) => boolean): Promise<RiderTransactionResult> {
  const {blockhash, lastValidBlockHeight} = await ctx.connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({feePayer: ctx.rider, blockhash, lastValidBlockHeight}).add(instruction);
  ctx.onProgress({stage: 'awaiting-wallet'});
  const signature = await ctx.send(transaction, ctx.connection);
  ctx.onProgress({stage: 'submitted', signature});
  ctx.onProgress({stage: 'confirming', signature});
  const confirmation = await ctx.connection.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed');
  if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  ctx.onProgress({stage: 'verifying', signature});
  // Confirmed RPC state can lag the transaction status briefly.
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await latestSnapshot(ctx);
    if (verify(snapshot)) {
      return {signature, address, snapshot};
    }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`Transaction ${signature} confirmed, but the new account could not be verified. Refresh accounts before retrying.`);
}

export async function initializeRider(ctx: RiderTransactionContext): Promise<RiderTransactionResult> {
  const before = await latestSnapshot(ctx);
  if (before.profileExists) throw new Error('This RiderProfile already exists. Refresh accounts.');
  const address = riderProfilePda(ctx.rider);
  const instruction = await ctx.program.methods.initializeRider().accountsStrict({
    rider: ctx.rider, riderProfile: address, systemProgram: SystemProgram.programId,
  }).instruction();
  return sendAndVerify(ctx, instruction, address, snapshot => snapshot.profileExists);
}

export async function createSeason(ctx: RiderTransactionContext, budgetCents: number, title: string): Promise<RiderTransactionResult> {
  if (!Number.isSafeInteger(budgetCents) || budgetCents <= 0) throw new Error('Enter a valid positive season budget in cents.');
  if (!title.trim()) throw new Error('Enter a season title.');
  const before = await latestSnapshot(ctx);
  if (!before.profileExists) throw new Error('Create your RiderProfile first.');
  if (before.seasonExists) throw new Error('This rider already has a season. V1 supports one season per rider.');
  const hash = await sha256Text(title);
  const address = seasonPda(before.profileAddress);
  const instruction = await ctx.program.methods.createSeason(new BN(budgetCents), hash).accountsStrict({
    rider: ctx.rider, riderProfile: before.profileAddress, season: address, systemProgram: SystemProgram.programId,
  }).instruction();
  const result = await sendAndVerify(ctx, instruction, address, snapshot =>
    snapshot.seasonExists && snapshot.seasonBudgetCents === BigInt(budgetCents) &&
    snapshot.seasonTitleHash?.every((byte, index) => byte === hash[index]) === true);
  return {...result, hash};
}

export async function addExpense(ctx: RiderTransactionContext, amountCents: number, category: number, description: string): Promise<RiderTransactionResult> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Enter a valid positive expense amount in cents.');
  if (!Number.isInteger(category) || category < 0 || category > 255) throw new Error('Select a valid expense category.');
  const before = await latestSnapshot(ctx);
  if (!before.profileExists || !before.seasonExists) throw new Error('Create your RiderProfile and season first.');
  if (before.seasonStatus !== 1) throw new Error('This season is not active.');
  const index = BigInt(before.expenses.length);
  const hash = await sha256Text(description);
  const address = expensePda(before.seasonAddress, index);
  const instruction = await ctx.program.methods.addExpense(new BN(amountCents), category, hash).accountsStrict({
    rider: ctx.rider, riderProfile: before.profileAddress, season: before.seasonAddress,
    expense: address, systemProgram: SystemProgram.programId,
  }).instruction();
  const result = await sendAndVerify(ctx, instruction, address, snapshot => {
    const expense = snapshot.expenses.find(item => item.address.equals(address));
    return !!expense && expense.expenseId === index && expense.estimatedCostCents === BigInt(amountCents) &&
      expense.category === category && expense.descriptionHash.every((byte, position) => byte === hash[position]);
  });
  return {...result, hash};
}
