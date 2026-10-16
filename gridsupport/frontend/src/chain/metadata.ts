import {cluster, programId} from './config';

// SHA-256 of the exact UTF-8 bytes of a trimmed title/description. No prefix,
// normalization, or trailing newline is added. The same text is saved locally.
export async function sha256Text(value: string): Promise<number[]> {
  const bytes = new TextEncoder().encode(value.trim());
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

type StoredExpense = {title: string; description: string; category: number; descriptionHash: number[]};
type StoredSeason = {title: string; titleHash: number[]};
export type VerifiedMetadata = {seasonTitle?: string; expenses: Record<string, {title: string; description: string; category: number}>};
const key = (kind: string, address: string) => `gridsupport-metadata-v1:${cluster}:${programId.toBase58()}:${kind}:${address}`;
const read = (kind: string, address: string): unknown => {
  try { const value = localStorage.getItem(key(kind, address)); return value ? JSON.parse(value) : null; }
  catch { return null; }
};
const write = (kind: string, address: string, value: unknown): void => {
  try { localStorage.setItem(key(kind, address), JSON.stringify(value)); }
  catch { /* Chain write succeeded; readable metadata is unavailable in this browser. */ }
};
const equalHash = (left: unknown, right: number[]) => Array.isArray(left) && left.length === 32 && right.length === 32 && left.every((byte, index) => Number.isInteger(byte) && byte === right[index]);

export function saveSeasonMetadata(address: string, title: string, titleHash: number[]): void {
  write('season', address, {title: title.trim(), titleHash} satisfies StoredSeason);
}
export function saveExpenseMetadata(address: string, title: string, description: string, category: number, descriptionHash: number[]): void {
  write('expense', address, {title: title.trim(), description: description.trim(), category, descriptionHash} satisfies StoredExpense);
}

export async function verifiedSeasonTitle(address: string, chainHash: number[]): Promise<string | undefined> {
  const record = read('season', address) as StoredSeason | null;
  if (!record || typeof record.title !== 'string' || !equalHash(record.titleHash, chainHash)) return;
  return equalHash(await sha256Text(record.title), chainHash) ? record.title : undefined;
}
export async function verifiedExpenseMetadata(address: string, chainHash: number[], category: number): Promise<VerifiedMetadata['expenses'][string] | undefined> {
  const record = read('expense', address) as StoredExpense | null;
  if (!record || typeof record.title !== 'string' || typeof record.description !== 'string' || record.category !== category || !equalHash(record.descriptionHash, chainHash)) return;
  if (!equalHash(await sha256Text(record.description), chainHash)) return;
  return {title: record.title, description: record.description, category};
}
