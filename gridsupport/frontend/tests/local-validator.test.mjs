import test from 'node:test';
import assert from 'node:assert/strict';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import {BN} from '@anchor-lang/core';
import {createGridProgram} from '../src/chain/program.ts';
import {fetchRiderSnapshot} from '../src/chain/accounts.ts';
import {initializeRider, createSeason, addExpense} from '../src/chain/riderTransactions.ts';
import {sponsorExpense} from '../src/chain/merchantTransactions.ts';
import {sha256Text} from '../src/chain/metadata.ts';
import {explorerTransactionUrl} from '../src/chain/explorer.ts';
import {expensePda, sponsorshipPda} from '../src/chain/pdas.ts';

const rpc = process.env.GRIDSUPPORT_LOCAL_RPC;
test('signed Rider workflow on an isolated local validator', {skip: !rpc}, async () => {
  const connection = new Connection(rpc, 'confirmed');
  const rider = Keypair.generate();
  const outsider = Keypair.generate();
  const airdrop = await connection.requestAirdrop(rider.publicKey, 2_000_000_000);
  const airdropBlockhash = await connection.getLatestBlockhash('confirmed');
  assert.equal((await connection.confirmTransaction({signature: airdrop, ...airdropBlockhash}, 'confirmed')).value.err, null);
  const wallet = {
    publicKey: rider.publicKey,
    signTransaction: async transaction => {transaction.partialSign(rider);return transaction},
    signAllTransactions: async transactions => {for (const transaction of transactions) transaction.partialSign(rider);return transactions},
  };
  const program = createGridProgram(connection, wallet);
  const progress = [];
  const send = async transaction => {
    assert(transaction instanceof Transaction);
    assert(transaction.feePayer.equals(rider.publicKey));
    transaction.sign(rider);
    return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false, preflightCommitment: 'confirmed'});
  };
  const ctx = {program, connection, rider: rider.publicKey, send, onProgress: value => progress.push(value)};
  const initial = await fetchRiderSnapshot(program, rider.publicKey);
  assert.equal(initial.profileExists, false);
  const profile = await initializeRider(ctx);
  assert.equal(profile.snapshot.profileExists, true);
  assert.deepEqual(progress.map(value => value.stage), ['awaiting-wallet','submitted','confirming']);
  assert.match(explorerTransactionUrl(profile.signature, 'localnet', rpc), /cluster=custom/);
  await assert.rejects(initializeRider(ctx), /already exists/);
  await assert.rejects(createSeason(ctx, 0, 'Race season'), /positive season budget/);
  const season = await createSeason(ctx, 123456, '2026 Road Racing');
  assert.equal(season.snapshot.seasonBudgetCents, 123456n);
  assert.deepEqual(season.snapshot.seasonTitleHash, await sha256Text('2026 Road Racing'));
  await assert.rejects(createSeason(ctx, 1, 'Duplicate'), /already has a season/);
  await assert.rejects(addExpense(ctx, 0, 1, 'Zero'), /positive expense amount/);
  await assert.rejects(addExpense(ctx, -1, 1, 'Negative'), /positive expense amount/);
  await assert.rejects(addExpense(ctx, 1, 256, 'Invalid category'), /valid expense category/);
  const first = await addExpense(ctx, 12345, 1, 'Tyres for race weekend');
  const second = await addExpense(ctx, 67, 2, 'Travel to circuit');
  assert.equal(first.address.toBase58(), expensePda(season.address, 0n).toBase58());
  assert.equal(second.address.toBase58(), expensePda(season.address, 1n).toBase58());
  assert.notEqual(first.address.toBase58(), second.address.toBase58());
  assert.equal(second.snapshot.expenses.length, 2);
  assert.equal(second.snapshot.expenses[0].estimatedCostCents, 12345n);
  assert.deepEqual(second.snapshot.expenses[0].descriptionHash, await sha256Text('Tyres for race weekend'));
  assert.equal(second.snapshot.expenses[1].estimatedCostCents, 67n);
  const fetched = await fetchRiderSnapshot(program, rider.publicKey);
  assert.equal(fetched.expenses.length, 2);
  assert.equal(fetched.profileExists, true);
  assert.equal(fetched.seasonExists, true);
  const rejectedCtx = {...ctx, send: async () => {throw new Error('User rejected the request')}};
  await assert.rejects(addExpense(rejectedCtx, 100, 0, 'Rejected'), /rejected/);
  assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses.length, 2);

  // Wrong signer and wrong PDA are submitted against the real program and must fail.
  const instruction = await program.methods.initializeRider().accountsStrict({
    rider: outsider.publicKey, riderProfile: profile.address, systemProgram: new PublicKey('11111111111111111111111111111111'),
  }).instruction();
  const latest = await connection.getLatestBlockhash('confirmed');
  const wrongSigner = new Transaction({feePayer: rider.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight}).add(instruction);
  wrongSigner.sign(rider);
  assert.throws(() => wrongSigner.serialize(), /signature verification failed/i);
  const wrongExpense = await program.methods.addExpense(new BN(100), 0, await sha256Text('Wrong PDA')).accountsStrict({
    rider: rider.publicKey, riderProfile: profile.address, season: season.address,
    expense: expensePda(season.address, 77n), systemProgram: SystemProgram.programId,
  }).instruction();
  const wrongTransaction = new Transaction({feePayer: rider.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight}).add(wrongExpense);
  wrongTransaction.sign(rider);
  await assert.rejects(connection.sendRawTransaction(wrongTransaction.serialize(), {skipPreflight: false}), /Simulation failed|custom program error|ConstraintSeeds/i);
  assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses.length, 2);
  console.log('Local validator confirmed Rider signatures:', [profile.signature, season.signature, first.signature, second.signature].join(' '));
});

test('signed Shop sponsorship workflow on an isolated local validator', {skip: !rpc}, async () => {
  const connection = new Connection(rpc, 'confirmed');
  const rider = Keypair.generate();
  const merchant = Keypair.generate();
  const otherRider = Keypair.generate();
  for (const signer of [rider, merchant, otherRider]) {
    const signature = await connection.requestAirdrop(signer.publicKey, 2_000_000_000);
    const latest = await connection.getLatestBlockhash('confirmed');
    assert.equal((await connection.confirmTransaction({signature, ...latest}, 'confirmed')).value.err, null);
  }
  const program = createGridProgram(connection);
  const sendBy = signer => async transaction => {
    assert(transaction instanceof Transaction);
    assert(transaction.feePayer.equals(signer.publicKey));
    transaction.sign(signer);
    return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false, preflightCommitment: 'confirmed'});
  };
  const riderCtx = {program, connection, rider: rider.publicKey, send: sendBy(rider), onProgress: () => {}};
  await initializeRider(riderCtx);
  const season = await createSeason(riderCtx, 10000, 'Shop test season');
  const expense = await addExpense(riderCtx, 10000, 1, 'Real in-kind need');
  const otherCtx = {program, connection, rider: otherRider.publicKey, send: sendBy(otherRider), onProgress: () => {}};
  await initializeRider(otherCtx);
  const otherSeason = await createSeason(otherCtx, 10000, 'Other season');
  const progress = [];
  const shopCtx = {program, connection, merchant: merchant.publicKey, send: sendBy(merchant), onProgress: value => progress.push(value.stage)};
  const initial = await fetchRiderSnapshot(program, rider.publicKey);
  assert.equal(initial.expenses[0].committedCoverageCents, 0n);
  assert.equal(initial.expenses[0].estimatedCostCents - initial.expenses[0].committedCoverageCents, 10000n);

  const first = await sponsorExpense(shopCtx, rider.publicKey, expense.address, 1234);
  assert.equal(first.address.toBase58(), sponsorshipPda(expense.address, 0n).toBase58());
  assert.equal(first.snapshot.expenses[0].committedCoverageCents, 1234n);
  assert.equal(first.snapshot.expenses[0].sponsorships[0].merchant.toBase58(), merchant.publicKey.toBase58());
  assert.equal(first.snapshot.expenses[0].sponsorships[0].amountCents, 1234n);
  assert.deepEqual(progress, ['awaiting-wallet', 'submitted', 'confirming', 'verifying']);
  assert.match(explorerTransactionUrl(first.signature, 'localnet', rpc), /cluster=custom/);
  const second = await sponsorExpense(shopCtx, rider.publicKey, expense.address, 67);
  assert.equal(second.address.toBase58(), sponsorshipPda(expense.address, 1n).toBase58());
  assert.notEqual(first.address.toBase58(), second.address.toBase58());
  assert.equal(second.snapshot.expenses[0].committedCoverageCents, 1301n);
  assert.equal(second.snapshot.expenses[0].estimatedCostCents - second.snapshot.expenses[0].committedCoverageCents, 8699n);
  assert.equal(second.snapshot.expenses[0].sponsorships.length, 2);
  await assert.rejects(sponsorExpense(shopCtx, rider.publicKey, expense.address, 0), /positive sponsorship/);
  await assert.rejects(sponsorExpense(shopCtx, rider.publicKey, expense.address, -1), /positive sponsorship/);
  await assert.rejects(sponsorExpense(shopCtx, rider.publicKey, expense.address, 1.5), /exact EUR cents/);
  await assert.rejects(sponsorExpense(shopCtx, rider.publicKey, expense.address, 8700), /remain/);
  await assert.rejects(sponsorExpense(shopCtx, otherRider.publicKey, expense.address, 1), /belonging to this rider/);
  const rejectedCtx = {...shopCtx, send: async () => {throw new Error('User rejected the request')}};
  await assert.rejects(sponsorExpense(rejectedCtx, rider.publicKey, expense.address, 1), /rejected/);
  assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses[0].sponsorshipCount, 2n);

  const rawSponsor = async (amount, accounts, signer = merchant) => {
    const instruction = await program.methods.sponsorExpense(new BN(amount)).accountsStrict(accounts).instruction();
    const latest = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({feePayer: merchant.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight}).add(instruction);
    transaction.sign(signer);
    return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false, preflightCommitment: 'confirmed'});
  };
  const accounts = {merchant: merchant.publicKey, season: season.address, expense: expense.address,
    sponsorship: sponsorshipPda(expense.address, 2n), systemProgram: SystemProgram.programId};
  await assert.rejects(rawSponsor(0, accounts), /Simulation failed|custom program error/i);
  await assert.rejects(rawSponsor(8700, accounts), /Simulation failed|custom program error/i);
  await assert.rejects(rawSponsor(1, {...accounts, season: otherSeason.address}), /Simulation failed|custom program error|ConstraintSeeds/i);
  await assert.rejects(rawSponsor(1, {...accounts, sponsorship: sponsorshipPda(expense.address, 99n)}), /Simulation failed|custom program error|ConstraintSeeds/i);
  const wrongSignerInstruction = await program.methods.sponsorExpense(new BN(1)).accountsStrict({...accounts, merchant: otherRider.publicKey}).instruction();
  const latest = await connection.getLatestBlockhash('confirmed');
  const wrongSigner = new Transaction({feePayer: merchant.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight}).add(wrongSignerInstruction);
  wrongSigner.sign(merchant);
  assert.throws(() => wrongSigner.serialize(), /signature verification failed/i);
  assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses[0].sponsorshipCount, 2n);

  const full = await sponsorExpense(shopCtx, rider.publicKey, expense.address, 8699);
  assert.equal(full.snapshot.expenses[0].committedCoverageCents, 10000n);
  assert.equal(full.snapshot.expenses[0].estimatedCostCents - full.snapshot.expenses[0].committedCoverageCents, 0n);
  await assert.rejects(sponsorExpense(shopCtx, rider.publicKey, expense.address, 1), /fully covered/);
  await assert.rejects(rawSponsor(1, {...accounts, sponsorship: sponsorshipPda(expense.address, 3n)}), /Simulation failed|custom program error/i);
  const riderRead = await fetchRiderSnapshot(program, rider.publicKey);
  const shopRead = await fetchRiderSnapshot(program, rider.publicKey);
  assert.equal(riderRead.expenses[0].committedCoverageCents, shopRead.expenses[0].committedCoverageCents);
  assert.equal(riderRead.expenses[0].sponsorships.length, 3);
  console.log('Local validator confirmed Shop signatures:', [first.signature, second.signature, full.signature].join(' '));
});
