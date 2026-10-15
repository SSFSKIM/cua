// Record the real production surface separately from M0's no-services/base tools.json.
// Production overrides come from vendor cua-repl.mjs (chatgpt-26.928.40906), buildLaunch retains that launcher.
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,serveCommand} from '../browser-parity/topology.mjs';
import {AttestedConnections} from './runner.mjs';
import {attestedSourceVersion} from './source-identity.mjs';
import {validateAttestations,validateExpected} from './compare.mjs';
import {toolDifferences,compareEffectiveTools} from './tool-contract.mjs';
export {toolDifferences} from './tool-contract.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
function baseDifferenceSource(field){
 const source='chatgpt-26.928.40906/cua_node/@oai/cua-repl/';
 if(field==='tools.0.description')return source+'dist/lib/js/oai_js_cua_repl/src/launch.js:33-51,75 (enabled-surface description composition)';
 if(field==='tools.0.inputSchema.properties.code.description')return source+'dist/lib/js/oai_js_cua_repl/src/launch.js:52-54,75; instructions/code.md:1';
 if(field==='tools.1.description')return source+'dist/lib/js/oai_js_cua_repl/src/launch.js:56-57,75; instructions/reset.md:1';
 if(field==='tools.5'||field==='tools.6')return 'src/mcp/server.mjs:serve enables device tools; src/mcp/surface.mjs:DEVICES_LIST_TOOL/DEVICES_USE_TOOL; M0 no-services openConnection omits devices';
 return 'UNEXPLAINED: investigate before accepting this field';
}
export async function main(argv=process.argv.slice(2)){
 const {values:v,positionals:[action,a,b]}=parseArgs({args:argv,allowPositionals:true,options:{device:{type:'string',default:'mini'},host:{type:'string',default:'vendor'},out:{type:'string'},expected:{type:'string'}}});
 if(action==='diff'){
  const left=read(join(a,'meta.json')),right=read(join(b,'meta.json'));validateAttestations(left);validateAttestations(right);
  for(const meta of [left,right])if(meta.host==='cua')attestedSourceVersion(meta);
  for(const key of ['platform','service','surfaces','lane'])if(!isDeepStrictEqual(left[key],right[key]))throw new Error(`Tools configuration differs: ${key}`);
  const expected=v.expected?read(v.expected):[];validateExpected(expected);
  if(expected.length&&(left.host!=='vendor'||right.host!=='cua'))throw new Error('Tools allowances require vendor control followed by own host');
  const result=compareEffectiveTools(read(join(a,'tools.json')),read(join(b,'tools.json')),{expected:expected.filter(e=>e.kind==='tools-description'),platform:left.platform});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;
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
  save(join(out,'base-to-effective.json'),{base:'docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/tools.json',source:'Production vendor cua-repl.mjs tool-description overrides; src/mcp/surface.mjs with device tools enabled by real serve. This is a base-to-effective observation, not a parity allowance.',differences:toolDifferences(read(basePath),tools).map(d=>({...d,source:baseDifferenceSource(d.field)}))});
  await pool.close();Object.assign(meta,pool.metadata(),{hostVersion:pool.hostAttestations[0].serverInfo.version,apiVersion:prepared.release,complete:true});validateAttestations(meta);if(meta.host==='cua')attestedSourceVersion(meta);
 }finally{if(!meta.complete)await pool.close();Object.assign(meta,pool.metadata());save(join(out,'meta.json'),meta);}
 console.log(JSON.stringify({out,complete:meta.complete}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
