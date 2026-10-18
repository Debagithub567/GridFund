import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Keypair} from '@solana/web3.js';
import {contributeDirect, formatMockUsdc, parseMockUsdc, LOCAL_MOCK_USDC_MINT, DEVNET_MOCK_USDC_MINT} from '../src/chain/fanTransactions.ts';
import TransactionResultModal from '../src/TransactionResultModal.tsx';

test('mock-USDC amounts use exact six-decimal base units and the pinned local mint', () => {
  assert.equal(LOCAL_MOCK_USDC_MINT.toBase58(), '6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS');
  assert.equal(DEVNET_MOCK_USDC_MINT.toBase58(), 'Eu5ZdwKKpSNej1koShWYBm7SKoPE2utvtb3yLWSjRxf1');
  assert.equal(parseMockUsdc(' 1.234432 '), 1_234_432n);
  assert.equal(parseMockUsdc('0.000001'), 1n);
  assert.equal(parseMockUsdc('18446744073709.551615'), (1n << 64n) - 1n);
  assert.equal(formatMockUsdc(1_234_432n), '1.234432 gsUSDC');
  for (const invalid of ['0', '-1', '1.1234567', '1e3', '1.2.3', '18446744073709.551616', 'abc']) {
    assert.throws(() => parseMockUsdc(invalid));
  }
});

test('Fan adapter rejects zero before RPC and the result modal uses token units and real network links', async () => {
  await assert.rejects(contributeDirect({} , Keypair.generate().publicKey, 0n), /positive/);
  const rider = Keypair.generate().publicKey.toBase58();
  const result = {type: 'fan', onChain: true, expenseId: '', expenseTitle: 'Direct rider support', amountCents: 0,
    tokenAmountBaseUnits: '1234432', recipientAddress: rider, status: 'confirmed', cluster: 'localnet',
    endpoint: 'http://127.0.0.1:8899', signature: '2'.repeat(88)};
  const html = renderToStaticMarkup(React.createElement(TransactionResultModal, {result, onClose: () => {}}));
  assert.match(html, /Thanks for supporting my racing!/);
  assert.match(html, /1.234432 gsUSDC/);
  assert.match(html, new RegExp(rider));
  assert.match(html, /COPY LOCAL TRANSACTION SIGNATURE/);
  assert.doesNotMatch(html, /cluster=devnet/);
  assert.doesNotMatch(html, /€1/);
});

test('Fan setup creates only the canonical SPL token account after wallet approval and verification', async () => {
  const {prepareFanTokenAccount, approvedMockMint} = await import('../src/chain/fanTransactions.ts');
  const {MintLayout, MINT_SIZE, AccountLayout, ACCOUNT_SIZE, TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync} = await import('@solana/spl-token');
  const fan = Keypair.generate().publicKey;
  const zero = Keypair.generate().publicKey;
  const ata = getAssociatedTokenAddressSync(approvedMockMint, fan);
  const mintData = Buffer.alloc(MINT_SIZE);
  MintLayout.encode({mintAuthorityOption:0,mintAuthority:zero,supply:0n,decimals:6,isInitialized:true,
    freezeAuthorityOption:0,freezeAuthority:zero},mintData);
  const accountData = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode({mint:approvedMockMint,owner:fan,amount:0n,delegateOption:0,delegate:zero,state:1,
    isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:zero},accountData);
  const info = data => ({data,owner:TOKEN_PROGRAM_ID,lamports:1,executable:false,rentEpoch:0});
  let created = false, submitted = 0;
  const connection = {
    getAccountInfo: async key => key.equals(approvedMockMint) ? info(mintData) : key.equals(ata) && created ? info(accountData) : null,
    getLatestBlockhash: async () => ({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),
    confirmTransaction: async () => {created=true;return {value:{err:null}}},
  };
  const stages=[];
  const result = await prepareFanTokenAccount({connection,fan,onProgress:value=>stages.push(value.stage),
    send:async tx => {submitted++;assert.equal(tx.instructions.length,1);assert.ok(tx.instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));return '2'.repeat(88)}});
  assert.equal(submitted,1);
  assert.equal(result.address.toBase58(),ata.toBase58());
  assert.deepEqual(stages,['awaiting-wallet','submitted','confirming','verifying','confirmed']);
  await assert.rejects(prepareFanTokenAccount({connection,fan,onProgress:()=>{},send:async()=>{submitted++;return '3'.repeat(88)}}),/already exists/);
  assert.equal(submitted,1,'existing ATA cannot cause another signature request');
});
