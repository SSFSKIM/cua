import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {records} from './read.mjs';
const [root,dest]=process.argv.slice(2),ids=[];
for await(const {row:r,config} of records(root)){
 if(config.browser!=='cft'||config.phase!=='partial'||r.part!=='partial'||!r.valid||r.problem)continue;
 const p=r.priorKeyControl;
 if(p?.confirmed!==true||p.effect.text!=='Old draft sentence goes here.'||JSON.stringify(p.effect.selection)!=='[0,29]'||r.expected?.final!==r.text||r.samples?.length!==4)throw Error('unproven resumable partial cell '+r.id);
 ids.push(r.id);
}
if(new Set(ids).size!==ids.length)throw Error('duplicate completed IDs');
mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,JSON.stringify({sourceRun:'42758470642',protocol:'settled-select-all partial controls only; no old engine-click rate cells are reused',completedIds:ids},null,2)+'\n');
console.log('Resumable CFT settled-selection partial cells',ids.length,'written',dest);
