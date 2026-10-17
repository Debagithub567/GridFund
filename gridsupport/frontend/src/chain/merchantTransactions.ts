import {BN} from '@anchor-lang/core';
import type {Program} from '@anchor-lang/core';
import {PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import type {Connection} from '@solana/web3.js';
import type {Gridsupport} from './gridsupport';
import {fetchRiderSnapshot} from './accounts';
import type {ChainSnapshot} from './accounts';
import {sponsorshipPda} from './pdas';
import type {RiderSend} from './riderTransactions';

export type MerchantStage = 'awaiting-wallet' | 'submitted' | 'confirming' | 'verifying' | 'confirmed';
export type MerchantProgress = {stage: MerchantStage; signature?: string};
export type MerchantTransactionContext = {
  program: Program<Gridsupport>;
  connection: Connection;
  merchant: PublicKey;
  send: RiderSend;
  onProgress: (progress: MerchantProgress) => void;
};
export type MerchantTransactionResult = {signature: string; address: PublicKey; snapshot: ChainSnapshot};

export async function sponsorExpense(ctx: MerchantTransactionContext, rider: PublicKey,
  expenseAddress: PublicKey, amountCents: number): Promise<MerchantTransactionResult> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('Enter a positive sponsorship amount in exact EUR cents.');
  }
  // Read immediately before building the instruction: the displayed coverage may be stale.
  const before = await fetchRiderSnapshot(ctx.program, rider);
  if (!before.seasonExists || before.seasonStatus !== 1) throw new Error('The rider has no active season. Refresh accounts.');
  const expense = before.expenses.find(item => item.address.equals(expenseAddress));
  if (!expense) throw new Error('Choose an on-chain expense belonging to this rider. Refresh accounts.');
  const remaining = expense.estimatedCostCents - expense.committedCoverageCents;
  if (remaining <= 0n) throw new Error('This expense is fully covered. Refresh accounts.');
  if (BigInt(amountCents) > remaining) throw new Error(`Only ${remaining} EUR cents remain for merchant sponsorship. Refresh accounts.`);

  const sponsorshipId = expense.sponsorshipCount;
  const address = sponsorshipPda(expenseAddress, sponsorshipId);
  const instruction = await ctx.program.methods.sponsorExpense(new BN(amountCents)).accountsStrict({
    merchant: ctx.merchant, season: before.seasonAddress, expense: expenseAddress,
    sponsorship: address, systemProgram: SystemProgram.programId,
  }).instruction();
  const {blockhash, lastValidBlockHeight} = await ctx.connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({feePayer: ctx.merchant, blockhash, lastValidBlockHeight}).add(instruction);
  ctx.onProgress({stage: 'awaiting-wallet'});
  const signature = await ctx.send(transaction, ctx.connection);
  ctx.onProgress({stage: 'submitted', signature});
  ctx.onProgress({stage: 'confirming', signature});
  const confirmation = await ctx.connection.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed');
  if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  ctx.onProgress({stage: 'verifying', signature});

  // Confirmed RPC account visibility can lag. Both the expense and sponsorship
  // are decoded by fetchRiderSnapshot, including ownership and PDA association.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const snapshot = await fetchRiderSnapshot(ctx.program, rider);
      const updated = snapshot.expenses.find(item => item.address.equals(expenseAddress));
      const sponsorship = updated?.sponsorships.find(item => item.address.equals(address));
      if (updated && sponsorship && updated.committedCoverageCents >= expense.committedCoverageCents + BigInt(amountCents) &&
        updated.sponsorshipCount >= sponsorshipId + 1n && sponsorship.expense.equals(expenseAddress) &&
        sponsorship.merchant.equals(ctx.merchant) && sponsorship.sponsorshipId === sponsorshipId &&
        sponsorship.amountCents === BigInt(amountCents)) {
        return {signature, address, snapshot};
      }
    } catch {
      // A confirmed account may not yet be visible at this RPC commitment.
    }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`Transaction ${signature} confirmed, but the sponsorship account or updated coverage could not be verified. Refresh accounts before retrying.`);
}
