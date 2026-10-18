import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {ArrowUpRight, LoaderCircle, Plus, X} from 'lucide-react';
import {money, parseAmount} from './model';
import type {IntegrationView} from './chain/useConnectedData';
import type {BudgetPlan, BudgetStep} from './chain/budget';
import {riderError} from './chain/riderTransactions';
import {expenseCategories} from './chain/categories';
import {defaultBudgetPlan} from './chain/registration';
import {explorerTransactionUrl} from './chain/explorer';

type Draft = {title: string; amount: string; category: number; description: string};
const fromPlan = (plan: BudgetPlan): Draft[] => plan.expenses.map(item => ({title: item.title,
  amount: String(item.amountCents / 100), category: item.category, description: item.description}));
const empty = (): Draft => ({title: '', amount: '', category: 0, description: ''});
const labels: Record<BudgetStep['stage'], string> = {
  'awaiting-wallet': 'Waiting for wallet approval', submitted: 'Transaction submitted',
  confirming: 'Confirming on Devnet', verifying: 'Verifying account', confirmed: 'Confirmed',
  verified: 'Account verified', skipped: 'Already verified',
};
const draftKey = (wallet: string) => `gridsupport-rider-form-draft:${wallet || 'disconnected'}`;
function loadDraft(wallet: string): {name: string; season: string; expenses: Draft[]; additional: Draft[]} | null {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(wallet)) || 'null');
    if (typeof value?.name !== 'string' || typeof value?.season !== 'string' ||
      !Array.isArray(value.expenses) || !Array.isArray(value.additional)) return null;
    const valid = (item: Draft) => typeof item.title === 'string' && typeof item.amount === 'string' &&
      typeof item.description === 'string' && Number.isInteger(item.category) && item.category >= 0 && item.category <= 255;
    return value.expenses.every(valid) && value.additional.every(valid) ? value : null;
  } catch { return null; }
}

export default function RacingBudget({integration, initialPlan, basePlan, registered, onIntent, onRegistering, onFailure, onComplete}: {
  integration: IntegrationView; initialPlan: BudgetPlan | null; basePlan: BudgetPlan | null; registered: boolean;
  onIntent: (plan: BudgetPlan) => void; onRegistering: () => void;
  onFailure: (message: string) => void; onComplete: () => void;
}) {
  const restored = useRef(loadDraft(integration.walletAddress));
  const [name, setName] = useState(restored.current?.name || initialPlan?.name || defaultBudgetPlan.name);
  const [season, setSeason] = useState(restored.current?.season || initialPlan?.season || defaultBudgetPlan.season);
  const [expenses, setExpenses] = useState<Draft[]>(restored.current?.expenses || fromPlan(initialPlan || defaultBudgetPlan));
  const [additional, setAdditional] = useState<Draft[]>(restored.current?.additional || []);
  const [steps, setSteps] = useState<BudgetStep[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { try { localStorage.setItem(draftKey(integration.walletAddress), JSON.stringify({name, season, expenses, additional})); } catch { /* Draft remains in memory. */ } }, [integration.walletAddress, name, season, expenses, additional]);
  const update = (index: number, change: Partial<Draft>, extra = false) => {
    const set = extra ? setAdditional : setExpenses;
    set(current => current.map((item, position) => position === index ? {...item, ...change} : item));
  };
  const onStep = (step: BudgetStep) => setSteps(previous => [...previous.filter(item => item.index !== step.index), step].sort((a, b) => a.index - b.index));
  const parseRows = (rows: Draft[]) => rows.map(item => ({title: item.title.trim(), description: item.description.trim(),
    category: item.category, amountCents: parseAmount(item.amount)}));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current || integration.writing) return;
    lock.current = true;
    try {
      if (!integration.walletAddress || integration.status !== 'ready') throw new Error('Connect your wallet and wait for your accounts to load.');
      setSteps([]); onFailure('');
      if (registered) {
        if (!additional.length) return;
        const rows = parseRows(additional);
        if (rows.some(item => !item.title || !item.description)) throw new Error('Complete each new expense before signing.');
        setBusy(true); onRegistering();
        await integration.runAdditionalExpenses(rows, basePlan, onStep);
        setAdditional([]);
      } else {
        const plan: BudgetPlan = {name: name.trim(), season: season.trim(), expenses: parseRows(expenses)};
        if (!plan.name || !plan.season || !plan.expenses.length || plan.expenses.some(item => !item.title || !item.description))
          throw new Error('Enter a rider name, season, and complete expense details.');
        setBusy(true); onRegistering(); onIntent(plan);
        await integration.runBudgetPlan(plan, onStep);
      }
      onComplete();
    } catch (reason) { onFailure(riderError(reason)); }
    finally { lock.current = false; setBusy(false); }
  };
  const rows = registered ? basePlan ? fromPlan(basePlan) : integration.state?.expenses.map(item => ({title: item.title,
    amount: String(item.requiredCents / 100), category: 0, description: item.description || 'Verified on-chain expense'})) || [] : expenses;
  const total = rows.reduce((sum, item) => { try { return sum + parseAmount(item.amount); } catch { return sum; } }, 0);
  return <section className="racing-budget" aria-labelledby="racing-budget-title">
    <div className="eyebrow">RIDER / RACING BUDGET</div><h2 id="racing-budget-title">YOUR ROAD TO THE GRID.</h2>
    <form onSubmit={submit}><div className="budget-fields"><label>Rider name <input className="gs-input" value={registered ? basePlan?.name || integration.riderName || 'Verified rider' : name} maxLength={80} onChange={event => setName(event.target.value)} readOnly={registered} required /></label>
      <label>Racing season <input className="gs-input" value={registered ? basePlan?.season || integration.seasonTitle || 'Verified season' : season} maxLength={80} onChange={event => setSeason(event.target.value)} readOnly={registered} required /></label></div>
      <div className="budget-lines">{rows.map((item, index) => <div className="budget-expense" key={index}>
        <label>Expense <input className="gs-input" aria-label={`Expense ${index + 1} name`} value={item.title} maxLength={80} onChange={event => update(index, {title: event.target.value, description: item.description === item.title ? event.target.value : item.description})} readOnly={registered} required /></label>
        <label>Amount <span className="gs-money-input"><span>€</span><input aria-label={`${item.title || `Expense ${index + 1}`} amount in EUR`} inputMode="decimal" value={item.amount} onChange={event => update(index, {amount: event.target.value})} readOnly={registered} required /></span></label>
        <label>Category <select className="gs-input" value={item.category} onChange={event => update(index, {category: Number(event.target.value)})} disabled={registered}>{expenseCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
        <label>Description <input className="gs-input" aria-label={`Expense ${index + 1} description`} value={item.description} maxLength={240} onChange={event => update(index, {description: event.target.value})} readOnly={registered} required /></label>
        {!registered && expenses.length > 1 && <button className="budget-remove" type="button" aria-label={`Remove ${item.title || `expense ${index + 1}`}`} onClick={() => setExpenses(current => current.filter((_, position) => position !== index))} disabled={busy}><X size={15}/></button>}
      </div>)}</div>
      {registered ? <><div className="budget-total-line"><span>Original racing budget</span><strong>{money(basePlan ? total : Number(integration.snapshot?.seasonBudgetCents || 0n))}</strong></div>
        <div className="eyebrow">ADDITIONAL RACING EXPENSES</div><div className="budget-lines">{additional.map((item, index) => <div className="budget-expense" key={index}>
          <label>Expense <input className="gs-input" aria-label={`New expense ${index + 1} name`} value={item.title} maxLength={80} onChange={event => update(index, {title: event.target.value, description: item.description === item.title ? event.target.value : item.description}, true)} required /></label>
          <label>Amount <span className="gs-money-input"><span>€</span><input aria-label={`New expense ${index + 1} amount in EUR`} inputMode="decimal" value={item.amount} onChange={event => update(index, {amount: event.target.value}, true)} required /></span></label>
          <label>Category <select className="gs-input" value={item.category} onChange={event => update(index, {category: Number(event.target.value)}, true)}>{expenseCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
          <label>Description <input className="gs-input" aria-label={`New expense ${index + 1} description`} value={item.description} maxLength={240} onChange={event => update(index, {description: event.target.value}, true)} required /></label>
          <button className="budget-remove" type="button" aria-label={`Remove new expense ${index + 1}`} onClick={() => setAdditional(current => current.filter((_, position) => position !== index))} disabled={busy}><X size={15}/></button>
        </div>)}</div><button className="budget-add" type="button" onClick={() => setAdditional(current => [...current, empty()])} disabled={busy}><Plus size={15}/> Add expense</button></> : <><button className="budget-add" type="button" onClick={() => setExpenses(current => [...current, empty()])} disabled={busy}><Plus size={15}/> Add expense</button>
        <div className="budget-total-line"><span>Total racing budget</span><strong>{money(total)}</strong></div></>}
      {steps.length > 0 && <details className="rider-account-details" open={busy}><summary>{busy ? `${steps.at(-1)?.label}: ${labels[steps.at(-1)!.stage]}` : 'Transaction details'}</summary><ol className="budget-progress">{steps.map(step => <li key={step.index}><span>{step.label}: {labels[step.stage]}</span>{step.signature && (explorerTransactionUrl(step.signature, integration.cluster) ? <a href={explorerTransactionUrl(step.signature, integration.cluster)!} target="_blank" rel="noopener noreferrer">View transaction ↗</a> : <code>{step.signature.slice(0, 10)}…</code>)}</li>)}</ol></details>}
      {(!registered || additional.length > 0) && <button className="cta" type="submit" disabled={busy || integration.writing || integration.status !== 'ready' || !integration.walletAddress}>{busy ? <><LoaderCircle className="spinning" size={17}/> CONFIRMING…</> : registered ? <>ADD EXPENSES <ArrowUpRight size={17}/></> : <>CONFIRM RACING BUDGET <ArrowUpRight size={17}/></>}</button>}
    </form>
  </section>;
}
