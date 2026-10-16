// M5 release-path oracle. The installer owns the pin/pointer format; this harness checks the answering executable,
// not a guessed pointer file or a copy of the production selection table.
import {execFileSync} from 'node:child_process';
import {descendants} from './processes.mjs';
import {isAbsolute,resolve,join} from 'node:path';
export function assertManagedNode({home,ownNode}={}){
 if(typeof home!=='string'||!isAbsolute(home))throw new Error('M5 managed Node proof requires the answering scratch home');
 const root=join(resolve(home),'node')+'/';
 if(typeof ownNode?.path!=='string'||!isAbsolute(ownNode.path)||!resolve(ownNode.path).startsWith(root)||!/^v24\./.test(ownNode.version??''))throw new Error('M5 release proof requires the managed Node 24 installed under this scratch CUA_HOME; run cua install (task 1b must be present)');
 return ownNode;
}
export function nodeEnvironment(ambient,explicitOverride){
 const env={...ambient};delete env.CUA_NODE;
 if(explicitOverride!==undefined){if(typeof explicitOverride!=='string'||!isAbsolute(explicitOverride))throw new Error('Diagnostic Node override must be absolute');env.CUA_NODE=explicitOverride;}
 return env;
}
export const nodeVersion=path=>execFileSync(path,['--version'],{encoding:'utf8',timeout:5000,env:{PATH:'/usr/bin:/bin'}}).trim();
export function observeLaunchNode(launch,versionOf=nodeVersion){return {path:launch.command,version:versionOf(launch.command)};}
export function verifyOwnedHostNode(rows,root,{ownNode,entry}){
 const candidates=descendants(rows,root).filter(row=>row.command===`${ownNode.path} ${entry}`||row.command?.startsWith(`${ownNode.path} ${entry} `));
 if(candidates.length!==1)throw new Error('Expected exactly one owned host using the attested Node');
 return {...ownNode,pid:candidates[0].pid};
}
