// The harness owns exactly these resources; cleanup never targets a resident agent, Chrome or another host.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:net';
import {readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {quote,remoteCommand,execute} from './topology.mjs';
export async function fixtureProcess({device,checkout,port=48732}) {
  let localPort=port;
  if(device!=='local') {
    const socket=createServer(); await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
    localPort=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  }
  const cmd=device==='local' ? {command:process.execPath,args:[join(checkout,'test/browser-parity/fixture/serve.mjs'),'--port',String(port)]}
    : remoteCommand(device,`cd ${quote(checkout)} && exec node test/browser-parity/fixture/serve.mjs --port ${port}`);
  if(device!=='local') cmd.args.splice(2,0,'-o','ExitOnForwardFailure=yes','-L',`127.0.0.1:${localPort}:127.0.0.1:${port}`);
  const child=spawn(cmd.command,cmd.args,{stdio:['pipe','pipe','pipe']});child.stderr.resume();
  const closed=new Promise(resolve=>child.once('close',resolve));
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Fixture readiness timed out')),15000);
      const lines=createInterface({input:child.stdout});
      const finish=e=>{clearTimeout(timer);lines.close();e?reject(e):resolve();};
      child.once('error',finish);child.once('exit',()=>finish(new Error('Fixture exited before readiness')));
      lines.on('line',line=>{try{if(JSON.parse(line).ready)finish();}catch{}});
    });
  } catch(e) {child.kill('SIGTERM');throw e;}
  return {url:`http://127.0.0.1:${localPort}`,browserURL:`http://127.0.0.1:${port}`,async close(){child.stdin.end();let timer;await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGTERM');resolve();},3000);})]);clearTimeout(timer);}};
}
export function traceControl({device,home,path}) {
  const config=join(home,'state/host-trace.json');
  if(device==='local') {
    mkdirSync(join(home,'state'),{recursive:true});
    writeFileSync(config,JSON.stringify({path}),{flag:'wx',mode:0o600});
    return {read:async()=>{try{return readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}},close:()=>{rmSync(config,{force:true});rmSync(path,{force:true});}};
  }
  const node=code=>execute(remoteCommand(device,`node -e ${quote(code)}`));
  node(`const f=require('fs'); f.mkdirSync(${JSON.stringify(join(home,'state'))},{recursive:true});f.writeFileSync(${JSON.stringify(config)},${JSON.stringify(JSON.stringify({path}))},{flag:'wx',mode:384});`);
  return {read:async()=>JSON.parse(node(`const f=require('fs');let s='';try{s=f.readFileSync(${JSON.stringify(path)},'utf8')}catch(e){if(e.code!=='ENOENT')throw e;}console.log(JSON.stringify(s.trim().split('\n').filter(Boolean).map(JSON.parse)));`)),close:()=>node(`const f=require('fs');f.unlinkSync(${JSON.stringify(config)});f.rmSync(${JSON.stringify(path)},{force:true});`)};
}
