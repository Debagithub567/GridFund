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
    <div className="rider-directory-head"><div><span className="eyebrow">ON-CHAIN RIDER PROFILES</span><h2 id="rider-directory-title">BROWSE RIDERS.</h2>
      <p>Select a rider to load their current race needs. Profiles and amounts come from the connected Solana program.</p></div>
      <button type="button" className="rider-directory-refresh" onClick={onRefresh} disabled={disabled || status === 'loading'}>REFRESH RIDERS</button></div>
    {status === 'loading' && <p className="rider-directory-state" role="status">Finding rider profiles on this network…</p>}
    {status === 'error' && <div className="rider-directory-state" role="alert"><p>Rider discovery failed: {error}</p><button type="button" onClick={onRefresh}>TRY AGAIN</button></div>}
    {status === 'ready' && !riders.length && <p className="rider-directory-state" role="status">No on-chain RiderProfiles exist on this network yet. A rider can create one from the Rider dashboard.</p>}
    {riders.length > 0 && status !== 'error' && <div className="rider-directory-grid">{riders.map(entry => {
      const address = entry.rider.toBase58();
      const selected = selectedAddress === address;
      return <article className={'rider-directory-card' + (selected ? ' is-selected' : '')} key={entry.profileAddress.toBase58()}>
        <img src="/images/rider.jpg" alt="Illustrative motorcycle racing photograph"/>
        <div className="rider-directory-card-copy"><span className="eyebrow">{entry.displayName}</span><h3>{entry.seasonTitle || (entry.snapshot.seasonExists ? 'Season #1' : 'Season not created')}</h3>
          <small className="chain-address">Rider wallet: {address}</small>
          <div className="rider-directory-metrics"><span>{entry.expenseCount} listed expense{entry.expenseCount === 1 ? '' : 's'}</span>
            <span>Season budget {entry.seasonBudgetCents === null ? '—' : euro(entry.seasonBudgetCents)}</span>
            <span>Merchant committed {euro(entry.merchantCoverageCents)}</span>
            <span>Merchant remaining {euro(entry.remainingCoverageCents)}</span></div>
          <button type="button" aria-pressed={selected} disabled={disabled} onClick={() => onSelect(address)}>{selected ? 'SELECTED RIDER' : 'SELECT RIDER'}</button>
        </div>
      </article>;
    })}</div>}
  </section>;
}
