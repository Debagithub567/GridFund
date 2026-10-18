import test from 'node:test';
import assert from 'node:assert/strict';
import {BN} from '@anchor-lang/core';
import {Connection, Keypair, PublicKey, SystemProgram} from '@solana/web3.js';
import {createGridProgram} from '../src/chain/program.ts';
import {confirmBudget, budgetIsVerified, matchingBudgetExpenses} from '../src/chain/budget.ts';
import {registrationFromSnapshot, loadBudgetIntent, saveBudgetIntent} from '../src/chain/registration.ts';
import {discoverRiderDirectory} from '../src/chain/riderDirectory.ts';
import {fetchRiderSnapshot} from '../src/chain/accounts.ts';
import {expensePda, riderProfilePda, seasonPda} from '../src/chain/pdas.ts';
import {sha256Text} from '../src/chain/metadata.ts';

const plan = {name: 'Pol Espargaró', season: '2026', expenses: [
  {title: 'Racing tyres', description: 'Racing tyres', amountCents: 50000, category: 1},
  {title: 'Fuel & travel', description: 'Fuel & travel', amountCents: 30000, category: 2},
  {title: 'Accommodation & food', description: 'Accommodation & food', amountCents: 20000, category: 4},
]};

async function fixture() {
  const rider = Keypair.generate().publicKey;
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const program = createGridProgram(connection);
  const profile = riderProfilePda(rider);
  const season = seasonPda(profile);
  const records = new Map();
  const put = async (address, type, value) => records.set(address.toBase58(), {
    data: await program.coder.accounts.encode(type, value), owner: program.programId, executable: false, lamports: 1, rentEpoch: 0,
  });
  connection.getAccountInfo = async address => address.equals(program.programId)
    ? {data: Buffer.alloc(0), owner: SystemProgram.programId, executable: true, lamports: 1, rentEpoch: 0}
    : records.get(address.toBase58()) || null;
  connection.getMultipleAccountsInfo = async addresses => addresses.map(address => records.get(address.toBase58()) || null);
  const addProfile = async () => {
    const [, bump] = PublicKey.findProgramAddressSync([Buffer.from('rider'), rider.toBuffer()], program.programId);
    await put(profile, 'riderProfile', {rider, bump});
  };
  const addSeason = async (count = 0) => put(season, 'season', {rider, seasonId: new BN(1),
    budgetCents: new BN(100000), titleHash: await sha256Text('2026'), status: 1, expenseCount: new BN(count), bump: 1});
  const addItem = async (index, item) => {
    await put(expensePda(season, BigInt(index)), 'expense', {season, expenseId: new BN(index),
      estimatedCostCents: new BN(item.amountCents), committedCoverageCents: new BN(0), sponsorshipCount: new BN(0),
      category: item.category, descriptionHash: await sha256Text(item.description), bump: 1});
    await addSeason(index + 1);
  };
  return {rider, connection, program, profile, season, records, put, addProfile, addSeason, addItem,
    snapshot: () => fetchRiderSnapshot(program, rider)};
}

test('fresh, partial and complete registration states come from verified accounts and restore after reload', async () => {
  const f = await fixture();
  const storage = new Map();
  globalThis.localStorage = {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)};
  saveBudgetIntent(f.rider.toBase58(), plan);
  const restored = loadBudgetIntent(f.rider.toBase58());
  assert.deepEqual(restored, plan);
  assert.equal(await registrationFromSnapshot(await f.snapshot(), restored), 'unregistered');
  await f.addProfile();
  assert.equal(await registrationFromSnapshot(await f.snapshot(), restored), 'partial');
  await f.addSeason();
  assert.equal(await registrationFromSnapshot(await f.snapshot(), restored), 'partial');
  await f.addItem(0, plan.expenses[0]);
  assert.equal(await registrationFromSnapshot(await f.snapshot(), restored), 'partial');
  assert.equal(await registrationFromSnapshot(await f.snapshot(), null), 'partial', 'default budget needs all three verified expenses without local intent');
  await f.addItem(1, plan.expenses[1]);
  await f.addItem(2, plan.expenses[2]);
  assert.equal(await registrationFromSnapshot(await f.snapshot(), restored), 'registered');
  assert.equal(await registrationFromSnapshot(await f.snapshot(), null), 'registered');
  assert.equal(await budgetIsVerified(await f.snapshot(), restored), true);
  await f.addItem(3, {title: 'Unrelated', description: 'Test extra', amountCents: 5000, category: 0});
  assert.equal(await registrationFromSnapshot(await f.snapshot(), restored), 'registered', 'fourth expense is not part of original budget');
  assert.equal((await matchingBudgetExpenses(await f.snapshot(), restored)).filter(item => item.match).length, 3);
  delete globalThis.localStorage;
});

test('complete registration skips all existing intended expenses and does not include an unrelated fourth', async () => {
  const f = await fixture();
  await f.addProfile(); await f.addSeason();
  for (const [index, item] of plan.expenses.entries()) await f.addItem(index, item);
  await f.addItem(3, {title: 'Unrelated', description: 'Test extra', amountCents: 5000, category: 0});
  let sends = 0;
  const stages = [];
  const result = await confirmBudget({program: f.program, connection: f.connection, rider: f.rider,
    send: async () => {sends++; throw new Error('Unexpected signing request')}, onProgress: () => {}}, plan, step => stages.push(step.stage));
  assert.equal(sends, 0);
  assert.equal(result.expenses.length, 4);
  assert.deepEqual(stages, ['skipped','skipped','skipped','skipped','skipped']);
  const altered = {...plan, expenses: [{...plan.expenses[0], amountCents: 51000}, ...plan.expenses.slice(1)]};
  await assert.rejects(confirmBudget({program: f.program, connection: f.connection, rider: f.rider,
    send: async () => {sends++; return 'x'}, onProgress: () => {}}, altered, () => {}), /different on-chain amount/);
  assert.equal(sends, 0);
});

test('interrupted expense registration resumes only the missing account after Phantom rejection', async () => {
  const f = await fixture();
  await f.addProfile(); await f.addSeason(); await f.addItem(0, plan.expenses[0]);
  let calls = 0;
  f.connection.getLatestBlockhash = async () => ({blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100});
  const context = {program: f.program, connection: f.connection, rider: f.rider,
    send: async () => {calls++; if (calls === 1) throw new Error('User rejected the request'); return String(calls).repeat(88)},
    onProgress: () => {}};
  await assert.rejects(confirmBudget(context, plan, () => {}), /User rejected/);
  assert.equal((await f.snapshot()).expenses.length, 1);
  f.connection.confirmTransaction = async () => {
    const index = (await f.snapshot()).expenses.length;
    await f.addItem(index, plan.expenses[index]);
    return {value: {err: null}};
  };
  const result = await confirmBudget(context, plan, () => {});
  assert.equal(result.expenses.length, 3);
  assert.equal(calls, 3, 'one rejected request followed by exactly two missing expenses');
  assert.equal(await budgetIsVerified(result, plan), true);
});

test('shared discovery hides profile and season until an expense exists', async () => {
  const f = await fixture();
  f.connection.getProgramAccounts = async () => {
    const account = f.records.get(f.profile.toBase58());
    return account ? [{pubkey: f.profile, account}] : [];
  };
  assert.equal((await discoverRiderDirectory(f.program)).length, 0);
  await f.addProfile();
  assert.equal((await discoverRiderDirectory(f.program)).length, 0);
  await f.addSeason();
  assert.equal((await discoverRiderDirectory(f.program)).length, 0);
  await f.addItem(0, plan.expenses[0]);
  assert.equal((await discoverRiderDirectory(f.program)).length, 1);
});

test('additional expense retry creates only the missing account and preserves the original season scope', async () => {
  const {confirmAdditionalExpenses} = await import('../src/chain/budget.ts');
  const f = await fixture();
  await f.addProfile(); await f.addSeason();
  for (const [index, item] of plan.expenses.entries()) await f.addItem(index, item);
  const added = [{title:'Test entry', description:'Separate €50 test entry', amountCents:5000, category:0}];
  f.connection.getLatestBlockhash = async () => ({blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100});
  let signatures = 0;
  const context = {program:f.program, connection:f.connection, rider:f.rider,
    send:async()=>{signatures++; if (signatures === 1) throw new Error('User rejected the request'); return '2'.repeat(88)}, onProgress:()=>{}};
  await assert.rejects(confirmAdditionalExpenses(context, added, plan, ()=>{}), /User rejected/);
  assert.equal((await f.snapshot()).expenses.length, 3);
  f.connection.confirmTransaction = async () => {await f.addItem(3, added[0]); return {value:{err:null}}};
  const result = await confirmAdditionalExpenses(context, added, plan, ()=>{});
  assert.equal(result.expenses.length, 4);
  assert.equal(result.seasonBudgetCents, 100000n);
  assert.equal(await budgetIsVerified(result, plan), true);
  await confirmAdditionalExpenses(context, added, plan, ()=>{});
  assert.equal(signatures, 2, 'verified retry requests no extra signature');
});

test('original budget accounting keeps the €50 extra separate and Fan support out of expense coverage', async () => {
  const {fundingTotals} = await import('../src/chain/funding.ts');
  const f = await fixture();
  await f.addProfile(); await f.addSeason();
  for (const [index, item] of plan.expenses.entries()) await f.addItem(index, item);
  await f.addItem(3, {title:'Extra', description:'Extra test expense', amountCents:5000, category:0});
  const snapshot = await f.snapshot();
  snapshot.expenses[0].committedCoverageCents = 6000n;
  snapshot.expenses[2].committedCoverageCents = 10000n;
  const ids = (await matchingBudgetExpenses(snapshot,plan)).map(item => item.match.address.toBase58());
  const receipt = {signature:'2'.repeat(88),rider:f.rider.toBase58(),fan:'fan',source:'source',amount:'20000000'};
  const totals = fundingTotals(snapshot,[receipt],ids);
  assert.deepEqual({required:totals.requiredCents,merchant:totals.merchantCents,fan:totals.fanCents,
    remaining:totals.remainingCents,extra:totals.extraCents,count:totals.extraCount},
    {required:100000,merchant:16000,fan:2000,remaining:82000,extra:5000,count:1});
  assert.equal(snapshot.expenses[0].committedCoverageCents,6000n,'Fan support does not alter a card');
});
