// Production derives lock and usage paths from the socket's directory (Server.swift: directory = parent of the socket),
// so every engine under test needs a private directory of its own; a shared one would make fix and main contend for one lock.
import {mkdirSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';
export const SUN_PATH_MAX=104;// Darwin sockaddr_un.sun_path capacity; a path must be shorter than this
export function engineSockets(base,names){
 const sockets={};
 for(const name of names){
  const dir=join(base,'q360-'+name),socket=join(dir,'engine.sock');
  if(Buffer.byteLength(socket)>=SUN_PATH_MAX)throw Error('socket path too long for Darwin ('+Buffer.byteLength(socket)+' bytes): '+socket);
  mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);rmSync(socket,{force:true});sockets[name]=socket;
 }
 return sockets;
}
