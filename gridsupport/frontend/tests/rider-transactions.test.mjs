import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Connection, Keypair, SystemProgram} from '@solana/web3.js';
import {createGridProgram} from '../src/chain/program.ts';
import {initializeRider, riderError} from '../src/chain/riderTransactions.ts';
import {riderProfilePda} from '../src/chain/pdas.ts';
import {sha256Text, saveExpenseMetadata, verifiedExpenseMetadata} from '../src/chain/metadata.ts';
import {explorerTransactionUrl} from '../src/chain/explorer.ts';
import TransactionResultModal from '../src/TransactionResultModal.tsx';

test('Rider adapter sends a wallet transaction, confirms it, then refreshes and decodes the account', async () => {
  const rider = Keypair.generate().publicKey;
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const program = createGridProgram(connection);
  const profileAddress = riderProfilePda(rider);
  const profileData = await program.coder.accounts.encode('riderProfile', {rider, bump: 1});
  let exists = false;
  const stages = [];
  let sends = 0;
  connection.getAccountInfo = async address => address.equals(program.programId) ?
    {data: Buffer.alloc(0), owner: SystemProgram.programId, executable: true} :
    exists && address.equals(profileAddress) ? {data: profileData, owner: program.programId, executable: false} : null;
  connection.getLatestBlockhash = async () => ({blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100});
  connection.confirmTransaction = async () => {exists = true;return {value: {err: null}}};
  const signature = '2'.repeat(88);
  const ctx = {program, connection, rider,
    send: async transaction => {sends++;assert(transaction.feePayer.equals(rider));assert(transaction.instructions[0].programId.equals(program.programId));return signature},
    onProgress: progress => stages.push(progress.stage),
  };
  const result = await initializeRider(ctx);
  assert.equal(result.signature, signature);
  assert.equal(result.snapshot.profileExists, true);
  assert.deepEqual(stages, ['awaiting-wallet','submitted','confirming']);
  await assert.rejects(initializeRider(ctx), /already exists/);
  assert.equal(sends, 1);
});

test('Rider success waits for account visibility and never reports a failed confirmation as success', async () => {
  const rider = Keypair.generate().publicKey;
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const program = createGridProgram(connection);
  const profileAddress = riderProfilePda(rider);
  const profileData = await program.coder.accounts.encode('riderProfile', {rider, bump: 1});
  let confirmed = false;
  let readsAfterConfirmation = 0;
  connection.getAccountInfo = async address => {
    if (address.equals(program.programId)) return {data: Buffer.alloc(0), owner: SystemProgram.programId, executable: true};
    if (!address.equals(profileAddress) || !confirmed) return null;
    readsAfterConfirmation++;
    return readsAfterConfirmation >= 2 ? {data: profileData, owner: program.programId, executable: false} : null;
  };
  connection.getLatestBlockhash = async () => ({blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100});
  connection.confirmTransaction = async () => {confirmed = true;return {value: {err: null}}};
  const stages = [];
  const context = {program, connection, rider, send: async () => '2'.repeat(88), onProgress: value => stages.push(value.stage)};
  const result = await initializeRider(context);
  assert.equal(result.snapshot.profileExists, true);
  assert.equal(readsAfterConfirmation, 2);
  assert.deepEqual(stages, ['awaiting-wallet', 'submitted', 'confirming']);

  confirmed = false;
  readsAfterConfirmation = 0;
  stages.length = 0;
  connection.confirmTransaction = async () => ({value: {err: {InstructionError: [0, 'Custom']}}});
  await assert.rejects(initializeRider(context), /failed/);
  assert.equal(readsAfterConfirmation, 0);
  assert.deepEqual(stages, ['awaiting-wallet', 'submitted', 'confirming']);
});

test('metadata uses exact trimmed UTF-8 SHA-256 bytes and rejects tampered descriptions', async () => {
  const source=' Tyres € 🏁 ';
  const hash=await sha256Text(source);
  assert.deepEqual(hash, Array.from(createHash('sha256').update('Tyres € 🏁','utf8').digest()));
  const values=new Map();
  globalThis.localStorage={getItem: key => values.get(key) ?? null,setItem:(key,value)=>values.set(key,value)};
  const address=Keypair.generate().publicKey.toBase58();
  saveExpenseMetadata(address,'Racing tyres',' Tyres € 🏁 ',1,hash);
  assert.deepEqual(await verifiedExpenseMetadata(address,hash,1),{title:'Racing tyres',description:'Tyres € 🏁',category:1});
  assert.equal(await verifiedExpenseMetadata(address,hash,2),undefined);
  assert.equal(await verifiedExpenseMetadata(address,Array(32).fill(0),1),undefined);
  const key=[...values.keys()][0];
  values.set(key,JSON.stringify({title:'Racing tyres',description:'Altered',category:1,descriptionHash:hash}));
  assert.equal(await verifiedExpenseMetadata(address,hash,1),undefined);
  delete globalThis.localStorage;
});

test('wallet rejection and transaction errors are displayed; Explorer links respect the configured network', () => {
  assert.match(riderError(new Error('User rejected the request')), /Wallet approval was rejected/);
  assert.match(riderError(new Error('insufficient funds')), /Insufficient SOL/);
  assert.match(riderError(new Error('account already in use')), /already exists/);
  const signature='2'.repeat(88);
  assert.equal(explorerTransactionUrl(signature,'devnet'),`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  assert.equal(explorerTransactionUrl(signature,'localnet','http://127.0.0.1:8899'),`https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
  assert.equal(explorerTransactionUrl('bad','devnet'),null);
  const html=renderToStaticMarkup(React.createElement(TransactionResultModal,{result:{
    type:'profile',expenseId:'',expenseTitle:'RiderProfile',amountCents:0,status:'error',cluster:'localnet',endpoint:'http://127.0.0.1:8899',errorMessage:'Wallet approval was rejected. No account was created.',
  },onClose:()=>{}}));
  assert.match(html,/Wallet approval was rejected/);
  assert.match(html,/Failed or rejected/);
  assert.doesNotMatch(html,/href="https:\/\/explorer/);
});
