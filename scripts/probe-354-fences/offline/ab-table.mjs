// Offline + incremental tables for the existing #354 kit's A/B mode. No browser, engine or GUI.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarize} from '../ab-model.mjs';
function tsv(rows,columns){return [columns.join('\t'),...rows.map(r=>columns.map(k=>r[k]==null?'':typeof r[k]==='object'?JSON.stringify(r[k]):r[k]).join('\t'))].join('\n')+'\n'}
export function writeTables(out,rows){
 mkdirSync(out,{recursive:true});const s=summarize(rows),privacy=rows.filter(r=>r.recordKind==='cell'&&r.part==='unsupported').map(r=>({id:r.id,arm:r.arm,browser:r.browser,editor:r.editor,variant:r.variant,valid:r.valid,unconfirmed:r.answer?.unconfirmed??false,textReadAttempts:r.audit?.textReadAttempts??null,privacyViolation:!!r.privacyViolation,findings:r.privacyFindings??[]}));
 writeFileSync(join(out,'summary.json'),JSON.stringify({...s,privacy},null,2));
 writeFileSync(join(out,'rates.tsv'),tsv(s.groups,['arm','browser','editor','part','key','length','variant','attempted','valid','invalid','success','unconfirmed','otherErrors','wrong','wrongSuccess','falseUnconfirmed','privacyViolations']));
 writeFileSync(join(out,'cost.tsv'),tsv(s.cost,['arm','browser','length','path','n','p50','p95','max']));
 writeFileSync(join(out,'privacy.tsv'),tsv(privacy,['id','arm','browser','editor','variant','valid','unconfirmed','textReadAttempts','privacyViolation','findings']));
 writeFileSync(join(out,'wrong-successes.jsonl'),s.wrongSuccesses.map(r=>JSON.stringify(r)).join('\n')+(s.wrongSuccesses.length?'\n':''));
 const paired=[];
 for(const m of s.cost.filter(c=>c.arm==='main')){const b=s.cost.find(c=>c.arm==='branch'&&c.browser===m.browser&&c.length===m.length&&c.path===m.path);if(b)paired.push({browser:m.browser,length:m.length,path:m.path,mainN:m.n,branchN:b.n,mainP50:m.p50,branchP50:b.p50,deltaP50:+(b.p50-m.p50).toFixed(2),mainP95:m.p95,branchP95:b.p95,deltaP95:+(b.p95-m.p95).toFixed(2)})}
 writeFileSync(join(out,'cost-ab.tsv'),tsv(paired,['browser','length','path','mainN','branchN','mainP50','branchP50','deltaP50','mainP95','branchP95','deltaP95']));
 return s;
}
export function collect(root){
 const paths=[];function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(e.name==='rows.jsonl')paths.push(p)}}walk(root);
 if(!paths.length)throw Error('no rows.jsonl artifacts under '+root);
 const rows=[],ids=new Set();for(const path of paths.sort())for(const line of readFileSync(path,'utf8').split('\n').filter(Boolean)){
  const r=JSON.parse(line);if(r.recordKind!=='cell')continue;
  const key=[r.kit,r.engine,r.arm,r.browser,r.shard,r.id].join('/');if(ids.has(key))throw Error('duplicate attempt in artifacts: '+key);ids.add(key);rows.push(r);
 }
 return {paths,rows};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.argv[2];if(!root)throw Error('usage: ab-table.mjs <downloaded-run-directory>');const {paths,rows}=collect(root),s=writeTables(root,rows);
 console.log(JSON.stringify({artifacts:paths.length,rows:rows.length,branchWrongSuccesses:s.wrongSuccesses.filter(r=>r.arm==='branch').map(r=>({id:r.id,browser:r.browser,editor:r.editor,engine:r.engine})),groups:s.groups.length}));
}
