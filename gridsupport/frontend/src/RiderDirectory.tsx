import {ArrowUpRight, Check, RotateCcw} from 'lucide-react';
import type {DirectoryRider} from './chain/riderDirectory';

type Props = {
  riders: DirectoryRider[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string;
  selectedAddress: string;
  onSelect: (address: string) => void;
  onRefresh: () => void;
  disabled: boolean;
};

const euro = (cents: bigint) => {
  const whole = (cents / 100n).toLocaleString('en-IE');
  const fraction = cents % 100n;
  return `€${whole}${fraction ? `.${fraction.toString().padStart(2, '0')}` : ''}`;
};

export default function RiderDirectory({riders, status, error, selectedAddress, onSelect, onRefresh, disabled}: Props) {
  return <section className="rider-directory" aria-labelledby="rider-directory-title">
    <div className="rider-directory-head"><div><span className="eyebrow">FIND YOUR RIDER</span><h2 id="rider-directory-title">DISCOVER RIDERS.</h2>
      <p>Explore their racing season and choose who you want to support.</p></div>
      <button type="button" className="rider-directory-refresh" onClick={onRefresh} disabled={disabled || status === 'loading'} aria-label="Refresh riders"><RotateCcw size={13}/> Refresh</button></div>
    {status === 'loading' && <p className="rider-directory-state" role="status">Discovering riders…</p>}
    {status === 'error' && <div className="rider-directory-state" role="alert"><p>Riders could not be loaded. {error}</p><button type="button" onClick={onRefresh}>TRY AGAIN</button></div>}
    {status === 'ready' && !riders.length && <p className="rider-directory-state" role="status">No riders have registered on this network yet. Check back after a rider creates their racing budget.</p>}
    {riders.length > 0 && status !== 'error' && <div className="rider-directory-grid">{riders.map(entry => {
      const address = entry.rider.toBase58();
      const selected = selectedAddress === address;
      const season = entry.seasonTitle ? `${entry.seasonTitle}${/season/i.test(entry.seasonTitle) ? '' : ' Racing Season'}` : entry.snapshot.seasonExists ? 'Racing season' : 'Season coming soon';
      return <article className={'rider-directory-card' + (selected ? ' is-selected' : '')} key={entry.profileAddress.toBase58()}>
        <img src="/images/rider.jpg" alt="Illustrative motorcycle racing photograph"/>
        <div className="rider-directory-card-copy"><span className="eyebrow">{selected ? 'YOUR SELECTED RIDER' : 'READY FOR THE GRID'}</span><h3>{entry.displayName}</h3>
          <p className="rider-directory-season">{season}</p>
          <strong className="rider-directory-needs">{entry.expenseCount} Sponsorship Need{entry.expenseCount === 1 ? '' : 's'}</strong>
          {entry.seasonBudgetCents !== null && <small>Racing budget {euro(entry.seasonBudgetCents)} · In-kind support {euro(entry.merchantCoverageCents)}</small>}
          <details><summary>Rider wallet</summary><small className="chain-address">{address}</small></details>
          <button type="button" aria-pressed={selected} disabled={disabled} onClick={() => onSelect(address)}>{selected ? <><Check size={14}/> Selected Rider</> : <>View Racing Needs <ArrowUpRight size={14}/></>}</button>
        </div>
      </article>;
    })}</div>}
    <p className="rider-directory-note">Names and readable titles appear when saved in this browser. Rider accounts and amounts come from Solana.</p>
  </section>;
}
