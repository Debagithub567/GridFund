import type {ChainSnapshot} from './accounts';
import {budgetIsVerified} from './budget';
import type {BudgetPlan} from './budget';
import {sha256Text} from './metadata';

export type RegistrationState = 'unregistered' | 'registering' | 'partial' | 'registered' | 'error';
const key = (wallet: string) => `gridsupport-budget-intent:${wallet}`;
export const defaultBudgetPlan: BudgetPlan = {name: 'Pol Espargaró', season: '2026', expenses: [
  {title: 'Racing tyres', description: 'Racing tyres', amountCents: 50000, category: 1},
  {title: 'Fuel & travel', description: 'Fuel & travel', amountCents: 30000, category: 2},
  {title: 'Accommodation & food', description: 'Accommodation & food', amountCents: 20000, category: 4},
]};

export function loadBudgetIntent(wallet: string): BudgetPlan | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(wallet)) || 'null');
    if (!value || typeof value.name !== 'string' || typeof value.season !== 'string' ||
      !Array.isArray(value.expenses) || !value.expenses.length ||
      !value.expenses.every((item: BudgetPlan['expenses'][number]) => typeof item.title === 'string' &&
        typeof item.description === 'string' && Number.isSafeInteger(item.amountCents) && item.amountCents > 0 &&
        Number.isInteger(item.category) && item.category >= 0 && item.category <= 255)) return null;
    return value as BudgetPlan;
  } catch { return null; }
}

export function saveBudgetIntent(wallet: string, plan: BudgetPlan): void {
  try { localStorage.setItem(key(wallet), JSON.stringify(plan)); }
  catch { /* The current attempt still proceeds; chain accounts determine registration. */ }
}

export async function registrationFromSnapshot(snapshot: ChainSnapshot, intent: BudgetPlan | null): Promise<RegistrationState> {
  if (!snapshot.profileExists) return 'unregistered';
  if (!snapshot.seasonExists || !snapshot.expenses.length) return 'partial';
  if (intent && await budgetIsVerified(snapshot, intent)) return 'registered';
  const defaultSeasonHash = await sha256Text(defaultBudgetPlan.season);
  if (snapshot.seasonBudgetCents === 100000n &&
    snapshot.seasonTitleHash?.every((byte, index) => byte === defaultSeasonHash[index])) {
    return await budgetIsVerified(snapshot, defaultBudgetPlan) ? 'registered' : 'partial';
  }
  return intent ? 'partial' : 'registered';
}
