import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compareParityRuns} from '../../scripts/repl-parity/compare.mjs';
const allowance=[{reason:'Source-pinned own host identity',cases:['fixture'],cells:['cell'],field:'meta.cua/replHost',vendor:{present:false},cua:{present:true,value:{host:'cua',versionFrom:'attested-source'}}}];
function run(host,version,commit){
 const marker={host:'cua',version};return {meta:{complete:true,host,commit,hostVersion:version,connections:['c1'],caseIds:['fixture'],caseCells:{fixture:['cell']},hostAttestations:[{connection:'c1',host,serverInfo:{name:host==='cua'?'cua-repl-host':'rmcp',version},executionFacts:{commit,dirty:false,ownNode:{path:'/device/node',version:'v24.18.0'}},_meta:host==='cua'?{'cua/replHost':marker}:null}]},tools:{tools:[]},rows:[{case:'fixture',cell:'cell',ok:true,content:[{type:'text',text:'same'}],meta:host==='cua'?{'cua/replHost':{...marker}}:{},isError:false},{case:'fixture',assertion:{ok:true}}]};
}
test('identity allowances follow each recorded source commit, never the comparator checkout version',()=>{
 const repo=mkdtempSync('/tmp/cua-identity-source-');const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}}).trim();
 try{
  git(['init','-q']);mkdirSync(join(repo,'src/repl-host'),{recursive:true});
  for(const version of ['0.2.0','0.3.0']){
   writeFileSync(join(repo,'src/repl-host/identity.mjs'),`export const REPL_HOST_VERSION = '${version}';\n`);git(['add','.']);git(['commit','-qm',version]);const commit=git(['rev-parse','HEAD']);
   const vendor=run('vendor','1.5.0',commit),own=run('cua',version,commit);
   const comparison=compareParityRuns(vendor,own,{expected:allowance,sourceRepo:repo});assert.equal(comparison.ok,true,JSON.stringify(comparison));
   const wrong=structuredClone(own);wrong.rows[0].meta['cua/replHost'].version='9.9.9';assert.equal(compareParityRuns(vendor,wrong,{expected:allowance,sourceRepo:repo}).ok,false);
   const invented=run('cua','9.9.9',commit);assert.throws(()=>compareParityRuns(vendor,invented,{expected:allowance,sourceRepo:repo}),/source|version/i);
   const stale=structuredClone(own);stale.meta.hostAttestations[0].executionFacts.commit='f'.repeat(40);assert.throws(()=>compareParityRuns(vendor,stale,{expected:allowance,sourceRepo:repo}),/source|commit/i);
  }
 }finally{rmSync(repo,{recursive:true,force:true});}
});
