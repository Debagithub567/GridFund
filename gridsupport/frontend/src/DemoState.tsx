import {createContext,useContext,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {addContribution,addExpense,editExpense,initialState,restoreState,STORAGE_KEY} from './model';
import type {Contribution,DemoState,Expense} from './model';
type Store={state:DemoState;createExpense:(expense:Omit<Expense,'id'>)=>void;updateExpense:(expense:Expense)=>void;supportExpense:(expenseId:string,amountCents:number,type:'merchant'|'fan')=>Contribution;selectExpense:(id:string)=>void;reset:()=>void;storageWarning:boolean};
const Context=createContext<Store|null>(null);
export function DemoProvider({children}:{children:ReactNode}){const [state,setState]=useState<DemoState>(()=>{try{return restoreState(localStorage.getItem(STORAGE_KEY))}catch{return initialState()}});const [storageWarning,setStorageWarning]=useState(false);const current=useRef(state);const update=(next:DemoState)=>{current.current=next;setState(next)};
useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));setStorageWarning(false)}catch{setStorageWarning(true)}},[state]);
useEffect(()=>{const listener=(e:StorageEvent)=>{if(e.key===STORAGE_KEY)update(restoreState(e.newValue))};window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener)},[]);
const value:Store={state,storageWarning,createExpense:e=>update(addExpense(current.current,{...e,id:crypto.randomUUID()})),updateExpense:e=>update(editExpense(current.current,e)),supportExpense:(expenseId,amountCents,type)=>{const contribution:Contribution={id:crypto.randomUUID(),expenseId,amountCents,type,support:type==='merchant'?'in-kind':'monetary',createdAt:new Date().toISOString()};update(addContribution(current.current,contribution));return contribution},selectExpense:id=>{if(current.current.expenses.some(e=>e.id===id))update({...current.current,selectedExpenseId:id})},reset:()=>update(initialState())};return <Context.Provider value={value}>{children}</Context.Provider>}
export function useDemo(){const value=useContext(Context);if(!value)throw new Error('DemoProvider is missing');return value}
