import {PublicKey} from '@solana/web3.js';
import {programId} from './config';

function u64le(value: bigint): Uint8Array {
  if (value < 0n || value > (1n << 64n) - 1n) throw new RangeError('PDA index is outside u64.');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

export const riderProfilePda = (rider: PublicKey) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode('rider'), rider.toBytes()], programId)[0];
export const seasonPda = (profile: PublicKey) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode('season'), profile.toBytes()], programId)[0];
export const expensePda = (season: PublicKey, index: bigint) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode('expense'), season.toBytes(), u64le(index)], programId)[0];
export const sponsorshipPda = (expense: PublicKey, index: bigint) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode('sponsorship'), expense.toBytes(), u64le(index)], programId)[0];
