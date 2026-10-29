// The managed parity preparation's archive cache: the pinned archives `cua install` takes (the vendor's ChatGPT
// archive, the official Node tarball and, on Linux, cua's sandbox helper, #115 M3), fetched once per preparation with
// the installer's own download and verification (the pin's URL, length cap and SHA-256), kept under the prepared home so
// its removal removes them. Every managed fixture still runs the real release install into its fresh scratch home, from
// these local copies (`cua install --archive … --node-archive … [--sandbox-helper …]`, installArgs, which re-verifies
// each against its pin); a fixture never downloads, so an absent or damaged cache is a preparation fault: clean up and
// prepare again. Once cua's Linux engine is pinned (#171, runtime/engine/linux-engine.json), its asset for the machine's
// arch is cached too, verified by its hash under the installer's length bound, and a fixture places it in its scratch
// home before installing (placeCachedEngine), so the install's engine step finds the pinned engine already in place.
import {execFileSync} from 'node:child_process';
import {chmodSync,copyFileSync,lstatSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {basename,dirname,isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {download,verifyArchive} from '../../src/runtime/install.mjs';
import {loadPins,selectPin} from '../../src/runtime/manifest.mjs';
import {loadNodePins,nodeDistName,selectNodePin} from '../../src/runtime/managed-node.mjs';
import {helperAsset,loadHelperPin} from '../../src/sandbox/linux.mjs';
import {engineAsset,linuxEnginePath,loadEnginePin} from '../../src/runtime/linux-engine.mjs';

// The installer's bound on an engine download (src/runtime/install.mjs): the pin names no length.
export const ENGINE_MAX_BYTES=64*1024*1024;

const SCRIPT=fileURLToPath(import.meta.url);
export const archiveCacheDir=home=>join(home,'parity-archives');

// {vendor, node, helper?, engine?}: {file, archive: the pin's own {url, length, sha256}} for this host's install; `helper`
// on Linux only, `engine` on Linux once the engine is pinned ({url, sha256, maxLength}: hash-pinned, length-bounded).
export function pinnedArchives({host={platform:process.platform,arch:process.arch},pins=loadPins(),nodePins=loadNodePins(),helperPin=host.platform==='linux'?loadHelperPin():null,enginePin=host.platform==='linux'?loadEnginePin():null}={}){
 const vendor=selectPin(pins,host),node=selectNodePin(nodePins,host);
 if(!node)throw new Error(`No Node is pinned for ${host.platform}-${host.arch}; managed parity preparation installs the pinned Node`);
 return {
  vendor:{file:`${vendor.release}-${vendor.platform}-${vendor.arch}.${vendor.archive.format??'zip'}`,archive:vendor.archive},
  node:{file:`${nodeDistName(node)}.tar.gz`,archive:node.archive},
  ...(helperPin?{helper:{file:`codex-linux-sandbox-${helperPin.upstreamTag}-linux-${host.arch}`,archive:helperAsset(helperPin,host.arch)}}:{}),
  ...(host.platform==='linux'&&enginePin?(asset=>({engine:{file:basename(new URL(asset.url).pathname),archive:{url:asset.url,sha256:asset.sha256,maxLength:ENGINE_MAX_BYTES}}}))(engineAsset(enginePin,host.arch)):{}),
 };
}

// `cua install`'s arguments for the cached archives (cachedArchives). The engine is not one: placeCachedEngine puts it in
// place first.
export const installArgs=archives=>['install','--archive',archives.vendor,'--node-archive',archives.node,...(archives.helper?['--sandbox-helper',archives.helper]:[])];

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
  const sized=archive.length===undefined?stat?.size>0&&stat.size<=archive.maxLength:stat?.size===archive.length;
  if(!stat?.isFile()||!sized)throw new Error(`The prepared archive cache ${dir} has no pinned ${file}; managed fixtures never download: run cleanup-prepared, then prepare again`);
  return [role,path];
 }));
}

// The cached engine `file` placed in the cua home `home` as `cua install` and selection find it, executable -> its path.
export function placeCachedEngine(home,file){
 const path=linuxEnginePath(home);
 mkdirSync(dirname(path),{recursive:true,mode:0o700});copyFileSync(file,path);chmodSync(path,0o755);
 return path;
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
