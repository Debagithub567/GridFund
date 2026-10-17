import test from 'node:test';
import assert from 'node:assert/strict';
import {BN} from '@anchor-lang/core';
import {Connection, Keypair, SystemProgram} from '@solana/web3.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGridProgram, gridIdl} from '../src/chain/program.ts';
import {sponsorExpense} from '../src/chain/merchantTransactions.ts';
import {riderProfilePda, seasonPda, expensePda, sponsorshipPda} from '../src/chain/pdas.ts';
import TransactionResultModal from '../src/TransactionResultModal.tsx';

test('Shop adapter follows IDL account order and verifies a signed commitment before success', async () => {
  assert.deepEqual(gridIdl.instructions.find(item => item.name === 'sponsor_expense').accounts.map(item => item.name),
    ['merchant', 'season', 'expense', 'sponsorship', 'system_program']);
  const rider = Keypair.generate().publicKey;
  const merchant = Keypair.generate().publicKey;
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const program = createGridProgram(connection);
  const profile = riderProfilePda(rider);
  const season = seasonPda(profile);
  const expense = expensePda(season, 0n);
  const sponsorship = sponsorshipPda(expense, 0n);
  const accounts = new Map();
  const put = async (address, type, value) => accounts.set(address.toBase58(), {
    data: await program.coder.accounts.encode(type, value), owner: program.programId, executable: false,
  });
  await put(profile, 'riderProfile', {rider, bump: 1});
  await put(season, 'season', {rider, seasonId: new BN(1), budgetCents: new BN(20000), titleHash: Array(32).fill(0), status: 1, expenseCount: new BN(1), bump: 1});
  const putExpense = (coverage, count) => put(expense, 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(20000),
    committedCoverageCents: new BN(coverage), sponsorshipCount: new BN(count), category: 0, descriptionHash: Array(32).fill(0), bump: 1});
  await putExpense(0, 0);
  connection.getAccountInfo = async address => address.equals(program.programId)
    ? {data: Buffer.alloc(0), owner: SystemProgram.programId, executable: true} : accounts.get(address.toBase58()) || null;
  connection.getMultipleAccountsInfo = async addresses => addresses.map(address => accounts.get(address.toBase58()) || null);
  connection.getLatestBlockhash = async () => ({blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100});
  const stages = [];
  let sends = 0;
  const signature = '2'.repeat(88);
  const ctx = {program, connection, merchant,
    send: async transaction => {
      sends++;
      assert(transaction.feePayer.equals(merchant));
      assert.deepEqual(transaction.instructions[0].keys.map(key => key.pubkey.toBase58()).slice(0, 4),
        [merchant, season, expense, sponsorshipPda(expense, BigInt(sends - 1))].map(key => key.toBase58()));
      return signature;
    },
    onProgress: value => stages.push(value.stage),
  };
  connection.confirmTransaction = async () => {
    await putExpense(1234, 1);
    await put(sponsorship, 'sponsorship', {expense, merchant, sponsorshipId: new BN(0), amountCents: new BN(1234), createdAt: new BN(1), bump: 1});
    return {value: {err: null}};
  };
  const result = await sponsorExpense(ctx, rider, expense, 1234);
  assert.equal(result.signature, signature);
  assert.equal(result.address.toBase58(), sponsorship.toBase58());
  assert.equal(result.snapshot.expenses[0].committedCoverageCents, 1234n);
  assert.equal(result.snapshot.expenses[0].sponsorships[0].merchant.toBase58(), merchant.toBase58());
  assert.deepEqual(stages, ['awaiting-wallet', 'submitted', 'confirming', 'verifying']);
  assert.equal(sends, 1);
  await assert.rejects(sponsorExpense(ctx, rider, expense, 0), /positive sponsorship/);
  await assert.rejects(sponsorExpense(ctx, rider, expense, 20000), /remain/);
  assert.equal(sends, 1);
  stages.length = 0;
  connection.confirmTransaction = async () => ({value: {err: null}});
  await assert.rejects(sponsorExpense(ctx, rider, expense, 1), /could not be verified/);
  assert.deepEqual(stages, ['awaiting-wallet', 'submitted', 'confirming', 'verifying']);
  assert.equal(sends, 2);
});

test('Shop adapter does not verify or report success after a failed confirmation', async () => {
  const rider = Keypair.generate().publicKey;
  const merchant = Keypair.generate().publicKey;
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const program = createGridProgram(connection);
  const profile = riderProfilePda(rider);
  const season = seasonPda(profile);
  const expense = expensePda(season, 0n);
  const accounts = new Map();
  for (const [address, type, value] of [
    [profile, 'riderProfile', {rider, bump: 1}],
    [season, 'season', {rider, seasonId: new BN(1), budgetCents: new BN(100), titleHash: Array(32).fill(0), status: 1, expenseCount: new BN(1), bump: 1}],
    [expense, 'expense', {season, expenseId: new BN(0), estimatedCostCents: new BN(100), committedCoverageCents: new BN(0), sponsorshipCount: new BN(0), category: 0, descriptionHash: Array(32).fill(0), bump: 1}],
  ]) accounts.set(address.toBase58(), {data: await program.coder.accounts.encode(type, value), owner: program.programId, executable: false});
  connection.getAccountInfo = async address => address.equals(program.programId)
    ? {data: Buffer.alloc(0), owner: SystemProgram.programId, executable: true} : accounts.get(address.toBase58()) || null;
  connection.getMultipleAccountsInfo = async addresses => addresses.map(address => accounts.get(address.toBase58()) || null);
  connection.getLatestBlockhash = async () => ({blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100});
  connection.confirmTransaction = async () => ({value: {err: {InstructionError: [0, 'Custom']}}});
  const stages = [];
  await assert.rejects(sponsorExpense({program, connection, merchant, send: async () => '2'.repeat(88),
    onProgress: value => stages.push(value.stage)}, rider, expense, 1), /failed/);
  assert.deepEqual(stages, ['awaiting-wallet', 'submitted', 'confirming']);
  const markup = renderToStaticMarkup(React.createElement(TransactionResultModal, {result: {
    type: 'merchant', onChain: true, expenseId: expense.toBase58(), expenseTitle: 'Expense #1', amountCents: 1,
    status: 'error', cluster: 'localnet', endpoint: 'http://127.0.0.1:8899', signature: '2'.repeat(88),
    errorMessage: 'Transaction confirmed, but the sponsorship account could not be verified. Refresh accounts before retrying.',
  }, onClose: () => {}}));
  assert.match(markup, /CHECK ACCOUNT STATUS/);
  assert.match(markup, /Confirmed; account check incomplete/);
  assert.match(markup, /cluster=custom/);
});
