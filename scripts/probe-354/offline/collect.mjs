// Build primary evidence without pooling the old engine-click-contaminated key controls.
// node collect.mjs <output> <old full-run artifacts> <clean continuation artifacts> [...]
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,basename,dirname} from 'node:path';
import {records} from './read.mjs';
const [out,old,...clean]=process.argv.slice(2);if(!out||!old||!clean.length)throw Error('output, old artifacts and clean continuation required');
mkdirSync(out,{recursive:true});const groups=new Set(),seen=new Set(),manifest={sources:[old,...clean],included:0,excludedOld:0,groups:[]};
for(const root of [old,...clean])for await(const {row:r,config,source,lineNumber} of records(root)){
 const keep=root!==old||(config.browser==='cft'&&config.phase==='partial'&&r.part==='partial'&&r.valid&&r.priorKeyControl?.confirmed&&r.expected?.final===r.text)||(config.browser==='native'&&config.phase==='partial');
 if(!keep){manifest.excludedOld++;continue}
 const key=config.browser+'|'+r.id;if(seen.has(key))throw Error('duplicate primary cell '+key);seen.add(key);
 const shard=[basename(root),basename(dirname(source))].join('-').replace(/[^a-z0-9_-]+/gi,'_');
 const dir=join(out,shard);if(!groups.has(shard)){groups.add(shard);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'rows.jsonl'),'');writeFileSync(join(dir,'config.json'),JSON.stringify({...config,selectedFrom:root,primaryProtocol:root===old?'retained proven settled-selection partial controls':'click-free key preparation; click-order is a separate scene'},null,2));manifest.groups.push(shard)}
 appendFileSync(join(dir,'rows.jsonl'),JSON.stringify({...r,originalSource:source,originalLine:lineNumber})+'\n');manifest.included++;
}
writeFileSync(join(out,'selection.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
