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
await fs.writeFile(path.join(output,'chain/config.mjs'),"export const endpoint='http://127.0.0.1:8899';\n");
await fs.writeFile(path.join(output,'chain/riderTransactions.mjs'),"export const riderError=error=>String(error);\n");
const explorerSource=await fs.readFile('src/chain/explorer.ts','utf8');
await fs.writeFile(path.join(output,'chain/explorer.mjs'),ts.transpileModule(explorerSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
for(const name of ['model','DemoState','Dashboard','Modal','TransactionResultModal','CommunityImpact']){
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
 assert.match(document.querySelector('.dash-top').textContent,/FRONTEND PREVIEW/);
 assert.equal(document.querySelector('.support-confirm').disabled,false);
 await renderDashboard('fan');
 assert.ok(document.querySelector('.support-form'),'Fan demo support form remains available');
 assert.match(document.querySelector('.support-confirm').textContent,/CONTRIBUTE/);
 assert.equal(document.querySelector('.support-confirm').disabled,false);

 const wallet='11111111111111111111111111111111';
 const actions=[];
 const integration={mode:'connected',setMode(){},cluster:'localnet',state:{version:1,expenses:[],contributions:[],selectedExpenseId:''},
  snapshot:{rider:{toBase58:()=>wallet},profileExists:false,seasonExists:false,expenses:[]},status:'ready',error:'',walletAddress:wallet,
  riderInput:'',setRiderInput(){},loadRider(){},selectedExpenseId:'',selectExpense(){},refresh(){},writing:false,
  runRiderAction:async(action,args,onProgress)=>{actions.push(action);onProgress({stage:'confirming',signature:'2'.repeat(88)});return {signature:'2'.repeat(88),address:{toBase58:()=>wallet}}},
 };
 await renderDashboard('racer',integration);
 assert.match(document.querySelector('.dash-top').textContent,/ONCHAIN RIDER/);
 assert.match(document.querySelector('.dash-profile').textContent,/No on-chain expense/);
 assert.doesNotMatch(document.querySelector('.dash-panel').textContent,/Test tyres/,'demo expense stays out of Connected mode');
 const createProfile=[...document.querySelectorAll('.chain-status-actions button')].find(button=>button.textContent.includes('CREATE RIDER PROFILE'));
 assert.ok(createProfile,'Rider action is available to the owner');
 await act(async()=>createProfile.click());
 assert.deepEqual(actions,['profile']);
 assert.match(document.querySelector('.transaction-modal').textContent,/Confirmed/);
 assert.match(document.querySelector('.transaction-modal').textContent,/dashboard has been refreshed/);
 await renderDashboard('shop',integration);
 assert.equal(document.querySelector('.support-confirm').disabled,true,'Connected Shop writes remain gated');
 await renderDashboard('fan',integration);
 assert.equal(document.querySelector('.support-confirm').disabled,true,'Connected Fan writes remain gated');
 const chainExpense={id:'chain-expense',title:'Circuit tyres',requiredCents:50000,description:'Tyres',image:'tyres',onChain:true,committedCoverageCents:10000,sponsorshipCount:1};
 let resolveSponsorship;let sponsorshipCalls=0;
 const shopIntegration={...integration,state:{version:1,expenses:[chainExpense],contributions:[],selectedExpenseId:chainExpense.id},
  snapshot:{...integration.snapshot,profileExists:true,seasonExists:true,seasonBudgetCents:50000n,seasonStatus:1},
  runMerchantAction:()=>{sponsorshipCalls++;return new Promise(resolve=>{resolveSponsorship=resolve})}};
 await renderDashboard('shop',{...shopIntegration,walletAddress:''});
 assert.equal(document.querySelector('.support-confirm').disabled,true,'missing merchant wallet blocks Connected Shop submission');
 await renderDashboard('shop',shopIntegration);
 const record=document.querySelector('.support-confirm');
 assert.equal(record.disabled,false,'wallet and on-chain expense enable Shop action');
 assert.match(document.querySelector('.selected-support-overview').textContent,/merchant committed €100/);
 await act(async()=>{record.click();record.click()});
 assert.equal(sponsorshipCalls,1,'duplicate clicks submit only one sponsorship');
 assert.equal(document.querySelector('.support-confirm').disabled,true,'pending sponsorship disables submission');
 await act(async()=>resolveSponsorship({signature:'2'.repeat(88),address:{toBase58:()=>wallet}}));
 assert.match(document.querySelector('.transaction-modal').textContent,/Sponsorship Recorded!/);
 assert.match(document.querySelector('.result-explorer').getAttribute('href'),/cluster=custom/);
 const updatedExpense={...chainExpense,committedCoverageCents:20000,sponsorshipCount:2};
 const confirmedView={...shopIntegration,state:{...shopIntegration.state,expenses:[updatedExpense]}};
 await renderDashboard('shop',confirmedView);
 assert.match(document.querySelector('.selected-support-overview').textContent,/merchant committed €200/);
 assert.match(document.querySelector('.selected-support-overview').textContent,/remaining €300/);
 await renderDashboard('racer',confirmedView);
 assert.match(document.querySelector('.dash-summary').textContent,/€200/,'Rider reads the same confirmed coverage');
 await renderDashboard('shop',{...confirmedView,state:{...confirmedView.state,expenses:[{...updatedExpense,committedCoverageCents:50000}]}});
 assert.equal(document.querySelector('.support-confirm').disabled,true,'fully covered on-chain expense cannot be sponsored');
 assert.equal(localStorage.getItem(STORAGE_KEY),JSON.stringify(state),'switching dashboards and modes preserves Demo data');
 }finally{await act(async()=>root.unmount());dom.window.close();await fs.rm(output,{recursive:true,force:true})}
});
process.on('exit',()=>{dom.window.close()});
