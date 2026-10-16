import test from 'node:test';
import assert from 'node:assert/strict';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import {BN} from '@anchor-lang/core';
import {createGridProgram} from '../src/chain/program.ts';
import {fetchRiderSnapshot} from '../src/chain/accounts.ts';
import {initializeRider, createSeason, addExpense} from '../src/chain/riderTransactions.ts';
import {sha256Text} from '../src/chain/metadata.ts';
import {explorerTransactionUrl} from '../src/chain/explorer.ts';
import {expensePda} from '../src/chain/pdas.ts';

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
