// Record the real production surface separately from M0's no-services/base tools.json.
// Production overrides come from vendor cua-repl.mjs (chatgpt-26.928.40906), buildLaunch retains that launcher.
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,serveCommand} from '../browser-parity/topology.mjs';
import {AttestedConnections} from './runner.mjs';
import {validateAttestations} from './compare.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
export function toolDifferences(left,right){
 const out=[];
 function walk(a,b,path,hasA=true,hasB=true){
  if(hasA&&hasB&&isDeepStrictEqual(a,b))return;
  if(hasA&&hasB&&a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
   for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())walk(a[key],b[key],path?`${path}.${key}`:key,Object.hasOwn(a,key),Object.hasOwn(b,key));
  }else out.push({field:path,left:hasA?{present:true,value:a}:{present:false},right:hasB?{present:true,value:b}:{present:false}});
 }
 walk(left,right,'');return out;
}
export async function main(argv=process.argv.slice(2)){
 const {values:v,positionals:[action,a,b]}=parseArgs({args:argv,allowPositionals:true,options:{device:{type:'string',default:'mini'},host:{type:'string',default:'vendor'},out:{type:'string'}}});
 if(action==='diff'){
  const left=read(join(a,'meta.json')),right=read(join(b,'meta.json'));validateAttestations(left);validateAttestations(right);
  for(const key of ['platform','service','surfaces','lane'])if(!isDeepStrictEqual(left[key],right[key]))throw new Error(`Tools configuration differs: ${key}`);
  const differences=toolDifferences(read(join(a,'tools.json')),read(join(b,'tools.json')));console.log(JSON.stringify({ok:!differences.length,differences},null,2));if(differences.length)process.exitCode=1;return;
 }
 if(action!=='record'||!v.out||!['mini','cua-linux'].includes(v.device)||!['vendor','cua'].includes(v.host))throw new Error('Usage: tools.mjs record --device mini --host vendor|cua --out DIR | diff LEFT RIGHT');
 const prepared=read(join(root,'.doperpowers/sde/repl-parity',`${v.device}.json`)),out=resolve(v.out);mkdirSync(out,{recursive:false});
 const meta={...prepared,host:v.host,observedHost:v.host,service:'cua',surfaces:['browser'],lane:'production',complete:false};
 const pool=new AttestedConnections(v.host);
 try{
  const command=serveCommand({...prepared,service:'cua',replHost:v.host});command.expectedFacts=prepared;
  const client=await pool.open(command),tools=await client.request('tools/list');save(join(out,'tools.json'),tools);
  const result=await client.call('js',{code:'nodeRepl.write("production-host-proof");',title:'Tools contract host attestation',timeout_ms:60000});
  if(result.isError)throw new Error('Production host attestation cell failed');
  const ended=await client.call('end_task');if(ended.isError)throw new Error('Production tools cleanup failed');
  const basePath=join(root,'docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/tools.json');
  save(join(out,'base-to-effective.json'),{base:'docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/tools.json',source:'Production vendor cua-repl.mjs tool-description overrides; src/mcp/surface.mjs with device tools enabled by real serve. This is a base-to-effective observation, not a parity allowance.',differences:toolDifferences(read(basePath),tools)});
  await pool.close();Object.assign(meta,pool.metadata(),{complete:true});validateAttestations(meta);
 }finally{if(!meta.complete)await pool.close();Object.assign(meta,pool.metadata());save(join(out,'meta.json'),meta);}
 console.log(JSON.stringify({out,complete:meta.complete}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
