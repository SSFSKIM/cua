// Isolated services and owned Unix peers. No native helper, Chrome, account API or real secret store.
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import {createServer} from 'node:net';
import {blockedPipe} from './blocked-pipe.mjs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function fixtureServices({timeoutPipe=false,errorPipe=false,nativeSecrets=false}={}){
 const dir=realpathSync(mkdtempSync('/tmp/'+(process.env.CUA_PARITY_SCRATCH_PREFIX??'cua-')+'svc-')),outside=join(dir,'outside.mjs'),link=join(dir,'trusted','escape.mjs');
 mkdirSync(join(dir,'trusted'));writeFileSync(outside,'export const escaped = true;\n');symlinkSync(outside,link);
 const sockets=new Set(),peers=[];let blocked;
 const listen=async(name,handle)=>{
  const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});handle(socket);});peers.push(server);
  const path=join(dir,name);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});return path;
 };
 const close=async()=>{await blocked?.close();for(const socket of sockets)socket.destroy();for(const peer of peers)if(peer.listening)await new Promise(r=>peer.close(r));rmSync(dir,{recursive:true,force:true});};
 try{
  const pipe=await listen('echo.sock',socket=>socket.on('data',bytes=>socket.write(bytes)));
  const errorPath=errorPipe?await listen('abort.sock',socket=>socket.once('data',()=>socket.destroy())):null;
  blocked=timeoutPipe?await blockedPipe(join(dir,'blocked.sock')):null;
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  return {services:nativeSecrets?{sky:fileURLToPath(new URL('./native-secret-service.mjs',import.meta.url))}:{fixture:fileURLToPath(new URL('./trusted-service.mjs',import.meta.url))},roots:[root,join(dir,'trusted')],env:{...(nativeSecrets?{PARITY_NATIVE_SECRET_FIXTURE:'1'}:{}),PARITY_WORKER_ONLY:'worker-value',PARITY_CELL_VISIBLE:'cell-value',PARITY_OUTSIDE_URL:pathToFileURL(outside).href,PARITY_SYMLINK_URL:pathToFileURL(link).href,PARITY_PIPE:pipe,...(errorPath?{PARITY_PIPE_ERROR:errorPath,PARITY_FIXTURE_WIRE_INJECTION:'1'}:{}),PARITY_PIPE_MISSING:join(dir,'missing.sock'),...(blocked?{PARITY_PIPE_BLOCKED:blocked.path}:{})},close};
 }catch(error){await close();throw error;}
}
