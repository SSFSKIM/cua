// Real file/CLI boundary tests only. No engine, Swift or browser execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collectCaret} from './caret-table.mjs';
const cli=fileURLToPath(new URL('./caret-table.mjs',import.meta.url));
function fixture(t){const root=mkdtempSync(join(tmpdir(),'probe354-caret-table-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root}
function row(arm){return {recordKind:'caret-diagnostic',id:'caret/plain-unicode/1',variant:'plain-unicode',arm,engine:(arm==='main'?'a':'b').repeat(40),valid:true,knownUnits:{codePoints:3,utf16:4,utf8:8,expectedOffsets:{codePoints:3,utf16:4,utf8:8}},caretTrace:{id:'caret/plain-unicode/1',readerHook:arm==='main'?'none':'TypeReadback',startedAt:1,typingCompleteAt:arm==='main'?null:2,endedAt:3,polls:[],outsidePollRanges:[]},typeRPC:{raw:{error:{code:-32000,errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'rangeUnreadable'}}}}}}}
function write(root,arm,rows){const dir=join(root,arm);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'caret-rows.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n'));return dir}

test('diagnostic collection ignores even malformed primary artifacts and emits only caret tables',t=>{
 const root=fixture(t),rows=[row('main'),row('branch')];for(const r of rows)write(root,r.arm,[r]);writeFileSync(join(root,'rows.jsonl'),'not diagnostic JSON');
 assert.deepEqual(collectCaret(root).rows,rows.slice().reverse());
 const result=spawnSync(process.execPath,[cli,root],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),{cohort:'firefox-caret',primaryEvidence:false,artifacts:2,rows:2});
 const summary=JSON.parse(readFileSync(join(root,'summary.json'),'utf8'));assert.equal(summary.primaryEvidence,false);assert.equal(summary.observerEffect,true);
 assert.equal(summary.cases.find(c=>c.arm==='main').readerHook,'none');assert.equal(summary.cases.find(c=>c.arm==='branch').readerHook,'TypeReadback');
 for(const name of ['caret-cases.tsv','caret-polls.tsv','caret-outside.tsv','caret-final.tsv'])assert.equal(existsSync(join(root,name)),true,name);
 for(const name of ['rates.tsv','cost.tsv','cost-ab.tsv'])assert.equal(existsSync(join(root,name)),false,name);
});

test('primary-only and empty diagnostic directories cannot be reported as diagnostic evidence',t=>{
 const root=fixture(t);writeFileSync(join(root,'rows.jsonl'),JSON.stringify(row('main')));
 assert.throws(()=>collectCaret(root),/no caret diagnostic/);write(root,'main',[]);assert.throws(()=>collectCaret(root),/no caret diagnostic/);
});

test('non-diagnostic and duplicate diagnostic rows are rejected rather than silently mixed or double-counted',t=>{
 const root=fixture(t),r=row('branch');write(root,'branch',[{...r,recordKind:'cell'}]);assert.throws(()=>collectCaret(root),/non-diagnostic/);
 write(root,'branch',[r,r]);assert.throws(()=>collectCaret(root),/duplicate/);
});
