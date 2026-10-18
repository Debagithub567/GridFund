import type {GridCluster} from './config';
import {PublicKey} from '@solana/web3.js';

export function explorerAccountUrl(address: string, cluster: GridCluster): string | null {
  if (cluster === 'localnet') return null;
  try {
    const key = new PublicKey(address);
    if (key.toBase58() !== address) return null;
    return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=${cluster}`;
  } catch { return null; }
}

export function explorerTransactionUrl(signature: string, cluster: GridCluster | 'testnet' | 'mainnet-beta', endpoint?: string): string | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)) return null;
  const base = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`;
  if (cluster === 'mainnet-beta') return base;
  if (cluster === 'localnet') return null;
  return `${base}?cluster=${cluster}`;
}
