import type {Program} from '@anchor-lang/core';
import {PublicKey} from '@solana/web3.js';
import type {Gridsupport} from './gridsupport';
import {fetchRegisteredRiderSnapshots} from './accounts';
import type {ChainSnapshot} from './accounts';
import {riderName, verifiedSeasonTitle} from './metadata';
import {riderProfilePda} from './pdas';

type RawProfile = {rider: PublicKey; bump: number};
export type DirectoryRider = {
  rider: PublicKey;
  profileAddress: PublicKey;
  snapshot: ChainSnapshot;
  displayName: string;
  seasonTitle: string | null;
  expenseCount: number;
  seasonBudgetCents: bigint | null;
  merchantCoverageCents: bigint;
  remainingCoverageCents: bigint;
};

export const riderIsDiscoverable = (snapshot: ChainSnapshot): boolean =>
  snapshot.profileExists && snapshot.seasonExists && snapshot.expenses.length > 0;

export function directoryEntry(snapshot: ChainSnapshot, index: number, seasonTitle?: string | null): DirectoryRider {
  const merchantCoverageCents = snapshot.expenses.reduce((sum, expense) => sum + expense.committedCoverageCents, 0n);
  const remainingCoverageCents = snapshot.expenses.reduce((sum, expense) =>
    sum + expense.estimatedCostCents - expense.committedCoverageCents, 0n);
  return {
    rider: snapshot.rider, profileAddress: snapshot.profileAddress, snapshot,
    displayName: riderName(snapshot.rider.toBase58()) || `Rider #${index + 1}`, seasonTitle: seasonTitle || null,
    expenseCount: snapshot.expenses.length, seasonBudgetCents: snapshot.seasonBudgetCents,
    merchantCoverageCents, remainingCoverageCents,
  };
}

export async function discoverRiderDirectory(program: Program<Gridsupport>): Promise<DirectoryRider[]> {
  const connection = program.provider.connection;
  const deployed = await connection.getAccountInfo(program.programId, 'confirmed');
  if (!deployed?.executable) throw new Error(`GridSupport program ${program.programId.toBase58()} is not deployed on the selected RPC.`);
  const size = program.coder.accounts.size('riderProfile');
  const accounts = await connection.getProgramAccounts(program.programId, {
    commitment: 'confirmed', filters: [{dataSize: size}, {memcmp: program.coder.accounts.memcmp('riderProfile')}],
  });
  const unique = new Map<string, PublicKey>();
  for (const {pubkey, account} of accounts) {
    if (!account.owner.equals(program.programId) || account.data.length !== size) {
      throw new Error(`RiderProfile ${pubkey.toBase58()} has invalid owner or size.`);
    }
    const profile = program.coder.accounts.decode<RawProfile>('riderProfile', account.data);
    const [canonical, bump] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('rider'), profile.rider.toBytes()], program.programId);
    if (!pubkey.equals(canonical) || !pubkey.equals(riderProfilePda(profile.rider)) || profile.bump !== bump) {
      throw new Error(`RiderProfile ${pubkey.toBase58()} is not canonical.`);
    }
    unique.set(profile.rider.toBase58(), profile.rider);
  }
  const riders = [...unique.values()].sort((left, right) =>
    left.toBase58() < right.toBase58() ? -1 : left.toBase58() > right.toBase58() ? 1 : 0);
  const snapshots = await fetchRegisteredRiderSnapshots(program, riders);
  return Promise.all(snapshots.filter(riderIsDiscoverable).map(async (snapshot, index) => directoryEntry(snapshot, index,
    snapshot.seasonTitleHash ? await verifiedSeasonTitle(snapshot.seasonAddress.toBase58(), snapshot.seasonTitleHash) : null)));
}
