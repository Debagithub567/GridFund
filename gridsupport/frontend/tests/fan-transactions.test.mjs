import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Keypair} from '@solana/web3.js';
import {contributeDirect, formatMockUsdc, parseMockUsdc, LOCAL_MOCK_USDC_MINT} from '../src/chain/fanTransactions.ts';
import TransactionResultModal from '../src/TransactionResultModal.tsx';

test('mock-USDC amounts use exact six-decimal base units and the pinned local mint', () => {
  assert.equal(LOCAL_MOCK_USDC_MINT.toBase58(), '6Ckm2BrnXxsSjyG5b17kQQRjoECVrts92RKXVGT8XeqS');
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
  assert.match(html, /Contribution Transferred!/);
  assert.match(html, /1.234432 gsUSDC/);
  assert.match(html, new RegExp(rider));
  assert.match(html, /cluster=custom/);
  assert.doesNotMatch(html, /€1/);
});
