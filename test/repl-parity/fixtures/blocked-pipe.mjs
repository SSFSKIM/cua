import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {fileURLToPath} from 'node:url';
export async function blockedPipe(path){
 const child=spawn(process.execPath,[fileURLToPath(new URL('./backlog-peer.mjs',import.meta.url)),path],{stdio:['ignore','pipe','ignore']});
 const sockets=[],exited=new Promise(resolve=>child.once('exit',resolve));let timer;
 const close=async()=>{for(const socket of sockets)socket.destroy();child.kill('SIGTERM');await exited;};
 try{
  await Promise.race([new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(new Error('Backlog fixture exited before readiness')));}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Backlog fixture readiness timed out')),3000);})]).finally(()=>clearTimeout(timer));
  for(let n=0;n<256;n++){
   const socket=createConnection(path);sockets.push(socket);
   const connected=await new Promise((resolve,reject)=>{const t=setTimeout(()=>resolve(false),150);socket.once('connect',()=>{clearTimeout(t);resolve(true);});socket.once('error',e=>{clearTimeout(t);if(['ECONNREFUSED','EAGAIN'].includes(e.code))resolve(false);else reject(e);});});
   if(!connected){socket.destroy();return {path,close};}
  }
  throw new Error('Could not saturate harness socket accept queue');
 }catch(e){await close();throw e;}
}
