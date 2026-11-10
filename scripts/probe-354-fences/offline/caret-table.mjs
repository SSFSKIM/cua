// Offline diagnostic-only collection. Does not read primary rows.jsonl or emit primary rate/cost files.
import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeCaretTables,CARET_MODE} from '../caret.mjs';
export function collectCaret(root){
 const paths=[],rows=[],seen=new Set();
 function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name==='caret-rows.jsonl')paths.push(p)}}walk(root);
 if(!paths.length)throw Error('no caret diagnostic artifacts; primary rows are not accepted');
 for(const path of paths.sort())for(const line of readFileSync(path,'utf8').split('\n').filter(Boolean)){
  const r=JSON.parse(line);if(r.recordKind!=='caret-diagnostic')throw Error('non-diagnostic row in caret artifact');
  const key=JSON.stringify([r.arm,r.engine,r.id]);if(seen.has(key))throw Error('duplicate caret diagnostic case');seen.add(key);rows.push(r);
 }
 if(!rows.length)throw Error('no caret diagnostic observations');
 return {paths,rows};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.argv[2];if(!root)throw Error('usage: caret-table.mjs <downloaded-caret-cohort-directory>');
 const {paths,rows}=collectCaret(root);writeCaretTables(root,rows);
 console.log(JSON.stringify({cohort:CARET_MODE,primaryEvidence:false,artifacts:paths.length,rows:rows.length}));
}
