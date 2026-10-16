/// <reference types="vite/client" />
import {clusterApiUrl, PublicKey} from '@solana/web3.js';
import idl from './gridsupport.json';

export type GridCluster = 'localnet' | 'devnet';

const runtimeEnv = (import.meta.env ?? {}) as ImportMetaEnv;
const requestedCluster = runtimeEnv.VITE_SOLANA_CLUSTER || 'localnet';
if (requestedCluster !== 'localnet' && requestedCluster !== 'devnet') {
  throw new Error('VITE_SOLANA_CLUSTER must be localnet or devnet.');
}

export const cluster: GridCluster = requestedCluster;
export const endpoint = runtimeEnv.VITE_SOLANA_RPC_URL ||
  (cluster === 'localnet' ? 'http://127.0.0.1:8899' : clusterApiUrl('devnet'));
export const programId = new PublicKey(idl.address);
export const configuredRider = runtimeEnv.VITE_RIDER_PUBLIC_KEY || '';
