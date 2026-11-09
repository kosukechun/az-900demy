// Exercise real application handlers with persistent storage and a small DOM adapter.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..'),sharedStorage=new Map(),KEY='az900-study-v1';
function session(hash='',storageFails=false,seed=13579) {
  const listeners={},elements=new Map();let rendered=[];
  class Element {
    constructor(attrs={}) {this.attrs=attrs;this.dataset={};this.events={};this.disabled=Object.hasOwn(attrs,'disabled');this.value=attrs.value||'';this.classList={toggle:()=>{}};for(const [k,v] of Object.entries(attrs)) if(k.startsWith('data-')) this.dataset[k.slice(5)]=v;}
    addEventListener(type,fn){this.events[type]=fn;}
    setAttribute(k,v){this.attrs[k]=v;}
    getBoundingClientRect(){return {top:0,bottom:0};}
    scrollIntoView(){}
    click(){assert.ok(!this.disabled,'Disabled control');this.events.click?.({target:this});}
    change(value){this.value=value;this.events.change?.({target:this});}
  }
  const app=new Element();
  Object.defineProperty(app,'innerHTML',{get(){return this.html;},set(html){
    this.html=html;elements.clear();elements.set('app',app);rendered=[];
    for(const match of html.matchAll(/<(button|select|section|div)\b([^>]*)>/g)) {
      const attrs={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]]=a[2]??'';
      const el=new Element(attrs);rendered.push(el);if(attrs.id) elements.set(attrs.id,el);
    }
  }});
  app.querySelectorAll=sel=>rendered.filter(el=>Object.hasOwn(el.attrs,sel.slice(1,-1)));
  elements.set('app',app);let currentHash=hash;
  const location={};Object.defineProperty(location,'hash',{get:()=>currentHash,set(value){currentHash=value.startsWith('#')?value:'#'+value;listeners.hashchange?.();}});
  const window={innerHeight:1000,scrollTo:()=>{},matchMedia:q=>({matches:q.includes('reduce')}),addEventListener:(type,fn)=>listeners[type]=fn};
  const seededMath=Object.create(Math);
  seededMath.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const ctx={Math:seededMath,window,document:{getElementById:id=>elements.get(id)||null},location,localStorage:{getItem:key=>{if(storageFails)throw Error('Blocked');return sharedStorage.get(key)||null;},setItem:(key,value)=>{if(storageFails)throw Error('Quota');sharedStorage.set(key,value);}}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'data/questions.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
  return {ctx,app,get:id=>elements.get(id),data:(name,value)=>rendered.filter(el=>Object.hasOwn(el.dataset,name)&&(value===undefined||el.dataset[name]===value)),go:id=>{location.hash='#'+id;},saved:()=>JSON.parse(sharedStorage.get(KEY)||'{}')};
}
function choose(ui,indices){for(const i of indices)ui.data('choice',String(i))[0].click();if(ui.get('submit'))ui.get('submit').click();}
function review(ui,scope){ui.data('review',scope)[0].click();}
function wrongSelection(q){return q.multiple?[q.accepted[0][0]]:[q.choices.findIndex((_,i)=>!q.accepted.some(a=>a.length===1&&a[0]===i))];}
function right(ui,id){const q=ui.ctx.window.AZ_QUESTIONS.find(q=>q.id===id);choose(ui,Array.from(q.accepted[0]));}
function wrong(ui,id){const q=ui.ctx.window.AZ_QUESTIONS.find(q=>q.id===id);choose(ui,wrongSelection(q));}
const plain=values=>Array.from(values);
const sameMembers=(a,b)=>assert.deepEqual([...a].sort(),[...b].sort());
let ui=session();
assert.equal(ui.data('start').length,7);assert.ok(ui.data('review','all')[0].disabled);
// Exercise every correct and incorrect answer using canonical IDs behind shuffled buttons.
for(const q of ui.ctx.window.AZ_QUESTIONS) {
  ui.go(q.id);
  const order=ui.data('choice').map(c=>Number(c.dataset.choice));
  sameMembers(order,q.choices.map((_,i)=>i));
  if(q.choices[0].text==='はい')assert.deepEqual(order,[0,1],q.id+': fixed yes/no');
  choose(ui,Array.from(q.accepted[0]));
  assert.ok(ui.app.innerHTML.includes('✓ 正解です'),q.id+': correct answer');
  assert.ok(ui.app.innerHTML.includes(q.focus),q.id+': learning point');
  assert.ok(ui.app.innerHTML.includes('用語の意味と役割'),q.id+': definitions');
  for(const i of q.accepted[0])assert.ok(ui.app.innerHTML.includes(`${String.fromCharCode(65+order.indexOf(i))}：`),q.id+': displayed answer label');
  assert.ok(ui.data('choice').every(c=>c.disabled),q.id+': answered choices locked');
  const stored=ui.saved();
  if(q.choices[0].text!=='はい')assert.deepEqual(stored.choiceOrders[q.id],order,q.id+': stable choices');
  ui.get('retry').click();choose(ui,wrongSelection(q));
  assert.ok(ui.app.innerHTML.includes('× 不正解です'),q.id+': incorrect answer');
  ui.get('retry').click();right(ui,q.id);
}
ui.go(ui.saved().orders.Q7.at(-1));ui.get('next').click();assert.equal(ui.ctx.location.hash,'#done-Q7');
assert.ok(ui.app.innerHTML.includes('おつかれさまでした。'));
// A partially selected multi-answer question survives density changes.
ui.go('Q1-19');ui.get('retry').click();ui.data('choice','0')[0].click();
assert.ok(!ui.get('submit').disabled);ui.get('density').click();assert.ok(!ui.get('submit').disabled);
ui.data('choice','0')[0].click();assert.ok(ui.get('submit').disabled);
choose(ui,[0]);assert.ok(ui.app.innerHTML.includes('× 不正解です'));
for(const id of ['Q1-01','Q2-01']){ui.go(id);ui.get('retry').click();wrong(ui,id);}
ui.go('');const wrongBefore=Object.keys(ui.saved().mistakes).length;
const previousOrder=ui.saved().orders.Q1;
ui.data('start','Q1')[0].click();assert.ok(!Object.keys(ui.saved().answers).some(id=>id.startsWith('Q1-')));
assert.equal(Object.keys(ui.saved().mistakes).length,wrongBefore,'Restart retains mistakes');
assert.ok(ui.saved().answers['Q2-01'],'Other group progress retained');
assert.notDeepEqual(ui.saved().orders.Q1,previousOrder,'Restart reshuffles questions');
ui.go('');review(ui,'Q1');
const queue=ui.saved().review.ids;
sameMembers(queue,['Q1-01','Q1-19']);assert.equal(ui.ctx.location.hash,'#review-'+queue[0]);
assert.ok(ui.data('choice').every(c=>!c.disabled),'Review starts unanswered');
right(ui,queue[0]);assert.ok(!ui.saved().mistakes[queue[0]],'Correct review removes mistake');
const reviewOrder=ui.saved().review.choiceOrders[queue[0]];
ui=session('#review-'+queue[0]);assert.ok(ui.app.innerHTML.includes('✓ 正解です'),'Review persists on reload');
assert.deepEqual(ui.saved().review.ids,queue,'Review queue remains fixed after correction');
assert.deepEqual(ui.saved().review.choiceOrders[queue[0]],reviewOrder,'Review choices remain fixed');
ui.get('next').click();assert.equal(ui.ctx.location.hash,'#review-'+queue[1]);
wrong(ui,queue[1]);assert.ok(ui.saved().mistakes[queue[1]],'Wrong review remains');
ui.get('prev').click();assert.equal(ui.ctx.location.hash,'#review-'+queue[0]);
ui.get('next').click();ui.get('next').click();assert.equal(ui.ctx.location.hash,'#done-review');
assert.ok(ui.app.innerHTML.includes('done-score">1<span> / 2 問正解'));
review(ui,'Q1');assert.deepEqual(ui.saved().review.ids,[queue[1]]);right(ui,queue[1]);ui.get('next').click();
assert.ok(ui.data('review','Q1')[0].disabled);
ui.go('');review(ui,'all');assert.deepEqual(ui.saved().review.ids,['Q2-01']);
ui.get('jump').change('Q2-01');assert.equal(ui.ctx.location.hash,'#review-Q2-01');
right(ui,'Q2-01');ui.go('');assert.ok(ui.data('review','all')[0].disabled);
// Changed questions reject obsolete answers while untouched legacy answers survive.
sharedStorage.set(KEY,JSON.stringify({last:'Q1-01',answers:{'Q1-01':{selected:[3],revision:1},'Q1-02':{selected:[2]}}}));
ui=session('#Q1-01');assert.ok(ui.data('choice').every(c=>!c.disabled),'Old revised answer is invalid');
assert.ok(ui.saved().answers['Q1-02'],'Untouched legacy answer retained');
assert.ok(ui.saved().mistakes['Q1-02'],'Untouched legacy mistake migrates');
ui.go('Q1-02');assert.ok(ui.app.innerHTML.includes('× 不正解です'),'Legacy answer remains viewable');
// Saved orders survive reload, incomplete orders are repaired, and seeds produce diverse permutations.
const groupOrders=new Set(),optionOrders=new Set();
for(let seed=1;seed<=20;seed++){
  sharedStorage.clear();ui=session('',false,seed);
  for(const group of ['Q1','Q2','Q3','Q4','Q5','Q6','Q7']){
    ui.go('');ui.data('start',group)[0].click();
    sameMembers(ui.saved().orders[group],ui.ctx.window.AZ_QUESTIONS.filter(q=>q.group===group).map(q=>q.id));
  }
  ui.go('Q1-07');groupOrders.add(ui.saved().orders.Q1.join());optionOrders.add(ui.saved().choiceOrders['Q1-07'].join());
  const snapshot=ui.saved();ui=session('#Q1-07',false,seed+100);
  assert.deepEqual(ui.saved().orders.Q1,snapshot.orders.Q1);
  assert.deepEqual(ui.saved().choiceOrders['Q1-07'],snapshot.choiceOrders['Q1-07']);
  for(const id of ['Q1-09','Q2-04','Q3-03','Q4-03','Q5-15','Q6-01']){
    ui.go(id);assert.deepEqual(ui.data('choice').map(c=>Number(c.dataset.choice)),[0,1]);
  }
}
assert.ok(groupOrders.size>15,'Question order varies across runs');
assert.ok(optionOrders.size>8,'Choice order varies across runs');
sharedStorage.set(KEY,JSON.stringify({orders:{Q1:['Q1-01','Q1-01']},choiceOrders:{'Q1-07':[0,0,0,0]}}));
ui=session('#Q1-07');assert.equal(ui.saved().orders.Q1.length,70);
sameMembers(ui.saved().choiceOrders['Q1-07'],[0,1,2,3]);
for(const value of ['{bad json','null','[]',JSON.stringify({answers:[],last:{},review:false}),JSON.stringify({answers:{},review:{ids:['bad'],answers:{},scope:'all'}})]){
  sharedStorage.set(KEY,value);ui=session();assert.equal(ui.data('start').length,7);
}
ui=session('',true);ui.go('Q7-01');choose(ui,[0]);assert.ok(ui.app.innerHTML.includes('✓ 正解です'));
console.log('Passed 460 correct and 460 incorrect answer flows, shuffled labels, fixed yes/no, all 7 group permutations, restart/review randomization, persistence, legacy answer migration, reset, navigation and storage recovery.');
