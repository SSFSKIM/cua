import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {Writable} from 'node:stream';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {ownHostNode} from '../../src/runtime/launch.mjs';
import {isDeepStrictEqual} from 'node:util';
const checkout=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export function executionFacts({source}) {
 const runtime=resolveRuntime({home:source});const git=args=>execFileSync('git',args,{cwd:checkout,encoding:'utf8'}).trim();
 const runtimeNode=execFileSync(runtime.paths.node,['--version'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}}).trim();
 return {checkout,home:runtime.home,commit:git(['rev-parse','HEAD']),dirty:git(['status','--porcelain'])!=='',release:runtime.release,node:process.version,runtimeNode,platform:process.platform,ownNode:ownNodeFacts()};
}
// The own host's Node as a launch from this environment resolves it (src/runtime/launch.mjs ownHostNode: CUA_NODE, the
// running node, node on PATH), with the version that executable itself reports; null where none qualifies.
export function ownNodeFacts(ambient=process.env){
 let path;try{path=ownHostNode({ambient});}catch{return null;}
 return {path,version:execFileSync(path,['--version'],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}}).trim()};
}
export function assertPreparedFacts(expected,actual){
 if(!expected||!actual)throw new Error('Missing execution provenance');
 if(actual.dirty!==false)throw new Error('Remote checkout is dirty; execution provenance refused');
 for(const key of ['checkout','home','commit','release','node','platform',...(expected.runtimeNode?['runtimeNode']:[])])if(actual[key]!==expected[key])throw new Error(`Stale preparation: execution provenance changed (${key})`);
 if(Object.hasOwn(expected,'ownNode')&&!isDeepStrictEqual(actual.ownNode??null,expected.ownNode??null))throw new Error('Stale preparation: execution provenance changed (ownNode)');
}
// Fixture-only initialize metadata, not a host marker and not an alteration of serverInfo or tool responses.
export function attestedOutput(output,facts){
 let pending='';return new Writable({write(chunk,encoding,done){try{
  pending+=chunk.toString();let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line.trim())continue;
   const message=JSON.parse(line);if(message.result?.serverInfo&&message.result.protocolVersion)message.result._meta={...message.result._meta,'cua/parityExecution':facts};output.write(JSON.stringify(message)+'\n');
  }done();
 }catch(error){done(error);}}});
}
