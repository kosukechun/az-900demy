// Unit-level DOM adapter: exercises the app's event handlers without launching a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'..');
const sharedStorage=new Map();
function session(hash='') {
  const listeners={}; const elements=new Map(); let choices=[]; let groups=[]; let starts=[];
  class Element {
    constructor(attrs={}) { this.attrs=attrs;this.dataset={};this.events={};this.disabled=Object.hasOwn(attrs,'disabled');this.value=attrs.value||'';this.classList={toggle:()=>{}}; }
    addEventListener(type,fn) {this.events[type]=fn;}
    setAttribute(k,v) {this.attrs[k]=v;}
    getBoundingClientRect() {return {top:0,bottom:0};}
    scrollIntoView() {}
    click() {assert.ok(!this.disabled,'Attempted to click disabled control');this.events.click?.({target:this});}
    change(value) {this.value=value;this.events.change?.({target:this});}
  }
  const app=new Element();
  Object.defineProperty(app,'innerHTML',{get(){return this.html;},set(html){
    this.html=html;elements.clear();elements.set('app',app);choices=[];groups=[];starts=[];
    for (const match of html.matchAll(/<(button|select|section|div)\b([^>]*)>/g)) {
      const attrs={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]]=a[2]??'';
      const el=new Element(attrs);
      if(attrs.id) elements.set(attrs.id,el);
      if(Object.hasOwn(attrs,'data-choice')) {el.dataset.choice=attrs['data-choice'];choices.push(el);}
      if(Object.hasOwn(attrs,'data-group')) {el.dataset.group=attrs['data-group'];groups.push(el);}
      if(Object.hasOwn(attrs,'data-start')) {el.dataset.start=attrs['data-start'];starts.push(el);}
    }
  }});
  app.querySelectorAll=sel=>sel==='[data-choice]'?choices:sel==='[data-group]'?groups:sel==='[data-start]'?starts:[];
  elements.set('app',app);
  let currentHash=hash;
  const location={};Object.defineProperty(location,'hash',{get:()=>currentHash,set(value){currentHash=value.startsWith('#')?value:'#'+value;listeners.hashchange?.();}});
  const window={innerHeight:1000,scrollTo:()=>{},matchMedia:()=>({matches:true}),addEventListener:(type,fn)=>listeners[type]=fn};
  const ctx={window,document:{getElementById:id=>elements.get(id)||null},location,localStorage:{getItem:key=>sharedStorage.get(key)||null,setItem:(key,value)=>sharedStorage.set(key,value)}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'data/questions.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
  return {ctx,app,get:id=>elements.get(id),choices:()=>choices,groups:()=>groups,starts:()=>starts,go:id=>{location.hash='#'+id;},saved:()=>JSON.parse(sharedStorage.get('az900-study-v1')).answers};
}
let ui=session();
// Every question and choice must render as escaped native text, including explanation-only items.
const htmlEscape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const q of ui.ctx.window.AZ_QUESTIONS) {
  ui.go(q.id);
  assert.ok(ui.app.innerHTML.includes('<div class="prompt-text">'+htmlEscape(q.prompt)+'</div>'),q.id+': prompt text rendered');
  for(const choice of q.choices) assert.ok(ui.app.innerHTML.includes('<span class="choice-text">'+htmlEscape(choice.text)+'</span>'),q.id+': choice text rendered');
  assert.ok(!/<img|<picture|\.webp|\.png/.test(ui.app.innerHTML),q.id+': no screenshot requests');
}
ui.go('');
assert.equal(ui.starts().length,6);
ui.starts()[0].click();
assert.equal(ui.ctx.location.hash,'#Q1-01');
assert.ok(ui.get('prev').disabled);
ui.choices()[0].click();
assert.ok(ui.app.innerHTML.includes('不正解です'),'Single answer judges immediately');
assert.ok(ui.choices().every(c=>c.disabled),'Answer cannot be changed accidentally');
ui.get('retry').click();
assert.ok(!ui.saved()['Q1-01'],'Retry clears only this question');
ui.choices()[3].click();
assert.ok(ui.app.innerHTML.includes('正解です'));
ui=session('#Q1-01');
assert.ok(ui.app.innerHTML.includes('正解です'),'Result persists across reload');
ui.go('Q1-19');
ui.choices()[0].click();
assert.ok(!ui.saved()['Q1-19'],'Multiple choice waits for submission');
ui.choices()[0].click();
assert.ok(ui.get('submit').disabled,'Deselecting every option disables submit');
ui.choices()[0].click();ui.choices()[1].click();ui.get('submit').click();
assert.ok(ui.app.innerHTML.includes('正解です'));
ui.get('retry').click();ui.choices()[0].click();ui.choices()[2].click();ui.get('submit').click();
assert.ok(ui.app.innerHTML.includes('不正解です'),'Wrong multiple-choice combination');
ui.go('Q3-06');ui.get('submit').click();
assert.ok(ui.app.innerHTML.includes('解説を確認'));
assert.ok(!ui.app.innerHTML.includes('不正解です'),'Incomplete screenshot is never marked wrong');
let scored=0;
for (const q of ui.ctx.window.AZ_QUESTIONS.filter(q=>!q.ungraded)) {
  ui.go(q.id);
  if(ui.saved()[q.id]) ui.get('retry').click();
  for(const i of q.accepted[0]) ui.choices()[i].click();
  if(q.multiple) ui.get('submit').click();
  assert.ok(ui.app.innerHTML.includes('正解です'),q.id+': correct-answer flow');
  scored++;
}
ui.go('Q4-26');ui.get('retry').click();ui.choices()[0].click();ui.choices()[4].click();ui.get('submit').click();
assert.ok(ui.app.innerHTML.includes('正解です'),'Alternative valid answer set');
ui.go('Q6-70');ui.get('next').click();assert.equal(ui.ctx.location.hash,'#done-Q6');
assert.ok(ui.app.innerHTML.includes('おつかれさまでした。')===false,'Unanswered explanation-only item remains pending');
ui.get('done-home').click();assert.equal(ui.starts().length,6);
// Starting over clears only the chosen set, persists the reset, and makes question 1 answerable.
const otherSetBefore=JSON.stringify(ui.saved()['Q2-01']);
ui.starts()[0].click();
assert.equal(ui.ctx.location.hash,'#Q1-01');
assert.ok(!Object.keys(ui.saved()).some(id=>id.startsWith('Q1-')),'Selected set reset');
assert.equal(JSON.stringify(ui.saved()['Q2-01']),otherSetBefore,'Other set preserved');
assert.ok(ui.choices().every(c=>!c.disabled),'Question 1 is answerable again');
assert.ok(!ui.get('feedback'),'Old answer is hidden after restart');
ui=session('#Q1-01');assert.ok(ui.choices().every(c=>!c.disabled),'Reset survives reload');
ui.choices()[3].click();
ui.go('');
ui.groups().find(b=>b.dataset.group==='Q1').click();
assert.equal(ui.ctx.location.hash,'#Q1-02','Continue chooses first unanswered question');
ui.go('done-Q2');ui.get('restart').click();
assert.equal(ui.ctx.location.hash,'#Q2-01','Results also allow restarting');
assert.ok(!Object.keys(ui.saved()).some(id=>id.startsWith('Q2-')));
assert.ok(ui.saved()['Q1-01'],'Results restart preserves other sets');
// Corrupt saved data must not prevent the app from starting.
sharedStorage.set('az900-study-v1','{bad json');ui=session();assert.equal(ui.starts().length,6);
console.log(`Passed ${scored} scored answer flows, multiple-choice submission/deselection, alternative answers, retry, persistence, explanation-only mode, set restart/continue, navigation, and corrupt-storage recovery.`);
