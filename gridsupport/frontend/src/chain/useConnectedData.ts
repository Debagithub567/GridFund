import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useAnchorWallet, useConnection, useWallet} from '@solana/wallet-adapter-react';
import {PublicKey} from '@solana/web3.js';
import type {DemoState} from '../model';
import {fetchRiderSnapshot, snapshotToViewState} from './accounts';
import type {ChainSnapshot} from './accounts';
import {cluster, configuredRider} from './config';
import {createGridProgram} from './program';
import {addExpense, createSeason, initializeRider} from './riderTransactions';
import type {RiderAction, RiderProgress, RiderTransactionResult} from './riderTransactions';
import {saveExpenseMetadata, saveSeasonMetadata, verifiedExpenseMetadata, verifiedSeasonTitle} from './metadata';
import type {VerifiedMetadata} from './metadata';

export type DataMode = 'demo' | 'connected';
export type ReadStatus = 'idle' | 'needs-wallet' | 'needs-rider' | 'loading' | 'ready' | 'error';
export type IntegrationView = {
  mode: DataMode;
  setMode: (mode: DataMode) => void;
  cluster: typeof cluster;
  state: DemoState | null;
  snapshot: ChainSnapshot | null;
  status: ReadStatus;
  error: string;
  riderInput: string;
  setRiderInput: (value: string) => void;
  loadRider: () => void;
  selectedExpenseId: string;
  selectExpense: (id: string) => void;
  refresh: () => void;
  walletAddress: string;
  writing: boolean;
  seasonTitle?: string;
  runRiderAction: (action: RiderAction, args: {title?: string; budgetCents?: number; amountCents?: number; category?: number; description?: string}, onProgress: (value: RiderProgress) => void) => Promise<RiderTransactionResult>;
};

const MODE_KEY = 'gridsupport-stage4b-mode';
const emptyState: DemoState = {version: 1, expenses: [], contributions: [], selectedExpenseId: ''};

export function useConnectedData(role: string): IntegrationView {
  const {connection} = useConnection();
  const {publicKey} = useWallet();
  const {sendTransaction} = useWallet();
  const anchorWallet = useAnchorWallet();
  const program = useMemo(() => createGridProgram(connection, anchorWallet), [connection, anchorWallet]);
  const [mode, setModeState] = useState<DataMode>(() => {
    try { return localStorage.getItem(MODE_KEY) === 'connected' ? 'connected' : 'demo'; }
    catch { return 'demo'; }
  });
  const [riderInput, setRiderInput] = useState(configuredRider);
  const [targetRider, setTargetRider] = useState(configuredRider);
  const [selectedExpenseId, selectExpense] = useState('');
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [metadata, setMetadata] = useState<VerifiedMetadata>({expenses: {}});
  const [writing, setWriting] = useState(false);
  const writingRef = useRef(false);
  const [status, setStatus] = useState<ReadStatus>('idle');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const walletAddress = publicKey?.toBase58() || '';
  const currentWallet = useRef(walletAddress);
  currentWallet.current = walletAddress;
  const requestedRider = role === 'racer' ? walletAddress : targetRider;

  const setMode = useCallback((next: DataMode) => setModeState(next), []);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const readMetadata = useCallback(async (data: ChainSnapshot): Promise<VerifiedMetadata> => {
    const expenses = Object.fromEntries((await Promise.all(data.expenses.map(async expense => [
      expense.address.toBase58(), await verifiedExpenseMetadata(expense.address.toBase58(), expense.descriptionHash, expense.category),
    ] as const))).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => !!entry[1]));
    const seasonTitle = data.seasonTitleHash ? await verifiedSeasonTitle(data.seasonAddress.toBase58(), data.seasonTitleHash) : undefined;
    return {seasonTitle, expenses};
  }, []);
  const runRiderAction = useCallback(async (action: RiderAction,
    args: {title?: string; budgetCents?: number; amountCents?: number; category?: number; description?: string},
    onProgress: (value: RiderProgress) => void): Promise<RiderTransactionResult> => {
    if (writingRef.current) throw new Error('A Rider transaction is already pending.');
    if (mode !== 'connected' || role !== 'racer' || !publicKey || !anchorWallet ||
      currentWallet.current !== publicKey.toBase58() || snapshot?.rider.toBase58() !== publicKey.toBase58() || status !== 'ready') {
      throw new Error('Connect the RiderProfile owner wallet and wait for its accounts to load.');
    }
    writingRef.current = true;
    setWriting(true);
    const ownerAddress = publicKey.toBase58();
    const context = {
      program, connection, rider: publicKey,
      send: (transaction: Parameters<typeof sendTransaction>[0]) => {
        if (currentWallet.current !== ownerAddress) throw new Error('Wallet changed before signature. Reconnect the rider wallet.');
        return sendTransaction(transaction, connection, {skipPreflight: false, preflightCommitment: 'confirmed'});
      },
      onProgress,
    };
    try {
      const result = action === 'profile' ? await initializeRider(context) :
        action === 'season' ? await createSeason(context, args.budgetCents!, args.title || '') :
          await addExpense(context, args.amountCents!, args.category!, args.description || '');
      if (action === 'season') saveSeasonMetadata(result.address.toBase58(), args.title || '', result.hash!);
      if (action === 'expense') saveExpenseMetadata(result.address.toBase58(), args.title || '', args.description || '', args.category!, result.hash!);
      if (currentWallet.current === ownerAddress) {
        setMetadata(await readMetadata(result.snapshot));
        setSnapshot(result.snapshot);
        setStatus('ready');
        setError('');
        onProgress({stage: 'confirmed', signature: result.signature});
      }
      return result;
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  }, [mode, role, publicKey, anchorWallet, snapshot, status, program, connection, sendTransaction, readMetadata]);
  const loadRider = useCallback(() => {
    const value = riderInput.trim();
    if (value) {
      try {
        if (new PublicKey(value).toBase58() !== value) throw new Error();
      } catch {
        setSnapshot(null);
        setError('Enter a valid Solana rider wallet address.');
        setStatus('error');
        return;
      }
    }
    setError('');
    setTargetRider(value);
    setRevision(current => current + 1);
  }, [riderInput]);

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* Mode still works for this session. */ }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'connected') {
      setSnapshot(null);
      setStatus('idle');
      setError('');
      return;
    }
    if (!requestedRider) {
      setSnapshot(null);
      setStatus(role === 'racer' ? 'needs-wallet' : 'needs-rider');
      setError('');
      return;
    }
    let rider: PublicKey;
    try { rider = new PublicKey(requestedRider); }
    catch {
      setSnapshot(null);
      setStatus('error');
      setError('The configured rider wallet address is invalid.');
      return;
    }
    let current = true;
    setSnapshot(null);
    setStatus('loading');
    setError('');
    fetchRiderSnapshot(program, rider).then(async result => {
      if (!current) return;
      const nextMetadata = await readMetadata(result);
      if (!current) return;
      setMetadata(nextMetadata);
      setSnapshot(result);
      setStatus('ready');
    }).catch(reason => {
      if (!current) return;
      setSnapshot(null);
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'Unable to read Solana accounts.');
    });
    return () => { current = false; };
  }, [mode, role, requestedRider, program, revision, readMetadata]);

  useEffect(() => {
    if (mode !== 'connected' || !requestedRider) return;
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [mode, requestedRider, refresh]);

  const visibleSnapshot = snapshot?.rider.toBase58() === requestedRider ? snapshot : null;
  const visibleStatus = mode === 'connected' && status === 'ready' && !visibleSnapshot
    ? requestedRider ? 'loading' : role === 'racer' ? 'needs-wallet' : 'needs-rider'
    : status;
  const state = useMemo(() => visibleSnapshot ? snapshotToViewState(visibleSnapshot, selectedExpenseId, metadata) : emptyState,
    [visibleSnapshot, selectedExpenseId, metadata]);

  return {
    mode, setMode, cluster, state, snapshot: visibleSnapshot, status: visibleStatus, error,
    riderInput, setRiderInput, loadRider, selectedExpenseId, selectExpense, refresh,
    walletAddress, writing, seasonTitle: metadata.seasonTitle, runRiderAction,
  };
}
