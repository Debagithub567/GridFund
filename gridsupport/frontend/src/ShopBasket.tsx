import {useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {Check, LoaderCircle, Store} from 'lucide-react';
import {money, parseAmount, totals} from './model';
import type {IntegrationView} from './chain/useConnectedData';
import {riderError} from './chain/riderTransactions';
import {explorerTransactionUrl} from './chain/explorer';
import {endpoint} from './chain/config';

type Verified = {expenseId: string; title: string; cents: number; signature: string};
export default function ShopBasket({integration}: {integration: IntegrationView}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [verified, setVerified] = useState<Verified[]>([]);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const state = integration.state;
  const expenses = state?.expenses || [];
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (locked.current || integration.writing) return;
    try {
      const selected = expenses.filter(item => chosen[item.id]);
      if (!selected.length) throw new Error('Select at least one rider expense.');
      const requests = selected.map(item => {
        const cents = parseAmount(drafts[item.id] || '');
        if (cents > totals(state!, item.id).remaining) throw new Error(`Only ${money(totals(state!, item.id).remaining)} remains for ${item.title}.`);
        return {item, cents};
      });
      locked.current = true; setBusy(true); setError('');
      for (let index = 0; index < requests.length; index++) {
        const {item, cents} = requests[index];
        setStage(`${index + 1} of ${requests.length}: ${item.title} — awaiting wallet`);
        const result = await integration.runMerchantAction(item.id, cents, progress => setStage(
          `${index + 1} of ${requests.length}: ${item.title} — ${progress.stage.replace('-', ' ')}`));
        setVerified(previous => [...previous, {expenseId: item.id, title: item.title, cents, signature: result.signature}]);
        setChosen(previous => ({...previous, [item.id]: false}));
        setStage(`${index + 1} of ${requests.length}: ${item.title} — confirmed and verified`);
      }
    } catch (reason) { setError(riderError(reason)); integration.refresh(); }
    finally { locked.current = false; setBusy(false); }
  };
  return <section className="shop-basket" aria-labelledby="shop-basket-title"><div className="eyebrow">SHOPKEEPER / IN-KIND SUPPORT</div>
    <h2 id="shop-basket-title">CHOOSE YOUR COMMITMENTS.</h2><p>Select one or more expenses. Each commitment is a separate signed transaction and is verified independently.</p>
    <form onSubmit={submit}><div className="shop-basket-lines">{expenses.map(item => {
      const remaining = totals(state!, item.id).remaining;
      return <label key={item.id} className="shop-basket-line"><input type="checkbox" checked={!!chosen[item.id]} disabled={busy || !remaining} onChange={event => setChosen(current => ({...current, [item.id]: event.target.checked}))}/>
        <span><strong>{item.title}</strong><small>{money(remaining)} remaining in-kind coverage</small></span>
        <span className="gs-money-input"><span>€</span><input aria-label={`${item.title} in-kind amount in EUR`} inputMode="decimal" value={drafts[item.id] ?? (item.title === 'Accommodation & food' ? '50' : '')} disabled={busy || !remaining} onChange={event => setDrafts(current => ({...current, [item.id]: event.target.value}))}/></span></label>;
    })}</div><p className="input-help">In-kind commitments are recorded in EUR cents. No funds move, and fulfillment is not verified.</p>
    {stage && <p role="status">{stage}</p>}{error && <p className="form-error" role="alert">{error} Any listed verified commitments remain on-chain. Refresh before retrying unfinished items.</p>}
    <button className="cta" type="submit" disabled={busy || integration.writing || integration.status !== 'ready' || !integration.walletAddress || !expenses.length}>{busy ? <><LoaderCircle className="spinning" size={17}/> VERIFYING COMMITMENTS…</> : <><Store size={17}/> RECORD SELECTED SUPPORT</>}</button></form>
    {verified.length > 0 && <div className="shop-basket-confirmation" role="status"><Check size={25}/><h3>Thanks for supporting my racing! 🏁</h3><p>Every bit of support brings me closer to the starting grid.</p>
      <p>Recipient: {integration.riderName || `Rider ${integration.snapshot?.rider.toBase58() || ''}`} · {verified.length} confirmed and verified in-kind commitment{verified.length === 1 ? '' : 's'}</p>
      <ul>{verified.map(item => <li key={item.signature}>{item.title} — {money(item.cents)} in-kind · verified<br/><code>{item.signature}</code>
        {integration.cluster === 'devnet' && <a href={explorerTransactionUrl(item.signature, 'devnet', endpoint) || '#'} target="_blank" rel="noopener noreferrer">View on Solana Explorer</a>}
        {integration.cluster === 'localnet' && <button type="button" onClick={() => navigator.clipboard?.writeText(item.signature)}>Copy signature</button>}</li>)}</ul></div>}
  </section>;
}
