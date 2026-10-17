// The managed parity preparation's archive cache: the two pinned archives `cua install` takes (the vendor's ChatGPT
// archive and the official Node tarball), fetched once per preparation with the installer's own download and
// verification (the pin's URL, length cap and SHA-256), kept under the prepared home so its removal removes them.
// Every managed fixture still runs the real release install into its fresh scratch home, from these local copies
// (`cua install --archive … --node-archive …`, which re-verifies both against the pins); a fixture never downloads,
// so an absent or damaged cache is a preparation fault: clean up and prepare again.
import {execFileSync} from 'node:child_process';
import {lstatSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {download,verifyArchive} from '../../src/runtime/install.mjs';
import {loadPins,selectPin} from '../../src/runtime/manifest.mjs';
import {loadNodePins,nodeDistName,selectNodePin} from '../../src/runtime/managed-node.mjs';

const SCRIPT=fileURLToPath(import.meta.url);
export const archiveCacheDir=home=>join(home,'parity-archives');

// {vendor, node}: {file, archive: the pin's own {url, length, sha256}} for this host's install.
export function pinnedArchives({host={platform:process.platform,arch:process.arch},pins=loadPins(),nodePins=loadNodePins()}={}){
 const vendor=selectPin(pins,host),node=selectNodePin(nodePins,host);
 if(!node)throw new Error(`No Node is pinned for ${host.platform}-${host.arch}; managed parity preparation installs the pinned Node`);
 return {
  vendor:{file:`${vendor.release}-${vendor.platform}-${vendor.arch}.${vendor.archive.format??'zip'}`,archive:vendor.archive},
  node:{file:`${nodeDistName(node)}.tar.gz`,archive:node.archive},
 };
}

// Preparation only, into a home that has no cache yet. Each archive lands under its name only once verified.
export async function fetchArchives(home,{pins=pinnedArchives(),fetch=globalThis.fetch}={}){
 const dir=archiveCacheDir(home);
 mkdirSync(dir,{mode:0o700});
 for(const {file,archive} of Object.values(pins)){
  const partial=join(dir,`.${file}.partial`);
  try{await download(archive,partial,fetch);await verifyArchive(partial,archive);}
  catch(error){rmSync(partial,{force:true});throw error;}
  renameSync(partial,join(dir,file));
 }
 return cachedArchives(home,{pins});
}

// The cached paths a fixture installs from. Cheap presence checks only: the installer verifies the bytes.
export function cachedArchives(home,{pins=pinnedArchives()}={}){
 const dir=archiveCacheDir(home);
 return Object.fromEntries(Object.entries(pins).map(([role,{file,archive}])=>{
  const path=join(dir,file);let stat;try{stat=lstatSync(path);}catch{stat=null;}
  if(!stat?.isFile()||stat.size!==archive.length)throw new Error(`The prepared archive cache ${dir} has no pinned ${file}; managed fixtures never download: run cleanup-prepared, then prepare again`);
  return [role,path];
 }));
}

// Synchronous face for the (synchronous) device preparation: the download runs in one child of this module.
export function prepareArchiveCache(home,{pins,run=execFileSync}={}){
 run(process.execPath,[SCRIPT,'fetch',home],{stdio:['ignore','ignore','pipe'],timeout:900000,maxBuffer:1024*1024});
 return cachedArchives(home,pins?{pins}:{});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [op,home]=process.argv.slice(2);
 try{
  if(op!=='fetch'||typeof home!=='string'||!isAbsolute(home))throw new Error('usage: archive-cache.mjs fetch <absolute prepared home>');
  await fetchArchives(home);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
