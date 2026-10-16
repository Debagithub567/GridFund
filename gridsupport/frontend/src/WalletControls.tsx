import {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {ConnectionProvider, WalletProvider, useWallet} from '@solana/wallet-adapter-react';
import {WalletReadyState} from '@solana/wallet-adapter-base';
import type {WalletName} from '@solana/wallet-adapter-base';
import {PhantomWalletAdapter} from '@solana/wallet-adapter-phantom';
import {Check, Wallet, X} from 'lucide-react';
import {cluster, endpoint} from './chain/config';

const WalletErrors = createContext<{error: string; setError: (value: string) => void}>({error: '', setError: () => {}});

export function WalletProviders({children}: {children: ReactNode}) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const [error, setError] = useState('');
  return <ConnectionProvider endpoint={endpoint} config={{commitment: 'confirmed'}}>
    <WalletProvider wallets={wallets} autoConnect={false} onError={failure => setError(failure.message)}>
      <WalletErrors.Provider value={{error, setError}}>{children}</WalletErrors.Provider>
    </WalletProvider>
  </ConnectionProvider>;
}

export function WalletButton() {
  const {wallets, wallet, publicKey, connecting, disconnecting, connected, select, connect, disconnect} = useWallet();
  const {error, setError} = useContext(WalletErrors);
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<WalletName | null>(null);
  const address = publicKey?.toBase58();

  useEffect(() => {
    if (!pending || !wallet || wallet.adapter.name !== pending) return;
    setPending(null);
    connect().catch(reason => setError(reason instanceof Error ? reason.message : 'Wallet connection was declined.'));
  }, [pending, wallet, connect, setError]);
  useEffect(() => {
    if (connected) { setError(''); dialog.current?.close(); }
  }, [connected, setError]);

  const choose = (name: WalletName) => {
    setError('');
    if (wallet?.adapter.name === name) {
      connect().catch(reason => setError(reason instanceof Error ? reason.message : 'Wallet connection was declined.'));
    } else {
      setPending(name);
      select(name);
    }
  };
  const available = wallets
    .filter(item => item.readyState === WalletReadyState.Installed || item.readyState === WalletReadyState.Loadable)
    .filter((item, index, all) => all.findIndex(other => other.adapter.name === item.adapter.name) === index);
  return <>
    <button type="button" className="platform" aria-label={address ? `Wallet connected: ${address}` : 'Connect wallet'}
      onClick={() => { setError(''); dialog.current?.showModal(); }}>
      <Wallet size={15}/>{connecting ? 'Connecting…' : disconnecting ? 'Disconnecting…' : address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'Connect Wallet'}
    </button>
    <dialog ref={dialog} className="wallet-dialog" aria-labelledby="wallet-title"
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button type="button" className="wallet-close" aria-label="Close wallet dialog" onClick={() => dialog.current?.close()}><X size={20}/></button>
      <span className="demo-tag">SOLANA {cluster.toUpperCase()}</span>
      <h2 id="wallet-title">{address ? 'WALLET CONNECTED' : 'CONNECT WALLET'}</h2>
      {address ? <>
        <p className="wallet-address">{address}</p>
        <p>Connected through {wallet?.adapter.name}. Rider account creation requests a separate wallet approval.</p>
        <button type="button" className="cta" disabled={disconnecting} onClick={() => disconnect().catch(reason => setError(reason instanceof Error ? reason.message : 'Disconnect failed.'))}>DISCONNECT <X size={16}/></button>
      </> : <>
        <p>Choose an installed Solana wallet. Connecting shares your public address. Rider transactions request a separate approval when you click Create.</p>
        {available.length ? <div className="wallet-options">{available.map(item => <button type="button" key={item.adapter.name}
          disabled={connecting} onClick={() => choose(item.adapter.name)}>
          <img src={item.adapter.icon} alt=""/><span>{item.adapter.name}</span><Check size={16}/>
        </button>)}</div> : <p role="status">No supported wallet is detected in this browser. Install Phantom or another Solana wallet, then reload the page.</p>}
        {!available.some(item => item.adapter.name === 'Phantom') && <a className="text-link" href="https://phantom.com/download" target="_blank" rel="noopener noreferrer">GET PHANTOM ↗</a>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </dialog>
  </>;
}
