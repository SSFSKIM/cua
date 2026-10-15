// Inventory coverage distinguishes actual selected-host observations from named unit-only obligations.
import {readFileSync,existsSync,globSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const repository=fileURLToPath(new URL('../../',import.meta.url));
export const unitProofKey=proof=>`${proof.file}#${proof.name}`;
export function rowCovered(row,executableCases,passedUnitProofs=new Set()){
 const live=row.cases.filter(id=>!row.unitCases?.includes(id));
 if(live.length)return live.every(id=>executableCases.has(id));
 if(row.liveRequired)return false;
 return Boolean(row.unitProof&&passedUnitProofs.has(unitProofKey(row.unitProof)));
}
const escaped=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function verifyUnitProofs(rows,{root=repository}={}){
 const proofs=new Map(rows.filter(row=>row.unitProof).map(row=>[unitProofKey(row.unitProof),row.unitProof]));
 if(!proofs.size)return new Set();
 const script=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).scripts?.test;
 const pattern=/^node --test ["']?([^"'\s]+)["']?$/.exec(script??'')?.[1];
 if(!pattern)throw new Error('Cannot establish referenced unit proof inclusion in npm test');
 const discovered=new Set(globSync(pattern,{cwd:root}).map(file=>resolve(root,file)));
 const passed=new Set();
 for(const [key,proof] of proofs){
  if(!proof||Object.keys(proof).sort().join(',')!=='file,name'||typeof proof.file!=='string'||!/^test\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.test\.mjs$/.test(proof.file)||typeof proof.name!=='string'||!proof.name.trim())throw new Error('Invalid named unit proof');
  const file=resolve(root,proof.file);if(!existsSync(file))throw new Error('Referenced unit proof file missing');
  if(!discovered.has(file))throw new Error('Referenced unit proof does not run under npm test');
  const env={...process.env,FORCE_COLOR:'0',NO_COLOR:'1'};delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',`^${escaped(proof.name)}$`,file],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,env});
  if(result.status!==0||!new RegExp(`^ok \\d+ - ${escaped(proof.name)}$`,'m').test(result.stdout??''))throw new Error(`Referenced unit proof did not pass: ${key}`);
  passed.add(key);
 }
 return passed;
}
export const secretUnitProof={file:'test/repl-parity/secrets.test.mjs',name:'synthetic wrapper scenarios prove delivery, refusal-before-read and value-free errors without the owner store'};
// Malformed envelopes cannot be emitted by the real browser client. Mac native wrappers remain unit-boundary
// obligations until #117; reachable browser inputs need M3 selected-client proof, Linux native inputs M4 proof.
export function secretProofContract(row){
 if(row.kind!=='secret')return row;
 const tail=row.id.slice('secret/'.length),original=`secrets/${tail}`;
 if(tail.endsWith('/errors/worker-rejection-message-only'))return {...row,liveRequired:true};
 const unitOnly=/^browser\/refuse\/(coerced-method|extra-fields)$/.test(tail)||tail.startsWith('native/darwin/');
 const live=tail.replace(/^(browser|native)\//,'$1-live/');
 return {...row,cases:unitOnly?[original]:[original,`secrets/${live}`],unitCases:[original],unitProof:secretUnitProof,liveRequired:!unitOnly};
}
