// Harness cleanup, never imported by the kernel. Request is the private attestation from a successful chooser case.
// CLI reads one JSON proof from stdin; stdout is only true/false, exit status 0/1. Paths never enter argv or logs.
import {constants} from 'node:fs';
import {lstat,realpath,open,unlink} from 'node:fs/promises';
import {isAbsolute,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixtureDownloadNamePattern} from './fixture-downloads.mjs';
const expected=Buffer.from('parity download\n');
const decimal=value=>typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value);
const same=(stat,proof)=>stat.isFile()&&!stat.isSymbolicLink()&&stat.size===16n&&stat.dev.toString()===proof.dev&&stat.ino.toString()===proof.ino;

export async function cleanupDownload(proof){
 let file;
 try{
  if(!proof||typeof proof!=='object'||Array.isArray(proof)||proof.kind!=='repl-parity-fixture-download'||proof.newHandle!==true||proof.uploadAcknowledged!==true||proof.size!==16)return false;
  if(typeof proof.path!=='string'||!isAbsolute(proof.path)||typeof proof.realPath!=='string'||!isAbsolute(proof.realPath)||typeof proof.basename!=='string'||!fixtureDownloadNamePattern.test(proof.basename)||!decimal(proof.dev)||!decimal(proof.ino))return false;
  if(basename(proof.path)!==proof.basename||basename(proof.realPath)!==proof.basename)return false;
  if(await realpath(proof.path)!==proof.realPath||!same(await lstat(proof.path,{bigint:true}),proof))return false;
  file=await open(proof.path,constants.O_RDONLY|constants.O_NOFOLLOW);
  if(!same(await file.stat({bigint:true}),proof))return false;
  const bytes=Buffer.alloc(expected.length+1),read=await file.read(bytes,0,bytes.length,0);
  if(read.bytesRead!==expected.length||!bytes.subarray(0,read.bytesRead).equals(expected))return false;
  if(!same(await lstat(proof.path,{bigint:true}),proof))return false;
  await unlink(proof.path);return true;
 }catch{return false;}
 finally{if(file)await file.close().catch(()=>{});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let ok=false;
 try{
  if(process.argv.length!==2)throw new Error('stdin only');
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>8192)throw new Error('request too large');chunks.push(chunk);}
  ok=await cleanupDownload(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 }catch{}
 process.stdout.write(JSON.stringify(ok)+'\n');process.exitCode=ok?0:1;
}
