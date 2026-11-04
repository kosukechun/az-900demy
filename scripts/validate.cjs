const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const ctx = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'data/questions.js'),'utf8'),ctx);
const qs = ctx.window.AZ_QUESTIONS;
const meta=JSON.parse(fs.readFileSync(path.join(root,'data/content-meta.json'),'utf8'));
const expected=Object.values(meta.groups).reduce((a,b)=>a+b,0);
assert.equal(qs.length,expected);
assert.equal(new Set(qs.map(q=>q.id)).size,expected);
for (const [group,total] of Object.entries(meta.groups)) assert.equal(qs.filter(q=>q.group===group).length,total);
let choices = 0;
for (const q of qs) {
  assert.ok(q.explanation.length>15,q.id+': explanation');
  assert.ok(q.choices.length>=2,q.id+': choices');
  assert.ok(q.accepted.length && !q.ungraded,q.id+': must be answerable');
  assert.ok(q.terms.length>0&&q.terms.length<=3,q.id+': concise learning terms');
  for(const t of q.terms) assert.ok(t.term&&t.role.length>15,q.id+': meaningful role');
  if(meta.revisedIds.includes(q.id)) {
    assert.equal(q.revision,2,q.id+': invalidate old answers');
    assert.equal(q.checkedAt,meta.checkedAt);
    assert.ok(q.sources.length,q.id+': verified source');
  }
  if(q.group==='Q7') {
    assert.equal(q.origin.file,'mogimondai.pdf');
    assert.equal(q.origin.question,q.number);
    assert.ok(q.origin.page>=2&&q.origin.page<=16);
    assert.ok(q.sources.length,q.id+': source');
  }
  for (const set of q.accepted) {
    assert.equal(new Set(set).size,set.length,q.id+': duplicate accepted choice');
    for (const i of set) assert.ok(Number.isInteger(i) && i>=0 && i<q.choices.length,q.id+': answer index');
    if (set.length>1) assert.ok(q.multiple,q.id+': multiple choice');
  }
  for (const src of q.sources) assert.ok(/^https:\/\/(learn\.microsoft\.com|azure\.microsoft\.com)\//.test(src.url),q.id+': official source');
  assert.ok(typeof q.prompt==='string' && q.prompt.length>15,q.id+': text prompt');
  assert.ok(!Object.hasOwn(q,'image')&&!Object.hasOwn(q,'source'),q.id+': no image dependency');
  assert.equal(q.group,q.id.slice(0,2));
  assert.equal(q.number,Number(q.id.slice(3)));
  for(const c of q.choices) {
    assert.ok(typeof c.text==='string'&&c.text.trim().length,q.id+': choice text');
    assert.ok(!Object.hasOwn(c,'image'),q.id+': text-only choice');
    assert.ok(!c.text.includes('[判読不能]'),q.id+': incomplete transcription');
    choices++;
  }
  assert.ok(!/[丨卩丿ⅣⅳⅥⅱ凵酣]|[A-Za-z]「|[A-Za-z]。/.test(q.prompt),q.id+': OCR artifact');
}
// TXT is the editable source of truth; the generated runtime strings must match it exactly.
for(const [group,total] of Object.entries(meta.groups)) {
  const text=fs.readFileSync(path.join(root,`data/${group}.txt`),'utf8').replace(/\r\n/g,'\n');
  const blocks=[...text.matchAll(/^=== (Q\d+-\d{2}) ===\r?\n([\s\S]*?)(?=^=== Q|$(?![\s\S]))/gm)];
  assert.equal(blocks.length,total,`${group}: text blocks`);
  blocks.forEach((match,index)=>{
    const q=qs.find(q=>q.id===match[1]);
    assert.equal(q.number,index+1);
    const [prompt,body]=match[2].trim().split('\n--- 選択肢 ---\n');
    assert.equal(q.prompt,prompt.trim());
    const lines=body.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length,q.choices.length);
    lines.forEach((line,i)=>assert.equal(q.choices[i].text,line.slice(3)));
  });
}
// Regression anchors: manually checked source screenshots and nontrivial exceptions.
assert.equal(qs.find(q=>q.id==='Q1-07').accepted[0][0],1);
assert.equal(qs.find(q=>q.id==='Q1-47').accepted[0][0],2);
assert.deepEqual(Array.from(qs.find(q=>q.id==='Q3-06').accepted[0]),[0,4]);
assert.ok(qs.find(q=>q.id==='Q1-70').multiple);
assert.equal(qs.find(q=>q.id==='Q6-35').choices.length,3);
assert.equal(qs.find(q=>q.id==='Q6-36').accepted[0][0],2);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for (const file of ['data/questions.js','app.js','style.css']) assert.ok(html.includes(file));
assert.ok(!html.includes('https://'),'No external runtime dependencies');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
assert.ok(!/<img|<picture|\.webp|\.png|assets\//.test(app),'App requires no screenshot assets');
console.log(`Validated ${qs.length} answerable questions and ${choices} choices, learning terms, revised answer versions, PDF provenance, official references and exact TXT/runtime agreement.`);
