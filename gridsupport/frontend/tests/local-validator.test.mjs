import test from 'node:test';
import assert from 'node:assert/strict';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import {BN} from '@anchor-lang/core';
import {readFileSync} from 'node:fs';
import {getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {createGridProgram} from '../src/chain/program.ts';
import {fetchRiderSnapshot} from '../src/chain/accounts.ts';
import {initializeRider, createSeason, addExpense} from '../src/chain/riderTransactions.ts';
import {sponsorExpense} from '../src/chain/merchantTransactions.ts';
import {contributeDirect, parseMockUsdc, prepareFanTokenAccount, LOCAL_MOCK_USDC_MINT} from '../src/chain/fanTransactions.ts';
import {discoverRiderDirectory} from '../src/chain/riderDirectory.ts';
import {sha256Text} from '../src/chain/metadata.ts';
import {explorerTransactionUrl} from '../src/chain/explorer.ts';
import {expensePda, sponsorshipPda, riderProfilePda} from '../src/chain/pdas.ts';
import {confirmBudget} from '../src/chain/budget.ts';
import {saveFanReceipt, verifiedFanReceipts} from '../src/chain/fanReceipts.ts';

const rpc = process.env.GRIDSUPPORT_LOCAL_RPC;
const mintAuthorityPath = process.env.GRIDSUPPORT_LOCAL_MINT_AUTHORITY;
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
  assert.deepEqual(progress.map(value => value.stage), ['awaiting-wallet','submitted','confirming','verifying']);
  assert.equal(explorerTransactionUrl(profile.signature, 'localnet', rpc), null);
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

test('Confirm Racing Budget resumes safely on an isolated local validator', {skip: !rpc}, async () => {
  const connection = new Connection(rpc, 'confirmed');
  const rider = Keypair.generate();
  const airdrop = await connection.requestAirdrop(rider.publicKey, 2_000_000_000);
  assert.equal((await connection.confirmTransaction({signature: airdrop, ...await connection.getLatestBlockhash('confirmed')}, 'confirmed')).value.err, null);
  const program = createGridProgram(connection);
  const plan = {name: 'Pol Espargaró', season: '2026', expenses: [
    {title: 'Racing tyres', description: 'Racing tyres', amountCents: 50000, category: 1},
    {title: 'Fuel & travel', description: 'Fuel & travel', amountCents: 30000, category: 2},
    {title: 'Accommodation & food', description: 'Accommodation & food', amountCents: 20000, category: 4},
  ]};
  const signedSend = async transaction => {
    transaction.sign(rider);
    return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false, preflightCommitment: 'confirmed'});
  };
  let requests = 0;
  const context = {program, connection, rider: rider.publicKey, onProgress: () => {},
    send: transaction => ++requests === 4 ? Promise.reject(new Error('User rejected the request')) : signedSend(transaction)};
  await assert.rejects(confirmBudget(context, plan, () => {}), /rejected/);
  assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses.length, 1);
  const resumed = [];
  const snapshot = await confirmBudget({...context, send: signedSend}, plan, step => resumed.push(step));
  assert.deepEqual(snapshot.expenses.map(expense => expense.estimatedCostCents), [50000n, 30000n, 20000n]);
  assert.equal(resumed.filter(step => step.stage === 'skipped').length, 3);
  assert.equal(resumed.filter(step => step.stage === 'verified').length, 2);
  const replay = await confirmBudget({...context, send: () => {throw new Error('Duplicate request')}}, plan, () => {});
  assert.equal(replay.expenses.length, 3, 'replay signs no duplicate expense');
});

test('signed Fan mock-USDC transfer on an isolated local validator', {skip: !rpc || !mintAuthorityPath}, async () => {
  const connection = new Connection(rpc, 'confirmed');
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(mintAuthorityPath, 'utf8'))));
  const rider = Keypair.generate();
  const fan = Keypair.generate();
  for (const signer of [authority, rider, fan]) {
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
  await createSeason(riderCtx, 50000, 'Fan token test');
  await addExpense(riderCtx, 50000, 1, 'Merchant coverage remains separate');
  const setupProgress = [];
  const fanToken = await prepareFanTokenAccount({program, connection, fan: fan.publicKey, send: sendBy(fan),
    onProgress: value => setupProgress.push(value.stage)});
  assert.deepEqual(setupProgress, ['awaiting-wallet', 'submitted', 'confirming', 'verifying', 'confirmed']);
  assert.equal((await getAccount(connection, fanToken.address)).amount, 0n, 'Fan setup does not mint tokens');
  await assert.rejects(prepareFanTokenAccount({program, connection, fan: fan.publicKey,
    send: () => {throw new Error('Duplicate setup signed')}, onProgress: () => {}}), /already exists/);
  await mintTo(connection, authority, LOCAL_MOCK_USDC_MINT, fanToken.address, authority, 100_000_000n);
  const riderAta = getAssociatedTokenAddressSync(LOCAL_MOCK_USDC_MINT, rider.publicKey);
  assert.equal(await connection.getAccountInfo(riderAta, 'confirmed'), null);
  assert.equal((await getAccount(connection, fanToken.address)).amount, 100_000_000n);
  const progress = [];
  const ctx = {program, connection, fan: fan.publicKey, send: sendBy(fan), onProgress: value => progress.push(value.stage)};
  const amount = parseMockUsdc('1.234432');
  const transferred = await contributeDirect(ctx, rider.publicKey, amount);
  assert.deepEqual(progress, ['awaiting-wallet', 'submitted', 'confirming', 'verifying']);
  assert.equal(transferred.balances.fan, 98_765_568n);
  assert.equal(transferred.balances.rider, amount);
  assert.equal((await getAccount(connection, fanToken.address)).amount, 98_765_568n);
  assert.equal((await getAccount(connection, riderAta)).amount, amount);
  assert.equal(explorerTransactionUrl(transferred.signature, 'localnet', rpc), null);
  assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses[0].committedCoverageCents, 0n);
  await assert.rejects(contributeDirect(ctx, rider.publicKey, 0n), /positive/);
  await assert.rejects(contributeDirect(ctx, rider.publicKey, 200_000_000n), /Insufficient/);
  const missingCtx = {...ctx, fan: Keypair.generate().publicKey};
  await assert.rejects(contributeDirect(missingCtx, rider.publicKey, 1n), /Set up a standard SPL gsUSDC token account/);
  const rejectedCtx = {...ctx, send: async () => {throw new Error('User rejected the request')}};
  await assert.rejects(contributeDirect(rejectedCtx, rider.publicKey, 1n), /rejected/);

  const accounts = {fan: fan.publicKey, riderProfile: riderProfilePda(rider.publicKey), mockUsdcMint: LOCAL_MOCK_USDC_MINT,
    fanTokenAccount: fanToken.address, riderTokenAccount: riderAta, tokenProgram: TOKEN_PROGRAM_ID};
  const badRaw = async (overrides, signer = fan) => {
    const instruction = await program.methods.contributeDirect(new BN(1)).accountsStrict({...accounts, ...overrides}).instruction();
    const latest = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({feePayer: fan.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight}).add(instruction);
    transaction.sign(signer);
    return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false});
  };
  await assert.rejects(badRaw({mockUsdcMint: Keypair.generate().publicKey}), /Simulation failed|custom program error/i);
  await assert.rejects(badRaw({tokenProgram: SystemProgram.programId}), /Simulation failed|custom program error/i);
  await assert.rejects(badRaw({riderTokenAccount: fanToken.address}), /Simulation failed|custom program error/i);
  const wrongSignerInstruction = await program.methods.contributeDirect(new BN(1)).accountsStrict({...accounts, fan: Keypair.generate().publicKey}).instruction();
  const latest = await connection.getLatestBlockhash('confirmed');
  const wrongSigner = new Transaction({feePayer: fan.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight}).add(wrongSignerInstruction);
  wrongSigner.sign(fan);
  assert.throws(() => wrongSigner.serialize(), /signature verification failed/i);
  assert.equal((await getAccount(connection, fanToken.address)).amount, 98_765_568n);
  assert.equal((await getAccount(connection, riderAta)).amount, amount);
  console.log('Local validator confirmed Fan signature:', transferred.signature);
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
  assert.equal(explorerTransactionUrl(first.signature, 'localnet', rpc), null);
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

test('Shopkeeper and Fan sign the same expense sponsorship path without double counting', {skip: !rpc}, async () => {
  const connection = new Connection(rpc, 'confirmed');
  const rider = Keypair.generate(), shop = Keypair.generate(), fan = Keypair.generate();
  for (const signer of [rider, shop, fan]) {
    const signature = await connection.requestAirdrop(signer.publicKey, 2_000_000_000);
    assert.equal((await connection.confirmTransaction({signature, ...await connection.getLatestBlockhash('confirmed')}, 'confirmed')).value.err, null);
  }
  const program = createGridProgram(connection);
  const sendBy = signer => async transaction => {
    assert.ok(transaction.feePayer.equals(signer.publicKey));
    transaction.sign(signer);
    return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false, preflightCommitment: 'confirmed'});
  };
  const riderCtx = {program, connection, rider: rider.publicKey, send: sendBy(rider), onProgress: () => {}};
  await initializeRider(riderCtx);
  await createSeason(riderCtx, 50000, 'Shared support season');
  const expense = await addExpense(riderCtx, 50000, 1, 'Racing tyres');
  const shopResult = await sponsorExpense({program, connection, merchant: shop.publicKey, send: sendBy(shop), onProgress: () => {}},
    rider.publicKey, expense.address, 6000);
  const fanResult = await sponsorExpense({program, connection, merchant: fan.publicKey, send: sendBy(fan), onProgress: () => {}},
    rider.publicKey, expense.address, 5000);
  assert.notEqual(shopResult.signature, fanResult.signature);
  const verified = await fetchRiderSnapshot(program, rider.publicKey);
  assert.equal(verified.expenses[0].estimatedCostCents, 50000n);
  assert.equal(verified.expenses[0].committedCoverageCents, 11000n);
  assert.equal(verified.expenses[0].estimatedCostCents - verified.expenses[0].committedCoverageCents, 39000n);
  assert.deepEqual(verified.expenses[0].sponsorships.map(item => item.merchant.toBase58()),
    [shop.publicKey.toBase58(), fan.publicKey.toBase58()]);
  assert.equal(new Set(verified.expenses[0].sponsorships.map(item => item.address.toBase58())).size, 2);
});

test('shared directory selects actual Rider accounts for Shop then Fan on an isolated validator',
  {skip: !rpc || !mintAuthorityPath}, async () => {
    const connection = new Connection(rpc, 'confirmed');
    const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(mintAuthorityPath, 'utf8'))));
    const rider = Keypair.generate();
    const otherRider = Keypair.generate();
    const merchant = Keypair.generate();
    const fan = Keypair.generate();
    for (const signer of [authority, rider, otherRider, merchant, fan]) {
      const signature = await connection.requestAirdrop(signer.publicKey, 2_000_000_000);
      const latest = await connection.getLatestBlockhash('confirmed');
      assert.equal((await connection.confirmTransaction({signature, ...latest}, 'confirmed')).value.err, null);
    }
    const program = createGridProgram(connection);
    const sendBy = signer => async transaction => {
      transaction.sign(signer);
      return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false, preflightCommitment: 'confirmed'});
    };
    const riderCtx = signer => ({program, connection, rider: signer.publicKey, send: sendBy(signer), onProgress: () => {}});
    await initializeRider(riderCtx(rider));
    await initializeRider(riderCtx(otherRider));
    await createSeason(riderCtx(rider), 100000, 'Directory test season');
    const expense = await addExpense(riderCtx(rider), 50000, 1, 'Discovered race need');
    let directory = await discoverRiderDirectory(program);
    const discovered = directory.find(entry => entry.rider.equals(rider.publicKey));
    const second = directory.find(entry => entry.rider.equals(otherRider.publicKey));
    assert(discovered, 'registered rider appears without a typed address');
    assert.equal(second, undefined, 'profile without a season and expense is hidden');
    assert.equal(new Set(directory.map(entry => entry.rider.toBase58())).size, directory.length);
    assert.equal(discovered.expenseCount, 1);
    assert.equal(discovered.snapshot.expenses[0].address.toBase58(), expense.address.toBase58());
    const sponsored = await sponsorExpense({program, connection, merchant: merchant.publicKey,
      send: sendBy(merchant), onProgress: () => {}}, discovered.rider, discovered.snapshot.expenses[0].address, 1234);
    assert.equal(explorerTransactionUrl(sponsored.signature, 'localnet', rpc), null);
    directory = await discoverRiderDirectory(program);
    const selectedForFan = directory.find(entry => entry.rider.equals(rider.publicKey));
    assert.equal(selectedForFan.merchantCoverageCents, 1234n);
    assert.equal(selectedForFan.remainingCoverageCents, 48766n);
    const fanSource = await getOrCreateAssociatedTokenAccount(connection, authority, LOCAL_MOCK_USDC_MINT, fan.publicKey);
    await mintTo(connection, authority, LOCAL_MOCK_USDC_MINT, fanSource.address, authority, 10_000_000n);
    const contribution = await contributeDirect({program, connection, fan: fan.publicKey,
      send: sendBy(fan), onProgress: () => {}}, selectedForFan.rider, parseMockUsdc('2.5'));
    assert.equal(contribution.balances.fan, 7_500_000n);
    assert.equal(contribution.balances.rider, 2_500_000n);
    directory = await discoverRiderDirectory(program);
    assert.equal(directory.find(entry => entry.rider.equals(rider.publicKey)).merchantCoverageCents, 1234n,
      'direct fan tokens do not alter merchant expense coverage');
    console.log('Local validator directory Shop/Fan signatures:', sponsored.signature, contribution.signature);
  });

test('judge walkthrough confirms a resumable €1,000 budget, €50 in-kind support and 50 gsUSDC',
  {skip: !rpc || !mintAuthorityPath}, async () => {
    const connection = new Connection(rpc, 'confirmed');
    const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(mintAuthorityPath, 'utf8'))));
    const rider = Keypair.generate(), merchant = Keypair.generate(), fan = Keypair.generate();
    for (const signer of [authority, rider, merchant, fan]) {
      const signature = await connection.requestAirdrop(signer.publicKey, 2_000_000_000);
      assert.equal((await connection.confirmTransaction({signature, ...await connection.getLatestBlockhash('confirmed')}, 'confirmed')).value.err, null);
    }
    const program = createGridProgram(connection);
    const sendBy = signer => async transaction => {
      transaction.sign(signer);
      return connection.sendRawTransaction(transaction.serialize(), {skipPreflight: false, preflightCommitment: 'confirmed'});
    };
    const plan = {name: 'Pol Espargaró', season: '2026', expenses: [
      {title: 'Racing tyres', amountCents: 50000, category: 1, description: 'Racing tyres'},
      {title: 'Fuel & travel', amountCents: 30000, category: 2, description: 'Fuel & travel'},
      {title: 'Accommodation & food', amountCents: 20000, category: 4, description: 'Accommodation & food'},
    ]};
    let sends = 0;
    const riderSend = sendBy(rider);
    const steps = [];
    const riderCtx = {program, connection, rider: rider.publicKey, onProgress: () => {},
      send: transaction => {if (++sends === 4) throw new Error('User rejected the request'); return riderSend(transaction)}};
    await assert.rejects(confirmBudget(riderCtx, plan, step => steps.push(step)), /rejected/);
    assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses.length, 1, 'three completed transactions survive a rejected fourth');
    const resumed = [];
    const budget = await confirmBudget({...riderCtx, send: riderSend}, plan, step => resumed.push(step));
    assert.deepEqual(budget.expenses.map(item => item.estimatedCostCents), [50000n, 30000n, 20000n]);
    assert.equal(budget.seasonBudgetCents, 100000n);
    assert.equal(resumed.filter(step => step.stage === 'skipped').length, 3);
    assert.equal(resumed.filter(step => step.stage === 'verified').length, 2);
    const replay = [];
    await confirmBudget({...riderCtx, send: () => {throw new Error('Duplicate transaction')}} , plan, step => replay.push(step));
    assert.equal(replay.filter(step => step.stage === 'skipped').length, 5, 'refresh/retry creates no duplicate accounts');
    const directory = await discoverRiderDirectory(program);
    assert.ok(directory.some(entry => entry.rider.equals(rider.publicKey)));
    const accommodation = budget.expenses[2];
    const sponsorship = await sponsorExpense({program, connection, merchant: merchant.publicKey, send: sendBy(merchant), onProgress: () => {}},
      rider.publicKey, accommodation.address, 5000);
    assert.equal(sponsorship.snapshot.expenses[2].committedCoverageCents, 5000n);
    const fanToken = await getOrCreateAssociatedTokenAccount(connection, authority, LOCAL_MOCK_USDC_MINT, fan.publicKey);
    await mintTo(connection, authority, LOCAL_MOCK_USDC_MINT, fanToken.address, authority, 100_000_000n);
    const transferred = await contributeDirect({program, connection, fan: fan.publicKey, send: sendBy(fan), onProgress: () => {}},
      rider.publicKey, parseMockUsdc('50'));
    assert.equal(transferred.balances.fan, 50_000_000n);
    assert.equal(transferred.balances.rider, 50_000_000n);
    assert.equal((await getAccount(connection, getAssociatedTokenAddressSync(LOCAL_MOCK_USDC_MINT, rider.publicKey))).amount, 50_000_000n);
    assert.equal((await fetchRiderSnapshot(program, rider.publicKey)).expenses[2].committedCoverageCents, 5000n,
      'fan tokens never change merchant coverage');
    const storage = new Map();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)};
    try {
      saveFanReceipt({signature: transferred.signature, rider: rider.publicKey.toBase58(), fan: fan.publicKey.toBase58(),
        source: transferred.source.toBase58(), amount: transferred.amount.toString()});
      const receipts = await verifiedFanReceipts(connection, program, rider.publicKey);
      assert.equal(receipts.length, 1);
      assert.equal(BigInt(receipts[0].amount), 50_000_000n);
      assert.equal(5000 + Number(BigInt(receipts[0].amount) / 10000n), 10000, 'combined presentation support is €100');
      storage.clear();
      const otherBrowser = await verifiedFanReceipts(connection, program, rider.publicKey);
      assert.deepEqual(otherBrowser, receipts, 'Rider discovers verified Fan support without the Fan browser storage');
      saveFanReceipt({...receipts[0], amount: '51000000'});
      assert.deepEqual(await verifiedFanReceipts(connection, program, rider.publicKey), receipts,
        'tampered browser data cannot change verified chain totals');
    } finally {globalThis.localStorage = previousStorage}
    console.log('Judge walkthrough confirmed signatures:', [sponsorship.signature, transferred.signature].join(' '));
  });
