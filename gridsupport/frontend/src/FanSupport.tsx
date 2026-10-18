import {useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {ArrowUpRight, Check, LoaderCircle} from 'lucide-react';
import type {IntegrationView} from './chain/useConnectedData';
import {explorerTransactionUrl} from './chain/explorer';
import {riderError} from './chain/riderTransactions';
import {money, parseAmount, totals} from './model';

export default function FanSupport({integration}: {integration: IntegrationView}) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [signature, setSignature] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const state = integration.state;
  const expenses = state?.expenses || [];
  const selected = expenses.find(item => item.id === state?.selectedExpenseId) || expenses[0];
  const remaining = selected && state ? totals(state, selected.id).remaining : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current || integration.writing) return;
    locked.current = true;
    try {
      if (!integration.walletAddress) throw new Error('Connect your Fan wallet to support this rider.');
      if (integration.status !== 'ready' || integration.directoryStatus !== 'ready' || !selected)
        throw new Error('Select a registered Rider and one of their verified expenses.');
      const cents = parseAmount(amount);
      if (cents > remaining) throw new Error(`Only ${money(remaining)} remains for ${selected.title}.`);
      setBusy(true); setError(''); setConfirmed(false); setSignature('');
      const result = await integration.runMerchantAction(selected.id, cents, progress => {
        setStage(progress.stage.replace('-', ' '));
        if (progress.signature) setSignature(progress.signature);
      });
      setSignature(result.signature);
      setStage('confirmed');
      setConfirmed(true);
      setAmount('');
    } catch (reason) {
      setConfirmed(false);
      setError(riderError(reason).replace('merchant sponsorship', 'expense support'));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const transactionUrl = signature ? explorerTransactionUrl(signature, integration.cluster) : null;
  return <div className="fan-support">
    <div className="panel-label">FAN / SUPPORT A RACING EXPENSE</div>
    {!selected && <p className="input-help" role="status">Select a Rider above to view verified racing expenses.</p>}
    <form className="support-form" onSubmit={submit}>
      <label className="field-label" htmlFor="fan-expense">01 / CHOOSE A RIDER EXPENSE</label>
      <select id="fan-expense" className="gs-input" value={selected?.id || ''} disabled={!expenses.length || busy}
        onChange={event => { integration.selectExpense(event.target.value); setError(''); setConfirmed(false); setSignature(''); }}>
        {expenses.map(expense => <option key={expense.id} value={expense.id}>
          {expense.title} — {money(totals(state!, expense.id).remaining)} remaining
        </option>)}
      </select>
      {selected && <div className="selected-support-overview"><img src={`/images/${selected.image}.jpg`} alt=""/>
        <div><span>VERIFIED RIDER EXPENSE</span><h3>{selected.title}</h3>
          <p>{money(remaining)} remaining of {money(selected.requiredCents)}</p></div></div>}
      <label className="field-label" htmlFor="fan-support-amount">02 / SUPPORT AMOUNT IN EUR</label>
      <div className="gs-money-input"><span>€</span><input id="fan-support-amount" inputMode="decimal" placeholder="Enter amount"
        value={amount} onChange={event => { setAmount(event.target.value); setError(''); }}
        disabled={busy || !remaining} required/><small>EUR</small></div>
      <p className="input-help">{remaining ? `Choose any amount up to ${money(remaining)}.` : 'This expense is fully covered. Select another expense.'}</p>
      <p className="input-help">Your wallet signs an expense sponsorship. This records support in EUR cents; it does not transfer tokens or verify delivery of goods or services.</p>
      {stage && busy && <p role="status">{stage}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="cta support-confirm" type="submit" disabled={busy || integration.writing || !integration.walletAddress ||
        integration.status !== 'ready' || integration.directoryStatus !== 'ready' || !remaining}>
        {busy ? <><LoaderCircle className="spinning" size={17}/> VERIFYING SUPPORT…</> : <>SUPPORT RIDER <ArrowUpRight size={17}/></>}
      </button>
    </form>
    {confirmed && <div className="saved-feedback fan-support-success" role="status"><Check size={17}/>
      <span>Thanks for supporting my racing! Your expense sponsorship is verified.</span>
      {transactionUrl && <a href={transactionUrl} target="_blank" rel="noopener noreferrer">View on Solana Explorer ↗</a>}
      {!transactionUrl && signature && <code>{signature}</code>}
    </div>}
    {!confirmed && signature && error && <p className="input-help">Transaction signature: <code>{signature}</code>{transactionUrl && <a href={transactionUrl} target="_blank" rel="noopener noreferrer"> View transaction ↗</a>}</p>}
  </div>;
}
