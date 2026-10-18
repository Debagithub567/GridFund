import {fetchRiderSnapshot} from './accounts';
import type {ChainSnapshot} from './accounts';
import {addExpense, createSeason, initializeRider} from './riderTransactions';
import type {RiderProgress, RiderTransactionContext} from './riderTransactions';
import {saveExpenseMetadata, saveRiderName, saveSeasonMetadata, sha256Text} from './metadata';

export type BudgetExpense = {title: string; amountCents: number; category: number; description: string};
export type BudgetPlan = {name: string; season: string; expenses: BudgetExpense[]};
export type BudgetStep = {label: string; index: number; total: number; stage: RiderProgress['stage'] | 'verifying' | 'verified' | 'skipped'; signature?: string; snapshot?: ChainSnapshot};

export async function matchingBudgetExpenses(snapshot: ChainSnapshot, plan: BudgetPlan) {
  const wanted = await Promise.all(plan.expenses.map(async item => ({item, hash: await sha256Text(item.description)})));
  const keys = wanted.map(({item, hash}) => `${item.category}:${hash.join(',')}`);
  if (new Set(keys).size !== keys.length) throw new Error('Two draft expenses have the same category and description. Give each expense a distinct description.');
  return wanted.map(({item, hash}) => {
    const candidates = snapshot.expenses.filter(expense => expense.category === item.category &&
      expense.descriptionHash.every((byte, index) => byte === hash[index]));
    if (candidates.length > 1) throw new Error(`${item.title} matches multiple existing expenses. Review the on-chain expenses before continuing.`);
    const match = candidates[0];
    if (match && match.estimatedCostCents !== BigInt(item.amountCents)) {
      throw new Error(`${item.title} has a different on-chain amount. Edit the draft to match before continuing.`);
    }
    return {item, hash, match};
  });
}

export async function budgetIsVerified(snapshot: ChainSnapshot, plan: BudgetPlan): Promise<boolean> {
  if (!snapshot.profileExists || !snapshot.seasonExists || snapshot.seasonStatus !== 1) return false;
  const total = plan.expenses.reduce((sum, item) => sum + item.amountCents, 0);
  const seasonHash = await sha256Text(plan.season);
  if (snapshot.seasonBudgetCents !== BigInt(total) ||
    !snapshot.seasonTitleHash?.every((byte, index) => byte === seasonHash[index])) return false;
  return (await matchingBudgetExpenses(snapshot, plan)).every(({match}) => !!match);
}

export async function confirmBudget(ctx: RiderTransactionContext, plan: BudgetPlan, onStep: (step: BudgetStep) => void): Promise<ChainSnapshot> {
  if (!plan.name.trim() || !plan.season.trim() || !plan.expenses.length) throw new Error('Enter a rider name, season, and at least one expense.');
  for (const item of plan.expenses) {
    if (!item.title.trim() || !item.description.trim() || !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 ||
      !Number.isInteger(item.category) || item.category < 0 || item.category > 255) throw new Error('Each expense needs a title and valid positive amount.');
  }
  const total = plan.expenses.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(total)) throw new Error('The combined budget is too large.');
  const steps = ['Rider profile', `${plan.season.trim()} season`, ...plan.expenses.map(item => item.title.trim())];
  let snapshot = await fetchRiderSnapshot(ctx.program, ctx.rider);
  await matchingBudgetExpenses(snapshot, plan);
  const emit = (index: number, stage: BudgetStep['stage'], signature?: string) => onStep({label: steps[index], index, total: steps.length, stage, signature, snapshot});
  const context = (index: number): RiderTransactionContext => ({...ctx, onProgress: progress => emit(index, progress.stage, progress.signature)});
  if (!snapshot.profileExists) {
    const result = await initializeRider(context(0)); snapshot = result.snapshot; emit(0, 'verified', result.signature);
  } else emit(0, 'skipped');
  saveRiderName(ctx.rider.toBase58(), plan.name);
  const seasonHash = await sha256Text(plan.season);
  if (snapshot.seasonExists) {
    if (snapshot.seasonBudgetCents !== BigInt(total) || !snapshot.seasonTitleHash?.every((byte, index) => byte === seasonHash[index])) {
      throw new Error('The existing season differs from this budget. Review the verified season before continuing.');
    }
    emit(1, 'skipped');
  } else {
    const result = await createSeason(context(1), total, plan.season);
    snapshot = result.snapshot; saveSeasonMetadata(result.address.toBase58(), plan.season, result.hash!); emit(1, 'verified', result.signature);
  }
  for (let index = 0; index < plan.expenses.length; index++) {
    const item = plan.expenses[index];
    const hash = await sha256Text(item.description);
    const existing = (await matchingBudgetExpenses(snapshot, plan))[index].match;
    if (existing) {
      saveExpenseMetadata(existing.address.toBase58(), item.title, item.description, item.category, hash);
      emit(index + 2, 'skipped');
      continue;
    }
    const result = await addExpense(context(index + 2), item.amountCents, item.category, item.description);
    snapshot = result.snapshot;
    saveExpenseMetadata(result.address.toBase58(), item.title, item.description, item.category, result.hash!);
    emit(index + 2, 'verified', result.signature);
  }
  snapshot = await fetchRiderSnapshot(ctx.program, ctx.rider);
  if (!await budgetIsVerified(snapshot, plan)) throw new Error('The registration could not be fully verified. Refresh and resume safely.');
  return snapshot;
}

export async function confirmAdditionalExpenses(ctx: RiderTransactionContext, expenses: BudgetExpense[],
  basePlan: BudgetPlan | null, onStep: (step: BudgetStep) => void): Promise<ChainSnapshot> {
  if (!expenses.length) throw new Error('Add at least one new racing expense.');
  for (const item of expenses) {
    if (!item.title.trim() || !item.description.trim() || !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 ||
      !Number.isInteger(item.category) || item.category < 0 || item.category > 255) throw new Error('Each new expense needs a title, description and positive amount.');
  }
  let snapshot = await fetchRiderSnapshot(ctx.program, ctx.rider);
  if (!snapshot.profileExists || !snapshot.seasonExists || snapshot.seasonStatus !== 1) {
    throw new Error('Verify the Rider profile and active season before adding expenses.');
  }
  if (basePlan && !await budgetIsVerified(snapshot, basePlan)) {
    throw new Error('The original racing budget could not be verified. Refresh before adding expenses.');
  }
  const requested: BudgetPlan = {name: '', season: '', expenses};
  await matchingBudgetExpenses(snapshot, requested);
  for (let index = 0; index < expenses.length; index++) {
    const item = expenses[index];
    const matched = (await matchingBudgetExpenses(snapshot, requested))[index];
    const emit = (stage: BudgetStep['stage'], signature?: string) => onStep({
      label: item.title, index, total: expenses.length, stage, signature, snapshot,
    });
    if (matched.match) {
      saveExpenseMetadata(matched.match.address.toBase58(), item.title, item.description, item.category, matched.hash);
      emit('skipped');
      continue;
    }
    const result = await addExpense({...ctx, onProgress: progress => emit(progress.stage, progress.signature)},
      item.amountCents, item.category, item.description);
    snapshot = result.snapshot;
    saveExpenseMetadata(result.address.toBase58(), item.title, item.description, item.category, result.hash!);
    emit('verified', result.signature);
  }
  snapshot = await fetchRiderSnapshot(ctx.program, ctx.rider);
  if (!(await matchingBudgetExpenses(snapshot, requested)).every(item => !!item.match)) {
    throw new Error('The new expenses could not all be verified. Refresh and resume safely.');
  }
  return snapshot;
}
