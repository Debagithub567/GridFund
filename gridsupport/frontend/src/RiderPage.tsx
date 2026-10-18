import {useEffect, useState} from 'react';
import Dashboard from './Dashboard';
import RacingBudget from './RacingBudget';
import RoleTabs from './RoleTabs';
import type {IntegrationView} from './chain/useConnectedData';
import {budgetIsVerified, matchingBudgetExpenses} from './chain/budget';
import type {BudgetPlan} from './chain/budget';
import {defaultBudgetPlan, loadBudgetIntent, registrationFromSnapshot, saveBudgetIntent} from './chain/registration';
import type {RegistrationState} from './chain/registration';
import {explorerAccountUrl} from './chain/explorer';

type Resolved = {wallet: string; snapshot: IntegrationView['snapshot']; phase: RegistrationState;
  error: string; basePlan: BudgetPlan | null; scopeIds: string[] | undefined};
const blank = (wallet = ''): Resolved => ({wallet, snapshot: null, phase: 'unregistered', error: '', basePlan: null, scopeIds: undefined});

export default function RiderPage({integration}: {integration: IntegrationView}) {
  const wallet = integration.walletAddress;
  useEffect(() => { if (integration.mode !== 'connected') integration.setMode('connected'); }, [integration.mode, integration.setMode]);
  const [intent, setIntent] = useState<BudgetPlan | null>(() => wallet ? loadBudgetIntent(wallet) : null);
  const [failure, setFailure] = useState('');
  const [view, setView] = useState<'form' | 'dashboard'>('form');
  const [resolved, setResolved] = useState<Resolved>(() => blank());
  useEffect(() => { setIntent(wallet ? loadBudgetIntent(wallet) : null); setFailure(''); setView('form'); setResolved(blank(wallet)); }, [wallet]);
  useEffect(() => {
    let active = true;
    if (integration.status === 'error') { setResolved({...blank(wallet), phase: 'error', error: integration.error}); return; }
    if (integration.status !== 'ready' || !integration.snapshot) return;
    const snapshot = integration.snapshot;
    (async () => {
      const phase = await registrationFromSnapshot(snapshot, intent);
      const basePlan = intent && await budgetIsVerified(snapshot, intent) ? intent :
        await budgetIsVerified(snapshot, defaultBudgetPlan) ? defaultBudgetPlan : null;
      const scopeIds = basePlan ? (await matchingBudgetExpenses(snapshot, basePlan)).map(item => item.match!.address.toBase58()) : undefined;
      if (active) setResolved({wallet, snapshot, phase, error: '', basePlan, scopeIds});
    })().catch(reason => { if (active) setResolved({...blank(wallet), snapshot, phase: 'error', error: reason instanceof Error ? reason.message : 'Unable to verify the racing budget.'}); });
    return () => { active = false; };
  }, [wallet, integration.status, integration.snapshot, integration.error, intent]);
  const current = resolved.wallet === wallet && !!resolved.snapshot;
  const phase = current ? resolved.phase : 'unregistered';
  const accountUrl = current && integration.snapshot ? explorerAccountUrl(integration.snapshot.seasonAddress.toBase58(), integration.cluster) : null;
  if (view === 'dashboard' && wallet && integration.status === 'ready' && current && phase === 'registered') {
    return <Dashboard role="racer" integration={integration}
      scopedExpenseIds={resolved.scopeIds} onBackToRider={() => { setView('form'); integration.refresh(); }}/>;
  }
  return <main id="main" className="dashboard rider-registration">
    <RoleTabs active="racer"/>
    {wallet && integration.status === 'loading' && !current && <p className="input-help" role="status">Loading rider accounts…</p>}
    {integration.status === 'needs-wallet' && <p role="status">Connect your wallet to register your racing budget.</p>}
    {failure && <p className="form-error" role="alert">{failure} Review the draft and resume safely.</p>}
    {(phase === 'error' || integration.error) && <div className="form-error" role="alert">Could not refresh Rider accounts. {resolved.error || integration.error || 'Please try again.'} <button type="button" onClick={integration.refresh}>TRY AGAIN</button></div>}
    {integration.status === 'ready' && phase === 'partial' && <p className="rider-resume" role="status">Registration interrupted. Completed accounts will be checked before signing.</p>}
    {integration.status === 'ready' && current && phase === 'registered' && <div className="saved-feedback rider-registered" role="status">Rider registered successfully!</div>}
    {integration.status === 'ready' && current && phase === 'registered' && <button type="button" className="text-link" onClick={() => { integration.refresh(); setView('dashboard'); }}>EXPENSE DASHBOARD ↗</button>}
    {integration.status === 'ready' && phase === 'registered' && accountUrl && <details className="rider-account-details"><summary>Account details</summary><a href={accountUrl} target="_blank" rel="noopener noreferrer">View season account ↗</a></details>}
    <RacingBudget key={wallet || 'disconnected'} integration={integration}
      initialPlan={intent} basePlan={current ? resolved.basePlan : null} registered={current && phase === 'registered'}
      onIntent={plan => { if (wallet) saveBudgetIntent(wallet, plan); setIntent(plan); }}
      onRegistering={() => { setFailure(''); }} onFailure={setFailure} onComplete={() => setFailure('')}/>
  </main>;
}
