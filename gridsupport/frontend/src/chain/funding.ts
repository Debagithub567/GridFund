import {safeCount} from './accounts';
import type {ChainSnapshot} from './accounts';
import type {FanReceipt} from './fanReceipts';

export type FundingTotals = {
  requiredCents: number;
  merchantCents: number;
  fanCents: number;
  fanUnits: bigint;
  remainingCents: number;
  progress: number;
  extraCents: number;
  extraCount: number;
};

// Demo accounting convention: 1 gsUSDC = €1, with six token decimals and two cent decimals.
export const mockUsdcToDemoCents = (units: bigint): bigint => units / 10_000n;

export function fundingTotals(snapshot: ChainSnapshot, receipts: FanReceipt[], scopedExpenseIds?: string[]): FundingTotals {
  const scope = scopedExpenseIds ? new Set(scopedExpenseIds) : null;
  const included = snapshot.expenses.filter(expense => !scope || scope.has(expense.address.toBase58()));
  const extra = scope ? snapshot.expenses.filter(expense => !scope.has(expense.address.toBase58())) : [];
  const required = included.reduce((sum, expense) => sum + expense.estimatedCostCents, 0n);
  const merchant = included.reduce((sum, expense) => sum + expense.committedCoverageCents, 0n);
  const fanUnits = [...new Map(receipts.map(receipt => [receipt.signature, receipt])).values()]
    .reduce((sum, receipt) => sum + BigInt(receipt.amount), 0n);
  const fanCents = mockUsdcToDemoCents(fanUnits);
  const remaining = required > merchant + fanCents ? required - merchant - fanCents : 0n;
  const requiredCents = safeCount(required, 'Racing budget');
  const merchantCents = safeCount(merchant, 'Merchant coverage');
  return {
    requiredCents, merchantCents, fanCents: safeCount(fanCents, 'Fan support'), fanUnits,
    remainingCents: safeCount(remaining, 'Remaining budget'),
    progress: requiredCents ? Math.min(100, (merchantCents + safeCount(fanCents, 'Fan support')) / requiredCents * 100) : 0,
    extraCents: safeCount(extra.reduce((sum, expense) => sum + expense.estimatedCostCents, 0n), 'Additional expenses'),
    extraCount: extra.length,
  };
}
