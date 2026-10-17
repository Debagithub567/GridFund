import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {Keypair} from '@solana/web3.js';

test('wallet switching clears selected Rider data while the new directory request is pending', async () => {
  const output = path.resolve('.directory-hook-test-build');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'https://example.test/shop'});
  try {
    await fs.mkdir(output, {recursive: true});
    const stub = (name, code) => fs.writeFile(path.join(output, name + '.mjs'), code);
    await Promise.all([
      stub('walletStub', `export const useConnection=()=>({connection:globalThis.__directoryConnection});
        export const useWallet=()=>globalThis.__directoryWallet;
        export const useAnchorWallet=()=>globalThis.__directoryWallet.anchorWallet;`),
      stub('config', `export const cluster='localnet';`),
      stub('program', `export const createGridProgram=(_connection,wallet)=>({wallet});`),
      stub('accounts', `export const fetchRiderSnapshot=async(_program,rider)=>globalThis.__directorySnapshots.get(rider.toBase58());
        export const snapshotToViewState=snapshot=>({version:1,expenses:snapshot.expenses,contributions:[],selectedExpenseId:''});`),
      stub('riderTransactions', `export const initializeRider=async()=>{};export const createSeason=async()=>{};export const addExpense=async()=>{};`),
      stub('merchantTransactions', `export const sponsorExpense=async()=>{};`),
      stub('fanTransactions', `export const approvedMockMint=null;export const contributeDirect=async()=>{};export const fetchTokenBalances=async()=>{};`),
      stub('riderDirectory', `export const directoryEntry=()=>{};export const discoverRiderDirectory=program=>globalThis.__directoryRequests(program);`),
      stub('metadata', `export const saveExpenseMetadata=()=>{};export const saveSeasonMetadata=()=>{};
        export const verifiedExpenseMetadata=async()=>undefined;export const verifiedSeasonTitle=async()=>undefined;`),
    ]);
    const source = await fs.readFile('src/chain/useConnectedData.ts', 'utf8');
    const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}})
      .outputText.replace(/from '\.\/([^']+)'/g, (_, name) => `from './${name}.mjs'`)
      .replace("'@solana/wallet-adapter-react'", "'./walletStub.mjs'");
    await stub('useConnectedData', compiled);
    for (const name of ['window', 'document', 'localStorage', 'HTMLElement', 'Node']) {
      Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true, writable: true});
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.setItem('gridsupport-stage4b-mode', 'connected');
    globalThis.__directoryConnection = {};
    const walletA = Keypair.generate().publicKey;
    const walletB = Keypair.generate().publicKey;
    const riderA = Keypair.generate().publicKey;
    const riderB = Keypair.generate().publicKey;
    const snapshot = rider => ({rider, profileExists: true, seasonExists: false, expenses: [],
      seasonAddress: rider, seasonTitleHash: null});
    globalThis.__directorySnapshots = new Map([[riderA.toBase58(), snapshot(riderA)], [riderB.toBase58(), snapshot(riderB)]]);
    const entry = rider => ({rider, snapshot: snapshot(rider), profileAddress: rider});
    let resolveSecond;
    globalThis.__directoryRequests = program => program.wallet.publicKey.equals(walletA)
      ? Promise.resolve([entry(riderA)]) : new Promise(resolve => {resolveSecond = resolve});
    globalThis.__directoryWallet = {publicKey: walletA, anchorWallet: {publicKey: walletA}, sendTransaction: async () => {}};
    const React = await import('react');
    const {act} = React;
    const {createRoot} = await import('react-dom/client');
    const {useConnectedData} = await import('../.directory-hook-test-build/useConnectedData.mjs');
    let view;
    function Harness() {view = useConnectedData('shop'); return React.createElement('div', null, view.selectedRiderAddress)}
    const root = createRoot(document.getElementById('root'));
    await act(async () => {root.render(React.createElement(Harness)); await Promise.resolve()});
    assert.equal(view.directory.length, 1);
    await act(async () => {view.selectRider(riderA.toBase58()); await Promise.resolve()});
    assert.equal(view.snapshot?.rider.toBase58(), riderA.toBase58());
    globalThis.__directoryWallet = {publicKey: walletB, anchorWallet: {publicKey: walletB}, sendTransaction: async () => {}};
    await act(async () => {root.render(React.createElement(Harness)); await Promise.resolve()});
    assert.equal(view.snapshot, null, 'old rider accounts cannot appear for the new wallet');
    assert.deepEqual(view.directory, [], 'old directory cards are hidden until the new request completes');
    assert.equal(view.selectedRiderAddress, '', 'wallet change clears the previous selection');
    await act(async () => {resolveSecond([entry(riderB)]); await Promise.resolve()});
    assert.equal(view.directory[0].rider.toBase58(), riderB.toBase58());
    await act(async () => {root.unmount()});
  } finally {
    dom.window.close();
    await fs.rm(output, {recursive: true, force: true});
  }
});
