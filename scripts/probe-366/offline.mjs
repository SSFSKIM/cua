// Offline validation only: syntax/type checks and synthetic readers. Never executes a GUI binary.
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {dirname,join,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {render} from './patch.mjs';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
function run(bin,args){const r=spawnSync(bin,args,{stdio:'inherit'});if(r.status!==0)throw Error(bin+' failed: '+r.status);}
for(const name of readdirSync(dir).filter(n=>n.endsWith('.mjs')))run(process.execPath,['--check',join(dir,name)]);
run(process.execPath,['--check',join(dir,'fixture/main.cjs')]);
for(const name of readdirSync(join(dir,'fixture')).filter(n=>n.endsWith('.mjs')))run(process.execPath,['--check',join(dir,'fixture',name)]);
run(process.execPath,['--test',...readdirSync(dir).filter(n=>n.endsWith('.test.mjs')).map(n=>join(dir,n))]);
run(process.execPath,[join(dir,'build-fixture.mjs')]);
mkdirSync(join(dir,'.offline'),{recursive:true});const scratch=mkdtempSync(join(dir,'.offline/parse-'));
try {
 const paths=[];
 for(const [path,text] of render(root)){const output=join(scratch,basename(path));writeFileSync(output,text);paths.push(output);}
 run('swiftc',['-frontend','-parse',...paths,join(dir,'trace.swift'),join(dir,'named.swift')]);
 run('swiftc',['-swift-version','6','-typecheck',join(dir,'trace.swift')]);
 run('swiftc',['-typecheck',join(dir,'tool.swift')]);
} finally {rmSync(scratch,{recursive:true,force:true});}
console.log('Offline checks passed; no GUI binary was run. Hosted engine build and live measurements are still unverified.');
