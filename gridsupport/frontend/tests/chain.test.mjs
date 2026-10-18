import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BN} from '@anchor-lang/core';
import {Connection, Keypair, PublicKey, SystemProgram} from '@solana/web3.js';
import {createGridProgram, gridIdl} from '../src/chain/program.ts';
import {fetchRiderSnapshot, snapshotToViewState} from '../src/chain/accounts.ts';
import {riderProfilePda, seasonPda, expensePda, sponsorshipPda} from '../src/chain/pdas.ts';
import {programId} from '../src/chain/config.ts';
import {totals} from '../src/model.ts';

const rootIdl = JSON.parse(readFileSync(new URL('../../target/idl/gridsupport.json', import.meta.url), 'utf8'));
const le64 = value => {const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes};

test('bundled IDL and PDA seeds match the generated Anchor artifact', () => {
  assert.deepEqual(gridIdl, rootIdl);
  assert.equal(programId.toBase58(), rootIdl.address);
  const rider = Keypair.generate().publicKey;
  const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  const profile = pda(Buffer.from('rider'), rider.toBuffer());
  const season = pda(Buffer.from('season'), profile.toBuffer());
  const expense = pda(Buffer.from('expense'), season.toBuffer(), le64(3n));
  assert.equal(riderProfilePda(rider).toBase58(), profile.toBase58());
  assert.equal(seasonPda(profile).toBase58(), season.toBase58());
  assert.equal(expensePda(season, 3n).toBase58(), expense.toBase58());
  assert.equal(sponsorshipPda(expense, 2n).toBase58(), pda(Buffer.from('sponsorship'), expense.toBuffer(), le64(2n)).toBase58());
});

test('read adapter decodes actual IDL layouts and uses merchant coverage only', async () => {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const program = createGridProgram(connection);
  const rider = Keypair.generate().publicKey;
  const merchant = Keypair.generate().publicKey;
  const profile = riderProfilePda(rider);
  const season = seasonPda(profile);
  const expense = expensePda(season, 0n);
  const sponsorship = sponsorshipPda(expense, 0n);
  const accounts = new Map();
  accounts.set(programId.toBase58(), {data: Buffer.alloc(0), owner: SystemProgram.programId, executable: true, lamports: 1, rentEpoch: 0});
  const put = async (address, type, value, owner = programId) => accounts.set(address.toBase58(), {
    data: await program.coder.accounts.encode(type, value), owner,
    executable: false, lamports: 1, rentEpoch: 0,
  });
  await put(profile, 'riderProfile', {rider, bump: 1});
  await put(season, 'season', {rider, seasonId: new BN(1), budgetCents: new BN(100000), titleHash: Array(32).fill(0), status: 1, expenseCount: new BN(1), bump: 1});
  await put(expense, 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(100000), committedCoverageCents: new BN(10000), sponsorshipCount: new BN(1), category: 3, descriptionHash: Array(32).fill(7), bump: 1});
  await put(sponsorship, 'sponsorship', {expense, merchant, sponsorshipId: new BN(0), amountCents: new BN(10000), createdAt: new BN(1729000000), bump: 1});
  connection.getAccountInfo = async address => accounts.get(address.toBase58()) || null;
  connection.getMultipleAccountsInfo = async addresses => addresses.map(address => accounts.get(address.toBase58()) || null);

  const snapshot = await fetchRiderSnapshot(program, rider);
  assert.equal(snapshot.profileExists, true);
  assert.equal(snapshot.seasonExists, true);
  assert.equal(snapshot.expenses.length, 1);
  assert.equal(snapshot.expenses[0].committedCoverageCents, 10000n);
  assert.equal(snapshot.expenses[0].sponsorships[0].merchant.toBase58(), merchant.toBase58());
  const state = snapshotToViewState(snapshot);
  const id = expense.toBase58();
  assert.deepEqual(totals(state, id), {merchant: 10000, fan: 0, covered: 10000, remaining: 90000, progress: 10, supporters: 1});
  assert.equal(state.expenses[0].title, 'Expense #1');
  assert.equal(state.contributions[0].merchantAddress, merchant.toBase58());
  await put(expense, 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(100000),
    committedCoverageCents: new BN(16000), sponsorshipCount: new BN(2), category: 3,
    descriptionHash: Array(32).fill(7), bump: 1});
  await put(sponsorshipPda(expense, 1n), 'sponsorship', {expense, merchant, sponsorshipId: new BN(1),
    amountCents: new BN(6000), createdAt: new BN(1729000001), bump: 1});
  const updated = snapshotToViewState(await fetchRiderSnapshot(program, rider));
  assert.equal(totals(updated, id).merchant, 16000, 'expense coverage includes both verified records');
  assert.equal(updated.contributions.length, 2);
  await put(expense, 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(100000),
    committedCoverageCents: new BN(15000), sponsorshipCount: new BN(2), category: 3,
    descriptionHash: Array(32).fill(7), bump: 1});
  await assert.rejects(fetchRiderSnapshot(program, rider), /does not match its verified sponsorships/);
  accounts.set(profile.toBase58(), {...accounts.get(profile.toBase58()), owner: SystemProgram.programId});
  await assert.rejects(fetchRiderSnapshot(program, rider), /wrong program owner/);
  accounts.delete(programId.toBase58());
  await assert.rejects(fetchRiderSnapshot(program, rider), /not deployed/);
});
