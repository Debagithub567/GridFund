import test from 'node:test';
import assert from 'node:assert/strict';
import {BN} from '@anchor-lang/core';
import {Connection, Keypair, PublicKey, SystemProgram} from '@solana/web3.js';
import {createGridProgram} from '../src/chain/program.ts';
import {discoverRiderDirectory} from '../src/chain/riderDirectory.ts';
import {expensePda, riderProfilePda, seasonPda, sponsorshipPda} from '../src/chain/pdas.ts';

function fixture() {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const program = createGridProgram(connection);
  const records = new Map();
  const profiles = [];
  let filters;
  connection.getAccountInfo = async address => address.equals(program.programId)
    ? {data: Buffer.alloc(0), owner: SystemProgram.programId, executable: true, lamports: 1, rentEpoch: 0}
    : records.get(address.toBase58()) || null;
  connection.getMultipleAccountsInfo = async addresses => addresses.map(address => records.get(address.toBase58()) || null);
  connection.getProgramAccounts = async (address, config) => {
    assert(address.equals(program.programId));
    filters = config.filters;
    return profiles;
  };
  const put = async (address, type, value) => records.set(address.toBase58(), {
    data: await program.coder.accounts.encode(type, value), owner: program.programId,
    executable: false, lamports: 1, rentEpoch: 0,
  });
  const addRider = async () => {
    const rider = Keypair.generate().publicKey;
    const [profile, bump] = PublicKey.findProgramAddressSync([Buffer.from('rider'), rider.toBuffer()], program.programId);
    await put(profile, 'riderProfile', {rider, bump});
    profiles.push({pubkey: profile, account: records.get(profile.toBase58())});
    return {rider, profile, season: seasonPda(profile)};
  };
  return {connection, program, profiles, records, put, addRider, get filters() {return filters}};
}

test('directory filters and decodes real RiderProfile layouts; zero, one and multiple riders are deterministic', async () => {
  const data = fixture();
  assert.deepEqual(await discoverRiderDirectory(data.program), []);
  assert.deepEqual(data.filters, [{dataSize: 41}, {memcmp: data.program.coder.accounts.memcmp('riderProfile')}]);
  const first = await data.addRider();
  let rows = await discoverRiderDirectory(data.program);
  assert.equal(rows.length, 0, 'profile alone is not discoverable');
  const registerExpense = async ({rider, season}) => {
    await data.put(season, 'season', {rider, seasonId: new BN(1), budgetCents: new BN(50000),
      titleHash: Array(32).fill(0), status: 1, expenseCount: new BN(0), bump: 1});
    assert.equal((await discoverRiderDirectory(data.program)).length, rows.length, 'season alone is not discoverable');
    await data.put(season, 'season', {rider, seasonId: new BN(1), budgetCents: new BN(50000),
      titleHash: Array(32).fill(0), status: 1, expenseCount: new BN(1), bump: 1});
    await data.put(expensePda(season, 0n), 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(50000),
      committedCoverageCents: new BN(0), sponsorshipCount: new BN(0), category: 1,
      descriptionHash: Array(32).fill(0), bump: 1});
  };
  await registerExpense(first);
  rows = await discoverRiderDirectory(data.program);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayName, 'Rider #1');
  assert.equal(rows[0].rider.toBase58(), first.rider.toBase58());
  assert.equal(rows[0].seasonTitle, null);
  assert.equal(rows[0].expenseCount, 1);
  const second = await data.addRider();
  data.profiles.push(data.profiles[0]); // Defensive deduplication if an RPC repeats a row.
  await registerExpense(second);
  rows = await discoverRiderDirectory(data.program);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.rider.toBase58()), [first.rider, second.rider]
    .map(key => key.toBase58()).sort());
  assert.deepEqual(rows.map(row => row.displayName), ['Rider #1', 'Rider #2']);
});

test('directory reuses season, expense and sponsorship decoding and refreshes merchant coverage', async () => {
  const data = fixture();
  const {rider, season} = await data.addRider();
  const merchant = Keypair.generate().publicKey;
  const expense = expensePda(season, 0n);
  const sponsorship = sponsorshipPda(expense, 0n);
  await data.put(season, 'season', {rider, seasonId: new BN(1), budgetCents: new BN(90000),
    titleHash: Array(32).fill(0), status: 1, expenseCount: new BN(1), bump: 1});
  await data.put(expense, 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(50000),
    committedCoverageCents: new BN(0), sponsorshipCount: new BN(0), category: 1,
    descriptionHash: Array(32).fill(0), bump: 1});
  let [entry] = await discoverRiderDirectory(data.program);
  assert.equal(entry.seasonBudgetCents, 90000n);
  assert.equal(entry.expenseCount, 1);
  assert.equal(entry.merchantCoverageCents, 0n);
  assert.equal(entry.remainingCoverageCents, 50000n);
  assert.equal(entry.snapshot.expenses[0].address.toBase58(), expense.toBase58());
  await data.put(expense, 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(50000),
    committedCoverageCents: new BN(12345), sponsorshipCount: new BN(1), category: 1,
    descriptionHash: Array(32).fill(0), bump: 1});
  await data.put(sponsorship, 'sponsorship', {expense, merchant, sponsorshipId: new BN(0),
    amountCents: new BN(12345), createdAt: new BN(1729000000), bump: 1});
  [entry] = await discoverRiderDirectory(data.program);
  assert.equal(entry.merchantCoverageCents, 12345n);
  assert.equal(entry.remainingCoverageCents, 37655n);
  assert.equal(entry.snapshot.expenses[0].sponsorships[0].merchant.toBase58(), merchant.toBase58());
});

test('directory surfaces RPC failure instead of producing demo or cached riders', async () => {
  const data = fixture();
  await data.addRider();
  data.connection.getProgramAccounts = async () => {throw new Error('getProgramAccounts unavailable')};
  await assert.rejects(discoverRiderDirectory(data.program), /getProgramAccounts unavailable/);
  const other = fixture();
  const rider = await other.addRider();
  other.profiles[0].pubkey = Keypair.generate().publicKey;
  await assert.rejects(discoverRiderDirectory(other.program), /not canonical/);
  assert(riderProfilePda(rider.rider).equals(rider.profile));
});
