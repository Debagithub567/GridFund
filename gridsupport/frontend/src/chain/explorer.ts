import type {GridCluster} from './config';

export function explorerTransactionUrl(signature: string, cluster: GridCluster | 'testnet' | 'mainnet-beta', endpoint?: string): string | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)) return null;
  const base = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`;
  if (cluster === 'mainnet-beta') return base;
  if (cluster === 'localnet') return endpoint ? `${base}?cluster=custom&customUrl=${encodeURIComponent(endpoint)}` : null;
  return `${base}?cluster=${cluster}`;
}
