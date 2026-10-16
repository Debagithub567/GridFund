import {motion,useReducedMotion} from 'framer-motion';
import {Check,ExternalLink,LoaderCircle,TriangleAlert} from 'lucide-react';
import Modal from './Modal';
import {money} from './model';
import {explorerTransactionUrl} from './chain/explorer';
import type {GridCluster} from './chain/config';

export type TransactionResult = {
  type: 'merchant' | 'fan' | 'profile' | 'season' | 'expense';
  expenseId: string;
  expenseTitle: string;
  amountCents: number;
  status: 'pending' | 'awaiting-wallet' | 'submitted' | 'confirming' | 'confirmed' | 'error';
  signature?: string;
  cluster: GridCluster | 'testnet' | 'mainnet-beta';
  endpoint?: string;
  accountAddress?: string;
  errorMessage?: string;
};

export default function TransactionResultModal({result,onClose}:{result:TransactionResult;onClose:()=>void}) {
  const reduce=useReducedMotion();
  const success=result.status==='confirmed';
  const rider=['profile','season','expense'].includes(result.type);
  const url=result.signature ? explorerTransactionUrl(result.signature,result.cluster,result.endpoint) : null;
  const label=result.type==='profile'?'RIDER PROFILE':result.type==='season'?'RIDER SEASON':result.type==='expense'?'RIDER EXPENSE':result.type==='merchant'?'SHOP SPONSORSHIP':'FAN CONTRIBUTION';
  const message=result.status==='awaiting-wallet'?'Approve this transaction in your wallet.':result.status==='submitted'?'Transaction submitted to Solana.':result.status==='confirming'?'Waiting for confirmation and checking the new account…':result.status==='pending'?'Preparing your support…':'';
  return <Modal onClose={onClose} titleId="transaction-title" className="transaction-modal">
    <motion.div key={result.status} className={'result-seal '+result.status} initial={{scale:reduce?1:.8,opacity:0}} animate={{scale:1,opacity:1}} transition={{duration:reduce?0:.3}}>{success?<Check size={35}/>:result.status==='error'?<TriangleAlert size={35}/>:<LoaderCircle className="spinning" size={35}/>}</motion.div>
    <div className="eyebrow">{label}</div>
    <h2 id="transaction-title">{success?rider?'Congratulations! 🏁':result.type==='merchant'?'Congratulations! 🎉':"You're part of the journey! 🏁":result.status==='error'?'Let’s try again.':result.status==='awaiting-wallet'?'YOUR APPROVAL IS NEEDED.':'One step closer.'}</h2>
    <p>{success?rider?`${result.expenseTitle} is confirmed on Solana and your dashboard has been refreshed.`:result.type==='merchant'?'Your sponsorship has helped a talented rider get one step closer to the starting grid.':'Your contribution brings this rider one step closer to racing.':result.status==='error'?result.errorMessage||'The transaction could not be confirmed.':message}</p>
    <dl className="result-details"><div><dt>{rider?'Created':'Expense'}</dt><dd>{result.expenseTitle}</dd></div>{result.type!=='profile'&&<div><dt>{result.type==='merchant'?'In-kind sponsorship value':result.type==='fan'?'Fan contribution':result.type==='season'?'Season budget':'Expense amount'}</dt><dd>{money(result.amountCents)}</dd></div>}{result.accountAddress&&<div><dt>Account</dt><dd className="chain-address">{result.accountAddress}</dd></div>}<div><dt>Status</dt><dd className={success?'lime-text':''}>{success?'Confirmed':result.status==='error'?'Failed or rejected':result.status==='awaiting-wallet'?'Awaiting wallet approval':result.status==='submitted'?'Submitted':result.status==='confirming'?'Confirming on-chain':'Processing'}</dd></div><div><dt>Network</dt><dd>Solana {result.cluster==='devnet'?'Devnet':result.cluster}</dd></div>{result.signature&&<div><dt>Signature</dt><dd className="chain-address">{result.signature}</dd></div>}</dl>
    {url?<a className="cta result-explorer" href={url} target="_blank" rel="noopener noreferrer">VIEW ON SOLANA EXPLORER <ExternalLink size={15}/></a>:<button type="button" className="cta outline result-explorer" disabled>VIEW ON SOLANA EXPLORER <ExternalLink size={15}/></button>}
    <button type="button" className="text-link result-done" onClick={onClose}>BACK TO THE GRID <Check size={15}/></button>
  </Modal>;
}
