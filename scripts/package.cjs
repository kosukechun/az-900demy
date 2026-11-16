const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const dest = path.join(root,'dist');
if (!path.isAbsolute(dest) || path.dirname(dest)!==root || path.basename(dest)!=='dist') throw new Error('Unsafe build output path');
if (fs.existsSync(dest)) {
  if (fs.lstatSync(dest).isSymbolicLink()) throw new Error('Build output must not be a symlink');
  fs.rmSync(dest,{recursive:true,force:true});
}
fs.mkdirSync(dest,{recursive:true});
for (const name of ['index.html','app.js','style.css','icon.svg','.nojekyll','data/questions.js']) {
  fs.mkdirSync(path.dirname(path.join(dest,name)),{recursive:true});
  fs.copyFileSync(path.join(root,name),path.join(dest,name));
}
// Text sources are included for a portable, independently editable export.
for (const group of Object.keys(JSON.parse(fs.readFileSync(path.join(root,'data/content-meta.json'),'utf8')).groups)) fs.copyFileSync(path.join(root,`data/${group}.txt`),path.join(dest,`data/${group}.txt`));
// A new content URL prevents returning browsers from reusing an earlier question pool.
// Derive versions from the packaged bytes so future data/code changes need no manual bump.
const htmlPath = path.join(dest,'index.html');
let html = fs.readFileSync(htmlPath,'utf8');
for (const asset of ['style.css','data/questions.js','app.js']) {
  const version = crypto.createHash('sha256').update(fs.readFileSync(path.join(dest,asset))).digest('hex').slice(0,12);
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const reference = new RegExp(`((?:src|href)="${escaped})(?:\\?[^"\\s]*)?(")`,'g');
  if (!reference.test(html)) throw new Error(`Missing HTML asset reference: ${asset}`);
  html = html.replace(reference,`$1?v=${version}$2`);
}
fs.writeFileSync(htmlPath,html);
console.log('Static app packaged in dist/');
