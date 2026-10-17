import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useAnchorWallet, useConnection, useWallet} from '@solana/wallet-adapter-react';
import {PublicKey} from '@solana/web3.js';
import type {DemoState} from '../model';
import {fetchRiderSnapshot, snapshotToViewState} from './accounts';
import type {ChainSnapshot} from './accounts';
import {cluster} from './config';
import {createGridProgram} from './program';
import {addExpense, createSeason, initializeRider} from './riderTransactions';
import type {RiderAction, RiderProgress, RiderTransactionResult} from './riderTransactions';
import {sponsorExpense} from './merchantTransactions';
import type {MerchantProgress, MerchantTransactionResult} from './merchantTransactions';
import {contributeDirect, fetchTokenBalances, approvedMockMint} from './fanTransactions';
import type {FanProgress, FanTransactionResult, TokenBalances} from './fanTransactions';
import {directoryEntry, discoverRiderDirectory} from './riderDirectory';
import type {DirectoryRider} from './riderDirectory';
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
  directory: DirectoryRider[];
  directoryStatus: 'idle' | 'loading' | 'ready' | 'error';
  directoryError: string;
  selectedRiderAddress: string;
  selectRider: (address: string) => void;
  refreshDirectory: () => void;
  selectedExpenseId: string;
  selectExpense: (id: string) => void;
  refresh: () => void;
  walletAddress: string;
  writing: boolean;
  seasonTitle?: string;
  runRiderAction: (action: RiderAction, args: {title?: string; budgetCents?: number; amountCents?: number; category?: number; description?: string}, onProgress: (value: RiderProgress) => void) => Promise<RiderTransactionResult>;
  runMerchantAction: (expenseId: string, amountCents: number, onProgress: (value: MerchantProgress) => void) => Promise<MerchantTransactionResult>;
  runFanAction: (amount: bigint, onProgress: (value: FanProgress) => void) => Promise<FanTransactionResult>;
  tokenBalances: TokenBalances | null;
  tokenError: string;
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
  const [targetRider, setTargetRider] = useState('');
  const [directory, setDirectory] = useState<DirectoryRider[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [directoryError, setDirectoryError] = useState('');
  const [directoryIdentity, setDirectoryIdentity] = useState('');
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [selectedExpenseId, selectExpense] = useState('');
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [snapshotWallet, setSnapshotWallet] = useState('');
  const [metadata, setMetadata] = useState<VerifiedMetadata>({expenses: {}});
  const [tokenBalances, setTokenBalances] = useState<TokenBalances | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [writing, setWriting] = useState(false);
  const writingRef = useRef(false);
  const [status, setStatus] = useState<ReadStatus>('idle');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const walletAddress = publicKey?.toBase58() || '';
  const currentWallet = useRef(walletAddress);
  currentWallet.current = walletAddress;
  const requestedRider = role === 'racer' ? walletAddress : targetRider;
  const currentRider = useRef(requestedRider);
  currentRider.current = requestedRider;
  const identity = `${role}:${walletAddress}`;
  const visibleDirectory = directoryIdentity === identity ? directory : [];

  const setMode = useCallback((next: DataMode) => setModeState(next), []);
  const refresh = useCallback(() => {
    setRevision(value => value + 1);
    if (role !== 'racer') setDirectoryRevision(value => value + 1);
  }, [role]);
  const refreshDirectory = refresh;
  const selectRider = useCallback((address: string) => {
    if (directoryIdentity !== identity || !directory.some(entry => entry.rider.toBase58() === address)) return;
    setTargetRider(address);
    setSnapshot(null);
    setMetadata({expenses: {}});
    setTokenBalances(null);
    setRevision(value => value + 1);
  }, [directoryIdentity, identity, directory]);
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
      const nextMetadata = await readMetadata(result.snapshot);
      if (currentWallet.current !== ownerAddress) {
        throw new Error('Transaction confirmed, but the wallet changed before accounts could refresh. Reconnect the original rider wallet and refresh accounts.');
      }
      setMetadata(nextMetadata);
      setSnapshot(result.snapshot);
      setSnapshotWallet(ownerAddress);
      setStatus('ready');
      setError('');
      onProgress({stage: 'confirmed', signature: result.signature});
      return result;
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  }, [mode, role, publicKey, anchorWallet, snapshot, status, program, connection, sendTransaction, readMetadata]);
  const runMerchantAction = useCallback(async (expenseId: string, amountCents: number,
    onProgress: (value: MerchantProgress) => void): Promise<MerchantTransactionResult> => {
    if (writingRef.current) throw new Error('A transaction is already pending.');
    if (mode !== 'connected' || role !== 'shop' || !publicKey || !anchorWallet) {
      throw new Error('Connect a merchant wallet before recording an in-kind sponsorship.');
    }
    if (status !== 'ready' || directoryStatus !== 'ready' || directoryIdentity !== identity ||
      snapshotWallet !== walletAddress || !snapshot || snapshot.rider.toBase58() !== currentRider.current ||
      !directory.some(entry => entry.rider.equals(snapshot.rider)) ||
      !snapshot.expenses.some(expense => expense.address.toBase58() === expenseId)) {
      throw new Error('Load a rider and select one of their on-chain expenses.');
    }
    const merchantAddress = publicKey.toBase58();
    if (currentWallet.current !== merchantAddress) throw new Error('Merchant wallet changed. Reconnect it before signing.');
    writingRef.current = true;
    setWriting(true);
    try {
      const result = await sponsorExpense({
        program, connection, merchant: publicKey,
        send: transaction => {
          if (currentWallet.current !== merchantAddress) throw new Error('Merchant wallet changed before signature. Reconnect it.');
          return sendTransaction(transaction, connection, {skipPreflight: false, preflightCommitment: 'confirmed'});
        },
        onProgress,
      }, snapshot.rider, new PublicKey(expenseId), amountCents);
      const nextMetadata = await readMetadata(result.snapshot);
      if (currentWallet.current !== merchantAddress || currentRider.current !== result.snapshot.rider.toBase58()) {
        throw new Error('Sponsorship confirmed, but the wallet or rider changed before accounts could refresh. Reload the rider accounts.');
      }
      setMetadata(nextMetadata);
      setSnapshot(result.snapshot);
      setSnapshotWallet(merchantAddress);
      setDirectory(current => current.map((entry, index) => entry.rider.equals(result.snapshot.rider)
        ? directoryEntry(result.snapshot, index, entry.seasonTitle) : entry));
      setDirectoryRevision(value => value + 1);
      setStatus('ready');
      setError('');
      onProgress({stage: 'confirmed', signature: result.signature});
      return result;
    } catch (reason) {
      refresh();
      throw reason;
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  }, [mode, role, publicKey, anchorWallet, status, snapshot, snapshotWallet, walletAddress, directoryStatus,
    directoryIdentity, identity, directory, program, connection, sendTransaction, readMetadata, refresh]);
  const runFanAction = useCallback(async (amount: bigint, onProgress: (value: FanProgress) => void): Promise<FanTransactionResult> => {
    if (writingRef.current) throw new Error('A transaction is already pending.');
    if (mode !== 'connected' || role !== 'fan' || !publicKey || !anchorWallet) {
      throw new Error('Connect a fan wallet before transferring mock-USDC.');
    }
    if (status !== 'ready' || directoryStatus !== 'ready' || directoryIdentity !== identity ||
      snapshotWallet !== walletAddress || !snapshot?.profileExists || snapshot.rider.toBase58() !== currentRider.current ||
      !directory.some(entry => entry.rider.equals(snapshot.rider))) {
      throw new Error('Load a rider with an on-chain RiderProfile first.');
    }
    const fanAddress = publicKey.toBase58();
    if (currentWallet.current !== fanAddress) throw new Error('Fan wallet changed before signing.');
    writingRef.current = true;
    setWriting(true);
    try {
      const result = await contributeDirect({program, connection, fan: publicKey,
        send: transaction => {
          if (currentWallet.current !== fanAddress) throw new Error('Fan wallet changed before signature. Reconnect it.');
          return sendTransaction(transaction, connection, {skipPreflight: false, preflightCommitment: 'confirmed'});
        }, onProgress,
      }, snapshot.rider, amount);
      if (currentWallet.current !== fanAddress || currentRider.current !== result.rider.toBase58()) {
        throw new Error('Contribution confirmed, but the wallet or rider changed before balances could refresh. Reload token accounts.');
      }
      setTokenBalances(result.balances);
      setTokenError('');
      onProgress({stage: 'confirmed', signature: result.signature});
      return result;
    } catch (reason) {
      refresh();
      throw reason;
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  }, [mode, role, publicKey, anchorWallet, status, snapshot, snapshotWallet, walletAddress, directoryStatus,
    directoryIdentity, identity, directory, program, connection, sendTransaction, refresh]);
  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* Mode still works for this session. */ }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'connected' || (role !== 'shop' && role !== 'fan')) {
      setDirectory([]);
      setDirectoryStatus('idle');
      setDirectoryError('');
      return;
    }
    let current = true;
    setDirectoryStatus('loading');
    setDirectoryError('');
    discoverRiderDirectory(program).then(entries => {
      if (!current) return;
      setDirectory(entries);
      setDirectoryIdentity(identity);
      setDirectoryStatus('ready');
      setTargetRider(selected => selected && !entries.some(entry => entry.rider.toBase58() === selected) ? '' : selected);
    }).catch(reason => {
      if (!current) return;
      setDirectory([]);
      setDirectoryIdentity(identity);
      setDirectoryStatus('error');
      setDirectoryError(reason instanceof Error ? reason.message : 'Unable to discover RiderProfiles on this RPC.');
      setTargetRider('');
    });
    return () => { current = false; };
  }, [mode, role, walletAddress, program, directoryRevision, identity]);

  const previousWallet = useRef(walletAddress);
  useEffect(() => {
    if (previousWallet.current === walletAddress) return;
    previousWallet.current = walletAddress;
    setTargetRider('');
    setSnapshot(null);
    setMetadata({expenses: {}});
    setTokenBalances(null);
  }, [walletAddress]);

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
      setError('The selected rider wallet address is invalid.');
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
      setSnapshotWallet(walletAddress);
      setStatus('ready');
    }).catch(reason => {
      if (!current) return;
      setSnapshot(null);
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'Unable to read Solana accounts.');
    });
    return () => { current = false; };
  }, [mode, role, requestedRider, walletAddress, program, revision, readMetadata]);

  useEffect(() => {
    if (mode !== 'connected' || (role === 'racer' && !requestedRider)) return;
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [mode, role, requestedRider, refresh]);

  useEffect(() => {
    if (mode !== 'connected' || !approvedMockMint || !snapshot?.profileExists ||
      snapshot.rider.toBase58() !== requestedRider || (role !== 'fan' && role !== 'racer')) {
      setTokenBalances(null);
      setTokenError('');
      return;
    }
    let current = true;
    fetchTokenBalances(connection, role === 'fan' ? publicKey : null, snapshot.rider).then(result => {
      if (!current) return;
      setTokenBalances(result);
      setTokenError('');
    }).catch(reason => {
      if (!current) return;
      setTokenBalances(null);
      setTokenError(reason instanceof Error ? reason.message : 'Unable to read token accounts.');
    });
    return () => { current = false; };
  }, [mode, role, requestedRider, walletAddress, snapshot, connection, publicKey, revision]);

  const visibleSnapshot = snapshot?.rider.toBase58() === requestedRider && snapshotWallet === walletAddress &&
    (role === 'racer' || (directoryIdentity === identity && visibleDirectory.some(entry => entry.rider.equals(snapshot.rider))))
    ? snapshot : null;
  const visibleStatus = mode === 'connected' && status === 'ready' && !visibleSnapshot
    ? requestedRider ? 'loading' : role === 'racer' ? 'needs-wallet' : 'needs-rider'
    : status;
  const state = useMemo(() => visibleSnapshot ? snapshotToViewState(visibleSnapshot, selectedExpenseId, metadata) : emptyState,
    [visibleSnapshot, selectedExpenseId, metadata]);

  return {
    mode, setMode, cluster, state, snapshot: visibleSnapshot, status: visibleStatus, error,
    directory: visibleDirectory, directoryStatus: directoryIdentity === identity ? directoryStatus : 'loading',
    directoryError: directoryIdentity === identity ? directoryError : '', selectedRiderAddress: requestedRider,
    selectRider, refreshDirectory,
    selectedExpenseId, selectExpense, refresh,
    walletAddress, writing, seasonTitle: metadata.seasonTitle, runRiderAction, runMerchantAction,
    runFanAction, tokenBalances, tokenError,
  };
}
