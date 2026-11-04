// Exercise real application handlers with persistent storage and a small DOM adapter.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..'),sharedStorage=new Map(),KEY='az900-study-v1';
function session(hash='',storageFails=false) {
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
  const ctx={window,document:{getElementById:id=>elements.get(id)||null},location,localStorage:{getItem:key=>{if(storageFails)throw Error('Blocked');return sharedStorage.get(key)||null;},setItem:(key,value)=>{if(storageFails)throw Error('Quota');sharedStorage.set(key,value);}}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'data/questions.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
  return {ctx,app,get:id=>elements.get(id),data:(name,value)=>rendered.filter(el=>Object.hasOwn(el.dataset,name)&&(value===undefined||el.dataset[name]===value)),go:id=>{location.hash='#'+id;},saved:()=>JSON.parse(sharedStorage.get(KEY)||'{}')};
}
function choose(ui,indices){for(const i of indices)ui.data('choice')[i].click();if(ui.get('submit'))ui.get('submit').click();}
function review(ui,scope){ui.data('review',scope)[0].click();}
let ui=session();
assert.equal(ui.data('start').length,7);assert.ok(ui.data('review','all')[0].disabled);
// All questions, including the 17 repaired items and Q7, must be answerable.
for(const q of ui.ctx.window.AZ_QUESTIONS) {
  ui.go(q.id);choose(ui,Array.from(q.accepted[0]));
  assert.ok(ui.app.innerHTML.includes('正解です'),q.id+': correct-answer flow');
  assert.ok(ui.app.innerHTML.includes('用語の役割'),q.id+': roles');
  assert.ok(ui.data('choice').every(c=>c.disabled),q.id+': lock answered choices');
}
ui.go('Q7-40');ui.get('next').click();assert.equal(ui.ctx.location.hash,'#done-Q7');
assert.ok(ui.app.innerHTML.includes('おつかれさまでした。'));
ui.go('Q4-26');ui.get('retry').click();choose(ui,[0,4]);assert.ok(ui.app.innerHTML.includes('正解です'),'Alternative accepted set');
ui.go('Q1-19');ui.get('retry').click();ui.data('choice')[0].click();
assert.ok(!ui.get('submit').disabled);ui.get('density').click();assert.ok(!ui.get('submit').disabled,'Density preserves pending selection');
ui.data('choice')[0].click();assert.ok(ui.get('submit').disabled,'Deselect all');
choose(ui,[0,2]);assert.ok(ui.app.innerHTML.includes('不正解です'));
// Make mistakes in multiple groups, then prove regular restarts retain the review list.
ui.go('Q1-01');ui.get('retry').click();choose(ui,[0]);
ui.go('Q2-01');ui.get('retry').click();choose(ui,[0]); // ensure wrong regardless of source order
const q2=ui.ctx.window.AZ_QUESTIONS.find(q=>q.id==='Q2-01');
if(ui.app.innerHTML.includes('正解です')){ui.get('retry').click();choose(ui,[q2.accepted[0][0]===0?1:0]);}
ui.go('');const wrongBefore=Object.keys(ui.saved().mistakes).length;
ui.data('start','Q1')[0].click();assert.ok(!Object.keys(ui.saved().answers).some(id=>id.startsWith('Q1-')));
assert.equal(Object.keys(ui.saved().mistakes).length,wrongBefore,'Restart retains mistakes');
assert.ok(ui.saved().answers['Q2-01'],'Other group progress retained');
ui.go('');review(ui,'Q1');
assert.equal(ui.ctx.location.hash,'#review-Q1-01');assert.ok(ui.data('choice').every(c=>!c.disabled),'Review starts with fresh choices');
assert.deepEqual(ui.saved().review.ids,['Q1-01','Q1-19'],'Only wrong answers in chosen group');
choose(ui,[3]);assert.ok(!ui.saved().mistakes['Q1-01'],'Correct review removes mistake');
ui=session('#review-Q1-01');assert.ok(ui.app.innerHTML.includes('正解です'),'Review answer survives reload');
ui.get('next').click();assert.equal(ui.ctx.location.hash,'#review-Q1-19','Fixed review queue remains stable after correction');
choose(ui,[0,2]);assert.ok(ui.saved().mistakes['Q1-19'],'Wrong again stays in list');
ui.get('prev').click();assert.equal(ui.ctx.location.hash,'#review-Q1-01');
ui.get('next').click();ui.get('next').click();assert.equal(ui.ctx.location.hash,'#done-review');
assert.ok(ui.app.innerHTML.includes('done-score">1<span> / 2 問正解'));
review(ui,'Q1');assert.deepEqual(ui.saved().review.ids,['Q1-19'],'Repeat only remaining mistake');
choose(ui,[0,1]);ui.get('next').click();assert.ok(ui.data('review','Q1')[0].disabled,'No mistakes left in Q1');
ui.go('');review(ui,'all');assert.deepEqual(ui.saved().review.ids,['Q2-01'],'Global review excludes corrected mistakes');
ui.get('jump').change('Q2-01');assert.equal(ui.ctx.location.hash,'#review-Q2-01');
choose(ui,Array.from(q2.accepted[0]));ui.go('');assert.ok(ui.data('review','all')[0].disabled,'Global empty state');
// Upgrade actual v1-shaped progress without losing valid answers; revised items are reset.
sharedStorage.set(KEY,JSON.stringify({last:'Q3-06',answers:{'Q1-01':{selected:[0]},'Q1-02':{selected:[2]},'Q3-06':{selected:[]},'Q1-14':{selected:[]}}}));
ui=session('#Q3-06');assert.ok(ui.data('choice').every(c=>!c.disabled),'Old explanation-only answer invalidated');
assert.ok(ui.saved().mistakes['Q1-01'],'Old wrong answers migrate');
assert.ok(ui.saved().answers['Q1-02'],'Other old progress preserved');
ui.go('');review(ui,'Q1');assert.ok(ui.saved().review.ids.includes('Q1-01'));
// Corrupt JSON, malformed fields and unavailable storage cannot crash startup.
for(const value of ['{bad json','null','[]',JSON.stringify({answers:[],last:{},review:false}),JSON.stringify({answers:{},review:{ids:['bad'],answers:{},scope:'all'}})]){
  sharedStorage.set(KEY,value);ui=session();assert.equal(ui.data('start').length,7);
}
ui=session('',true);ui.go('Q7-01');choose(ui,[0]);assert.ok(ui.app.innerHTML.includes('正解です'),'Storage unavailable: session still works');
console.log('Passed all 460 correct-answer flows; review filtering, group/all scopes, stable queues, empty states, persistence, migration, retry, multiple selection, density changes, reset, Q7 navigation and storage recovery.');
