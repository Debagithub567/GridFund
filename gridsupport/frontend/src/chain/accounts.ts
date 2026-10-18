import type {Program} from '@anchor-lang/core';
import {PublicKey} from '@solana/web3.js';
import type {Gridsupport} from './gridsupport';
import {expensePda, riderProfilePda, seasonPda, sponsorshipPda} from './pdas';
import type {Contribution, DemoState, Expense} from '../model';
import type {VerifiedMetadata} from './metadata';

type IntegerField = {toString(): string};
type RawProfile = {rider: PublicKey};
type RawSeason = {rider: PublicKey; budgetCents: IntegerField; titleHash: number[] | Uint8Array; status: number; expenseCount: IntegerField};
type RawExpense = {season: PublicKey; expenseId: IntegerField; estimatedCostCents: IntegerField; committedCoverageCents: IntegerField; sponsorshipCount: IntegerField; category: number; descriptionHash: number[] | Uint8Array};
type RawSponsorship = {expense: PublicKey; merchant: PublicKey; sponsorshipId: IntegerField; amountCents: IntegerField; createdAt: IntegerField};

export type ChainSponsorship = {
  address: PublicKey;
  expense: PublicKey;
  merchant: PublicKey;
  amountCents: bigint;
  createdAt: bigint;
  sponsorshipId: bigint;
};
export type ChainExpense = {
  address: PublicKey;
  expenseId: bigint;
  estimatedCostCents: bigint;
  committedCoverageCents: bigint;
  sponsorshipCount: bigint;
  category: number;
  descriptionHash: number[];
  sponsorships: ChainSponsorship[];
};
export type ChainSnapshot = {
  rider: PublicKey;
  profileAddress: PublicKey;
  profileExists: boolean;
  seasonAddress: PublicKey;
  seasonExists: boolean;
  seasonBudgetCents: bigint | null;
  seasonTitleHash: number[] | null;
  seasonStatus: number | null;
  expenses: ChainExpense[];
};

export function safeCount(value: bigint, label: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the browser's exact integer range.`);
  }
  return Number(value);
}

async function fetchInBatches<T>(program: Program<Gridsupport>, accountType: string, addresses: PublicKey[]): Promise<(T | null)[]> {
  const result: (T | null)[] = [];
  for (let start = 0; start < addresses.length; start += 100) {
    const batch = addresses.slice(start, start + 100);
    const accounts = await program.provider.connection.getMultipleAccountsInfo(batch, 'confirmed');
    result.push(...accounts.map((info, index) => decodeAccount<T>(program, accountType, batch[index], info)));
  }
  return result;
}

function decodeAccount<T>(program: Program<Gridsupport>, accountType: string, address: PublicKey,
  info: Awaited<ReturnType<Program<Gridsupport>['provider']['connection']['getAccountInfo']>>): T | null {
  if (!info) return null;
  if (!info.owner.equals(program.programId)) throw new Error(`${accountType} ${address.toBase58()} has the wrong program owner.`);
  return program.coder.accounts.decode<T>(accountType, info.data);
}

async function fetchOne<T>(program: Program<Gridsupport>, accountType: string, address: PublicKey): Promise<T | null> {
  const info = await program.provider.connection.getAccountInfo(address, 'confirmed');
  return decodeAccount<T>(program, accountType, address, info);
}

export async function fetchRiderSnapshot(program: Program<Gridsupport>, rider: PublicKey): Promise<ChainSnapshot> {
  const deployed = await program.provider.connection.getAccountInfo(program.programId, 'confirmed');
  if (!deployed?.executable) {
    throw new Error(`GridSupport program ${program.programId.toBase58()} is not deployed on the selected RPC.`);
  }
  const profileAddress = riderProfilePda(rider);
  const seasonAddress = seasonPda(profileAddress);
  const empty: ChainSnapshot = {
    rider, profileAddress, profileExists: false, seasonAddress,
    seasonExists: false, seasonBudgetCents: null, seasonTitleHash: null, seasonStatus: null, expenses: [],
  };
  const profile = await fetchOne<RawProfile>(program, 'riderProfile', profileAddress);
  if (!profile) return empty;
  if (!profile.rider.equals(rider)) throw new Error('Rider profile does not match the requested wallet.');
  const season = await fetchOne<RawSeason>(program, 'season', seasonAddress);
  return snapshotWithSeason(program, rider, season);
}

// Discovery has already verified the canonical profiles. Batch their season
// reads instead of repeating the program/profile RPC checks for every card.
export async function fetchRegisteredRiderSnapshots(program: Program<Gridsupport>, riders: PublicKey[]): Promise<ChainSnapshot[]> {
  const seasonAddresses = riders.map(rider => seasonPda(riderProfilePda(rider)));
  const seasons = await fetchInBatches<RawSeason>(program, 'season', seasonAddresses);
  const snapshots: ChainSnapshot[] = [];
  for (let start = 0; start < riders.length; start += 4) {
    snapshots.push(...await Promise.all(riders.slice(start, start + 4).map((rider, offset) =>
      snapshotWithSeason(program, rider, seasons[start + offset]))));
  }
  return snapshots;
}

async function snapshotWithSeason(program: Program<Gridsupport>, rider: PublicKey, season: RawSeason | null): Promise<ChainSnapshot> {
  const profileAddress = riderProfilePda(rider);
  const seasonAddress = seasonPda(profileAddress);
  const empty: ChainSnapshot = {
    rider, profileAddress, profileExists: true, seasonAddress,
    seasonExists: false, seasonBudgetCents: null, seasonTitleHash: null, seasonStatus: null, expenses: [],
  };
  if (!season) return empty;
  if (!season.rider.equals(rider)) throw new Error('Season does not belong to the requested rider.');

  const expenseCount = safeCount(BigInt(season.expenseCount.toString()), 'Expense count');
  if (expenseCount > 1000) throw new Error('This rider has more expenses than the browser view can load.');
  const expenseAddresses = Array.from({length: expenseCount}, (_, index) => expensePda(seasonAddress, BigInt(index)));
  const records = await fetchInBatches<RawExpense>(program, 'expense', expenseAddresses);
  const expenses: ChainExpense[] = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) throw new Error(`Expense #${index} is missing from the rider's season.`);
    if (!record.season.equals(seasonAddress) || BigInt(record.expenseId.toString()) !== BigInt(index)) {
      throw new Error(`Expense #${index} has inconsistent account data.`);
    }
    const address = expenseAddresses[index];
    const sponsorshipCount = BigInt(record.sponsorshipCount.toString());
    if (sponsorshipCount > 1000n) throw new Error(`Expense #${index} has more sponsorships than the browser view can load.`);
    const sponsorshipAddresses = Array.from(
      {length: safeCount(sponsorshipCount, 'Sponsorship count')},
      (_, sponsorshipIndex) => sponsorshipPda(address, BigInt(sponsorshipIndex)),
    );
    const sponsorshipRecords = await fetchInBatches<RawSponsorship>(program, 'sponsorship', sponsorshipAddresses);
    const sponsorships = sponsorshipRecords.map((sponsorship, sponsorshipIndex) => {
      if (!sponsorship) throw new Error(`Sponsorship #${sponsorshipIndex} is missing for expense #${index}.`);
      if (!sponsorship.expense.equals(address) || BigInt(sponsorship.sponsorshipId.toString()) !== BigInt(sponsorshipIndex)) {
        throw new Error(`Sponsorship #${sponsorshipIndex} has inconsistent account data.`);
      }
      return {
        address: sponsorshipAddresses[sponsorshipIndex], expense: sponsorship.expense, merchant: sponsorship.merchant,
        amountCents: BigInt(sponsorship.amountCents.toString()),
        createdAt: BigInt(sponsorship.createdAt.toString()),
        sponsorshipId: BigInt(sponsorship.sponsorshipId.toString()),
      };
    });
    const committedCoverageCents = BigInt(record.committedCoverageCents.toString());
    if (sponsorships.reduce((sum, sponsorship) => sum + sponsorship.amountCents, 0n) !== committedCoverageCents) {
      throw new Error(`Expense #${index + 1} coverage does not match its verified sponsorships. Refresh to try again.`);
    }
    expenses.push({
      address, expenseId: BigInt(record.expenseId.toString()),
      estimatedCostCents: BigInt(record.estimatedCostCents.toString()),
      committedCoverageCents,
      sponsorshipCount, category: record.category,
      descriptionHash: Array.from(record.descriptionHash), sponsorships,
    });
  }
  return {
    ...empty, profileExists: true, seasonExists: true,
    seasonBudgetCents: BigInt(season.budgetCents.toString()), seasonTitleHash: Array.from(season.titleHash), seasonStatus: season.status, expenses,
  };
}

export function snapshotToViewState(snapshot: ChainSnapshot, selectedExpenseId = '', metadata?: VerifiedMetadata): DemoState {
  const expenses: Expense[] = snapshot.expenses.map(record => ({
    id: record.address.toBase58(),
    title: metadata?.expenses[record.address.toBase58()]?.title || `Expense #${record.expenseId + 1n}`,
    requiredCents: safeCount(record.estimatedCostCents, 'Expense amount'),
    description: metadata?.expenses[record.address.toBase58()]?.description || 'Racing expense',
    image: record.category === 1 ? 'tyres' : record.category === 3 ? 'food' : record.category === 4 ? 'stay' : 'track',
    onChain: true,
    committedCoverageCents: safeCount(record.committedCoverageCents, 'Merchant coverage'),
    sponsorshipCount: safeCount(record.sponsorshipCount, 'Sponsorship count'),
  }));
  const contributions: Contribution[] = snapshot.expenses.flatMap(record => record.sponsorships.map(sponsorship => ({
    id: sponsorship.address.toBase58(), expenseId: record.address.toBase58(),
    amountCents: safeCount(sponsorship.amountCents, 'Sponsorship amount'),
    type: 'merchant' as const, support: 'in-kind' as const,
    createdAt: new Date(safeCount(sponsorship.createdAt, 'Sponsorship timestamp') * 1000).toISOString(),
    merchantAddress: sponsorship.merchant.toBase58(),
  })));
  return {
    version: 1, expenses, contributions,
    selectedExpenseId: expenses.some(expense => expense.id === selectedExpenseId)
      ? selectedExpenseId : (expenses[0]?.id || ''),
  };
}
