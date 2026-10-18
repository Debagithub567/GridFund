import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
const output=path.resolve('.impact-test-build');
await fs.mkdir(output,{recursive:true});
await fs.mkdir(path.join(output,'chain'),{recursive:true});
await fs.writeFile(path.join(output,'chain/categories.mjs'),"export const expenseCategories=[{value:0,label:'General race need'}];\n");
await fs.writeFile(path.join(output,'chain/config.mjs'),"export const endpoint='http://127.0.0.1:8899';export const demoEnabled=false;\n");
await fs.writeFile(path.join(output,'chain/riderTransactions.mjs'),"export const riderError=error=>String(error);\n");
await fs.writeFile(path.join(output,'chain/registration.mjs'),"export const loadBudgetIntent=()=>null;export const saveBudgetIntent=()=>{};export const registrationFromSnapshot=async()=>globalThis.__registrationPhase;export const defaultBudgetPlan={name:'Pol Espargaró',season:'2026',expenses:[{title:'Racing tyres',description:'Racing tyres',amountCents:50000,category:1},{title:'Fuel & travel',description:'Fuel & travel',amountCents:30000,category:2},{title:'Accommodation & food',description:'Accommodation & food',amountCents:20000,category:4}]};\n");
await fs.writeFile(path.join(output,'chain/budget.mjs'),"export const budgetIsVerified=async()=>globalThis.__registrationPhase==='registered';export const matchingBudgetExpenses=async()=>[{match:{address:{toBase58:()=> '11111111111111111111111111111111'}}}];\n");
await fs.writeFile(path.join(output,'chain/funding.mjs'),"export const fundingTotals=()=>({requiredCents:100000,merchantCents:10000,fanCents:0,fanUnits:0n,remainingCents:90000,progress:10,extraCents:0,extraCount:0});\n");
await fs.writeFile(path.join(output,'chain/fanTransactions.mjs'),"export const approvedMockMint={};export const parseMockUsdc=value=>BigInt(value)*1000000n;export const formatMockUsdc=value=>String(value/1000000n)+' gsUSDC';\n");
const explorerSource=await fs.readFile('src/chain/explorer.ts','utf8');
await fs.writeFile(path.join(output,'chain/explorer.mjs'),ts.transpileModule(explorerSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
for(const name of ['model','DemoState','Dashboard','RiderPage','RoleTabs','RiderDirectory','RacingBudget','ShopBasket','FanSupport','Modal','TransactionResultModal','CommunityImpact']){
 const source=await fs.readFile(`src/${name}.ts${name==='model'?'':'x'}`,'utf8');
 let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 code=code.replace(/import ['"]\.\/[^'"]+\.css['"];?/g,'').replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from './${name}.mjs'`);
 await fs.writeFile(path.join(output,name+'.mjs'),code);
}
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://example.test/racer',pretendToBeVisual:true});
for(const name of ['location','window','document','HTMLElement','HTMLDialogElement','HTMLVideoElement','Element','SVGElement','Node','MutationObserver','localStorage'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
window.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
window.scrollTo=()=>{};
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.fetch=async()=>({ok:true,headers:{get:()=> 'text/html'}});
let opens=0;
HTMLDialogElement.prototype.showModal=function(){opens++;this.setAttribute('open','')};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
let time=performance.now();let nextFrame=0;const frames=new Map();
globalThis.requestAnimationFrame=window.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame};
globalThis.cancelAnimationFrame=window.cancelAnimationFrame=id=>frames.delete(id);
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
const {MotionConfig}=await import('framer-motion');
const {DemoProvider}=await import('../.impact-test-build/DemoState.mjs');
const {default:Dashboard}=await import('../.impact-test-build/Dashboard.mjs');
const {default:RiderPage}=await import('../.impact-test-build/RiderPage.mjs');
const {initialState,addExpense,addContribution,STORAGE_KEY}=await import('../.impact-test-build/model.mjs');
async function tick(delta=34){time+=delta;await act(async()=>{const tasks=[...frames.values()];frames.clear();for(const task of tasks)task(time)});}
const root=createRoot(document.getElementById('root'));
test('click Community Impact opens its dialog and progresses without changing saved support',async()=>{
 let state=addExpense(initialState(),{id:'presentation',title:'Test tyres',requiredCents:100000,description:'',image:'tyres'});
 state=addContribution(state,{id:'shop',expenseId:'presentation',amountCents:10000,type:'merchant',support:'in-kind',createdAt:'2026-10-16'});
 state=addContribution(state,{id:'fan',expenseId:'presentation',amountCents:2000,type:'fan',support:'monetary',createdAt:'2026-10-16'});
 localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
 await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(MotionConfig,{skipAnimations:true},React.createElement(DemoProvider,null,React.createElement(Dashboard,{role:'racer'}))))));
 const button=document.querySelector('.impact-launch-button');assert.ok(button,'launch button exists');
 try{await act(async()=>button.click());
 const dialog=document.querySelector('.impact-modal');assert.ok(dialog,'impact dialog mounts');assert.ok(dialog.open,'impact dialog opens');
 assert.notEqual(dialog.style.opacity,'0','opening frame is visible');
 for(let i=0;i<20;i++)await tick(34);

 assert.ok(Number.parseInt(document.querySelector('.impact-percent').textContent)>12,'coverage advances beyond starting 12%');
 assert.equal(localStorage.getItem(STORAGE_KEY),JSON.stringify(state),'sequence does not mutate support');
 const replay=[...document.querySelectorAll('.impact-actions button')].find(b=>b.textContent.includes('Replay'));
 await act(async()=>replay.click());assert.equal(document.querySelector('.impact-percent').textContent,'12%');
 for(let i=0;i<370;i++)await tick(34);
 assert.equal(document.querySelector('.impact-percent').textContent,'100%','full animation reaches completion');
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1150))});
 assert.ok(document.querySelector('.victory-screen'),'completion opens victory celebration');
 assert.ok(document.querySelector('.video-placeholder-label'),'missing MP4 shows a designed placeholder');
 await act(async()=>[...document.querySelectorAll('.victory-controls button')].find(button=>button.textContent.includes('Skip film')).click());
 assert.match(document.querySelector('.victory-screen').textContent,/EVERY RIDER DESERVES A CHANCE/);
 assert.match(document.querySelector('.victory-screen').textContent,/THANK YOU 🏁/);
 assert.ok([...document.querySelectorAll('.victory-controls button')].some(button=>button.textContent.includes('Back to dashboard')));
 const replayCommunity=[...document.querySelectorAll('.victory-controls button')].find(b=>b.textContent.includes('Replay community'));
 await act(async()=>replayCommunity.click());assert.equal(document.querySelector('.impact-percent').textContent,'12%');
 const skip=[...document.querySelectorAll('.impact-actions button')].find(b=>b.textContent.includes('Skip'));
 await act(async()=>skip.click());assert.equal(document.querySelector('.impact-percent').textContent,'100%');
 assert.equal(localStorage.getItem(STORAGE_KEY),JSON.stringify(state),'full sequence and replay preserve support');
 await act(async()=>document.querySelector('.gs-modal-close').click());
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350))});for(let i=0;i<20;i++)await tick();
 assert.ok(!document.querySelector('.impact-modal'),'close removes the dialog');

 const renderDashboard=async(role,integration)=>act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(MotionConfig,{skipAnimations:true},React.createElement(DemoProvider,null,React.createElement(Dashboard,{role,integration}))))));
 await renderDashboard('shop');
 assert.ok(document.querySelector('.support-form'),'Shop demo support form remains available');
 assert.deepEqual([...document.querySelectorAll('.dash-tabs a')].map(link=>link.getAttribute('href')),['/racer','/shop','/fan']);
 assert.equal(document.querySelector('.dash-tabs a[aria-current=page]').getAttribute('href'),'/shop');
 assert.match(document.querySelector('.dash-top').textContent,/FRONTEND PREVIEW/);
 assert.equal(document.querySelector('.support-confirm').disabled,false);
 await renderDashboard('fan');
 assert.ok(document.querySelector('.support-form'),'Fan demo support form remains available');
 assert.match(document.querySelector('.support-confirm').textContent,/CONTRIBUTE/);
 assert.equal(document.querySelector('.support-confirm').disabled,false);

 const wallet='11111111111111111111111111111111';
 const integration={mode:'connected',setMode(){},cluster:'localnet',state:{version:1,expenses:[],contributions:[],selectedExpenseId:''},
  snapshot:{rider:{toBase58:()=>wallet},seasonAddress:{toBase58:()=>wallet},profileExists:false,seasonExists:false,expenses:[]},status:'ready',error:'',walletAddress:wallet,
  directory:[],directoryStatus:'ready',directoryError:'',selectedRiderAddress:'',selectRider(){},refreshDirectory(){},
  selectedExpenseId:'',selectExpense(){},refresh(){},writing:false,
  runBudgetPlan:async()=>{},
  runRiderAction:async()=>{},
 };
 await renderDashboard('racer',integration);
 assert.equal(document.querySelector('.chain-status'),null,'Rider technical panel is removed');
 assert.equal(document.querySelector('.combined-progress'),null,'Combined progress is removed');
 assert.equal(document.querySelector('.add-expense'),null,'Registered Rider has no duplicate Add Expense control');
 await renderDashboard('shop',integration);
 assert.match(document.querySelector('.rider-directory').textContent,/No riders have registered/);
 assert.equal(document.querySelector('.chain-status'),null,'Shop has no large technical account panel');
 assert.equal(document.querySelector('.mode-switch'),null,'judge view hides the Demo switch');
 await renderDashboard('shop',{...integration,directoryStatus:'error',directoryError:'RPC unavailable'});
 assert.match(document.querySelector('.rider-directory [role=alert]').textContent,/RPC unavailable/);
 await renderDashboard('fan',integration);
 assert.equal(document.querySelector('.support-confirm').disabled,true,'Connected Fan writes remain gated');
 assert.equal(document.querySelector('.chain-status'),null,'Fan has no large technical account panel');
 const chainExpense={id:'chain-expense',title:'Circuit tyres',requiredCents:50000,description:'Tyres',image:'tyres',onChain:true,committedCoverageCents:10000,sponsorshipCount:1};
 let resolveSponsorship;let sponsorshipCalls=0;
 const shopIntegration={...integration,state:{version:1,expenses:[chainExpense],contributions:[],selectedExpenseId:chainExpense.id},
  snapshot:{...integration.snapshot,profileExists:true,seasonExists:true,seasonBudgetCents:50000n,seasonStatus:1},
  runMerchantAction:()=>{sponsorshipCalls++;return new Promise(resolve=>{resolveSponsorship=resolve})}};
 let selectedRider='';
 const firstRider={rider:{toBase58:()=>wallet},profileAddress:{toBase58:()=>wallet},displayName:'Rider #1',seasonTitle:null,
  snapshot:shopIntegration.snapshot,expenseCount:1,seasonBudgetCents:50000n,merchantCoverageCents:10000n,remainingCoverageCents:40000n};
 shopIntegration.directory=[firstRider];shopIntegration.selectRider=address=>{selectedRider=address};
 await renderDashboard('shop',{...shopIntegration,walletAddress:''});
 assert.equal(document.querySelector('.shop-basket .cta').disabled,true,'missing merchant wallet blocks Connected Shop submission');
 await renderDashboard('shop',shopIntegration);
 assert.equal(document.querySelectorAll('.rider-directory-card').length,1);
 await act(async()=>document.querySelector('.rider-directory-card button').click());
 assert.equal(selectedRider,wallet);
 const secondAddress='22222222222222222222222222222222';
 const secondRider={...firstRider,rider:{toBase58:()=>secondAddress},profileAddress:{toBase58:()=>secondAddress},displayName:'Rider #2',expenseCount:0,
  seasonBudgetCents:null,merchantCoverageCents:0n,remainingCoverageCents:0n,snapshot:{...firstRider.snapshot,seasonExists:false}};
 await renderDashboard('shop',{...shopIntegration,directory:[firstRider,secondRider]});
 assert.equal(document.querySelectorAll('.rider-directory-card').length,2);
 await renderDashboard('shop',shopIntegration);
 const shopAmount=document.querySelector('.shop-basket-line input[inputmode=decimal]');
 await act(async()=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(shopAmount,'50');shopAmount.dispatchEvent(new window.Event('input',{bubbles:true}));document.querySelector('.shop-basket-line input[type=checkbox]').click()});
 const record=document.querySelector('.shop-basket .cta');
 await act(async()=>{record.click();record.click()});
 assert.equal(sponsorshipCalls,1,'duplicate clicks submit only one sponsorship');
 assert.equal(document.querySelector('.shop-basket .cta').disabled,true,'pending sponsorship disables submission');
 await act(async()=>resolveSponsorship({signature:'2'.repeat(88),address:{toBase58:()=>wallet}}));
 assert.match(document.querySelector('.shop-basket-confirmation').textContent,/Thanks for supporting my racing/);
 assert.match(document.querySelector('.shop-basket-confirmation').textContent,/€50/);
 assert.match(document.querySelector('.shop-basket-confirmation').textContent,/Copy signature/);
 const updatedExpense={...chainExpense,committedCoverageCents:20000,sponsorshipCount:2};
 const confirmedView={...shopIntegration,state:{...shopIntegration.state,expenses:[updatedExpense]}};
 await renderDashboard('racer',confirmedView);
 assert.match(document.querySelector('.dash-summary').textContent,/€200/,'Rider reads the same confirmed coverage');
 const progressView={...confirmedView,state:{...confirmedView.state,expenses:[{...updatedExpense,committedCoverageCents:5000}]},
  snapshot:{...confirmedView.snapshot,seasonBudgetCents:100000n},fanReceipts:[{amount:'50000000'}]};
 await renderDashboard('racer',progressView);
 assert.equal(document.querySelector('.combined-progress'),null);
 await renderDashboard('shop',{...confirmedView,state:{...confirmedView.state,expenses:[{...updatedExpense,committedCoverageCents:50000}]}});
 assert.equal(document.querySelector('.shop-basket-line input[type=checkbox]').disabled,true,'fully covered on-chain expense cannot be sponsored');
 const fuelExpense={...chainExpense,id:'fuel-expense',title:'Fuel & travel',requiredCents:30000,committedCoverageCents:0,sponsorshipCount:0};
 const partialCalls=[];
 const partialIntegration={...shopIntegration,selectedRiderAddress:'partial',state:{...shopIntegration.state,expenses:[chainExpense,fuelExpense]},
  runMerchantAction:async(id,cents)=>{partialCalls.push([id,cents]);if(partialCalls.length===2)throw new Error('User rejected the request');return {signature:'3'.repeat(88),address:{toBase58:()=>wallet}}}};
 await renderDashboard('shop',partialIntegration);
 const basketLines=[...document.querySelectorAll('.shop-basket-line')];
 for(const [index,line] of basketLines.entries()){
  await act(async()=>line.querySelector('input[type=checkbox]').click());
  await act(async()=>{const input=line.querySelector('input[inputmode=decimal]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,index?'20':'10');input.dispatchEvent(new window.Event('input',{bubbles:true}))});
 }
 await act(async()=>document.querySelector('.shop-basket .cta').click());
 assert.deepEqual(partialCalls,[[chainExpense.id,1000],[fuelExpense.id,2000]]);
 assert.match(document.querySelector('.shop-basket-confirmation').textContent,/€10/,'first verified commitment stays visible');
 assert.match(document.querySelector('.shop-basket [role=alert]').textContent,/rejected/i,'later rejection is reported');
 let resolveFan;let fanCalls=0;const fanRequests=[];
 const fanIntegration={...confirmedView,cluster:'devnet',runMerchantAction:(id,cents,onProgress)=>{
   fanCalls++;fanRequests.push([id,cents]);onProgress({stage:'awaiting-wallet'});
   return new Promise(resolve=>{resolveFan=resolve})}};
 await renderDashboard('fan',fanIntegration);
 assert.equal(document.querySelector('.dash-tabs a[aria-current=page]').getAttribute('href'),'/fan');
 assert.ok(document.querySelector('.rider-directory-card'),'Fan discovers registered Riders');
 assert.equal(document.querySelector('#fan-expense').value,chainExpense.id,'Fan selects a verified expense');
 assert.equal(document.querySelector('.support-confirm').disabled,false);
 assert.equal(document.querySelector('.fan-support-success'),null,'Fan success waits for verification');
 assert.equal(document.querySelector('a[href*="explorer.solana.com/tx"]'),null);
 assert.equal(document.querySelector('.fan-support').textContent.includes('SET UP FAN TOKEN ACCOUNT'),false);
 assert.doesNotMatch(document.querySelector('.refined-dashboard').textContent,/gsUSDC|token account|Direct fan tokens/i);
 await act(async()=>{const input=document.querySelector('#fan-support-amount');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,'50');input.dispatchEvent(new window.Event('input',{bubbles:true}))});
 await act(async()=>{document.querySelector('.support-confirm').click();document.querySelector('.support-confirm').click()});
 assert.equal(fanCalls,1,'duplicate Fan clicks submit one sponsorship');
 assert.deepEqual(fanRequests,[[chainExpense.id,5000]],'Fan uses selected expense and exact EUR cents');
 assert.equal(document.querySelector('.support-confirm').disabled,true);
 assert.equal(document.querySelector('.fan-support-success'),null,'wallet approval alone is not success');
 await act(async()=>resolveFan({signature:'2'.repeat(88),address:{toBase58:()=>wallet}}));
 assert.match(document.querySelector('.fan-support-success').textContent,/verified/);
 assert.match(document.querySelector('.fan-support-success a').getAttribute('href'),/explorer\.solana\.com\/tx\/2+\?cluster=devnet/);
 assert.equal(localStorage.getItem(STORAGE_KEY),JSON.stringify(state),'switching dashboards and modes preserves Demo data');
 globalThis.__registrationPhase='unregistered';
 const renderRiderPage=async view=>act(async()=>{root.render(React.createElement(DemoProvider,null,React.createElement(RiderPage,{integration:view})));await Promise.resolve()});
 await renderRiderPage(integration);
 assert.ok(document.querySelector('.racing-budget'),'unregistered rider sees registration card');
 assert.equal(document.querySelector('.dash-layout'),null,'draft defaults do not appear as a registered dashboard');
 assert.equal(document.querySelector('.racing-budget input').value,'Pol Espargaró');
 assert.equal(document.querySelectorAll('.budget-expense').length,3);
 await act(async()=>document.querySelector('.budget-add').click());
 assert.equal(document.querySelectorAll('.budget-expense').length,4,'registration has one add expense control');
 await act(async()=>[...document.querySelectorAll('.budget-remove')].at(-1).click());
 let resolveRegistration;let registrationCalls=0;
 await renderRiderPage({...integration,runBudgetPlan:()=>{registrationCalls++;return new Promise(resolve=>{resolveRegistration=resolve})}});
 await act(async()=>document.querySelector('.racing-budget .cta').click());
 assert.equal(registrationCalls,1,'new Rider invokes the real budget transaction adapter once');
 assert.equal(document.querySelector('.rider-registered'),null,'submission alone does not claim registration');
 await act(async()=>resolveRegistration());
 assert.equal(document.querySelector('.rider-registered'),null,'success waits for verified account state');
 globalThis.__registrationPhase='registered';
 await renderRiderPage(confirmedView);
 assert.ok(document.querySelector('.racing-budget'),'registered rider keeps form first');
 assert.equal(document.querySelector('.dash-layout'),null);
 assert.equal(document.querySelectorAll('.rider-registered').length,1,'existing Rider has one compact success state');
 assert.equal(document.querySelector('.rider-registered').textContent,'Rider registered successfully!');
 assert.equal(document.querySelector('.racing-budget .saved-feedback'),null,'no duplicate success banner');
 assert.equal(document.querySelector('.racing-budget .cta'),null,'verified Rider submits no duplicate registration');
 await act(async()=>document.querySelector('.rider-registration .text-link').click());
 await act(async()=>{await Promise.resolve()});
 assert.ok(document.querySelector('.dash-layout'),'Expense Dashboard opens on demand');
 await renderRiderPage({...integration,walletAddress:'',snapshot:null,status:'needs-wallet'});
 assert.equal(document.querySelector('.dash-layout'),null,'disconnect hides the prior wallet dashboard');
 }finally{await act(async()=>root.unmount());dom.window.close();await fs.rm(output,{recursive:true,force:true})}
});
process.on('exit',()=>{dom.window.close()});
