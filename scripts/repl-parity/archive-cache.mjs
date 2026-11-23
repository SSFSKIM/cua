// The managed parity preparation's archive cache: the pinned archives `cua install` takes (the vendor's ChatGPT
// archive, the official Node tarball and, on Linux, cua's sandbox helper, #115 M3), fetched once per preparation with
// the installer's own download and verification (the pin's URL, length cap and SHA-256), kept under the prepared home so
// its removal removes them. Every managed fixture still runs the real release install into its fresh scratch home, from
// these local copies (`cua install --archive … --node-archive … [--sandbox-helper …]`, installArgs, which re-verifies
// each against its pin); a fixture never downloads, so an absent or damaged cache is a preparation fault: clean up and
// prepare again. Once cua's Linux engine is pinned (#171, runtime/engine/linux-engine.json), its asset for the machine's
// arch is cached too, verified by its hash under the installer's length bound, and a fixture places it in its scratch
// home before installing (placeCachedEngine), so the install's engine step finds the pinned engine already in place.
// On Linux cua's own runtime is the ModuleTree (#171 M6a, src/runtime/module-tree.mjs): each tarball of the lock's
// closure for the host is cached as the installer fetches it (its canonical URL, no redirect, its pinned length,
// checked against its SHA-512), in one directory under the names `--modules-dir` reads, which every install takes.
import {execFileSync} from 'node:child_process';
import {chmodSync,copyFileSync,lstatSync,mkdirSync,readFileSync,renameSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename,dirname,isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {download,verifyArchive} from '../../src/runtime/install.mjs';
import {loadPins,selectPin} from '../../src/runtime/manifest.mjs';
import {loadNodePins,nodeDistName,selectNodePin} from '../../src/runtime/managed-node.mjs';
import {helperAsset,loadHelperPin} from '../../src/sandbox/linux.mjs';
import {engineAsset,linuxEnginePath,loadEnginePin} from '../../src/runtime/linux-engine.mjs';
import {loadModuleLock,loadModuleProvenance,localTarballName,moduleHost,pinnedClosure} from '../../src/runtime/module-tree.mjs';

// The installer's bound on an engine download (src/runtime/install.mjs): the pin names no length.
export const ENGINE_MAX_BYTES=64*1024*1024;

const SCRIPT=fileURLToPath(import.meta.url);
export const archiveCacheDir=home=>join(home,'parity-archives');

// {vendor, node, helper?, engine?, modules?}: {file, archive: the pin's own {url, length, sha256}} for this host's
// install; `helper` on Linux only, `engine` on Linux once the engine is pinned ({url, sha256, maxLength}: hash-pinned,
// length-bounded), `modules` on Linux, {dir, packages: [{file, archive: {url, length, integrity}}]}: the module tree's
// tarballs for the host's closure (`modulePins` {lock, provenance}, the checked-in ones), each once.
export function pinnedArchives({host={platform:process.platform,arch:process.arch},pins=loadPins(),nodePins=loadNodePins(),helperPin=host.platform==='linux'?loadHelperPin():null,enginePin=host.platform==='linux'?loadEnginePin():null,
 modulePins=host.platform==='linux'?{lock:loadModuleLock(),provenance:loadModuleProvenance()}:null}={}){
 const vendor=selectPin(pins,host),node=selectNodePin(nodePins,host);
 if(!node)throw new Error(`No Node is pinned for ${host.platform}-${host.arch}; managed parity preparation installs the pinned Node`);
 return {
  vendor:{file:`${vendor.release}-${vendor.platform}-${vendor.arch}.${vendor.archive.format??'zip'}`,archive:vendor.archive},
  node:{file:`${nodeDistName(node)}.tar.gz`,archive:node.archive},
  ...(helperPin?{helper:{file:`codex-linux-sandbox-${helperPin.upstreamTag}-linux-${host.arch}`,archive:helperAsset(helperPin,host.arch)}}:{}),
  ...(host.platform==='linux'&&enginePin?(asset=>({engine:{file:basename(new URL(asset.url).pathname),archive:{url:asset.url,sha256:asset.sha256,maxLength:ENGINE_MAX_BYTES}}}))(engineAsset(enginePin,host.arch)):{}),
  ...(modulePins?{modules:{dir:MODULES_DIR,packages:moduleTarballs(modulePins,host)}}:{}),
 };
}

// The module tree's cache directory, under the archive cache.
const MODULES_DIR='modules';
// The host's closure as tarballs to cache, one per name and version (two paths may hold the same package). The host's
// C library is the one this process runs on, for this machine's own host; for another host, the glibc one every module
// pin names.
function moduleTarballs({lock,provenance},host){
 const target={...host,libc:host.libc??(host.platform===process.platform&&host.arch===process.arch?moduleHost().libc:'glibc')};
 const files=new Map();
 for(const p of pinnedClosure(lock,provenance,target)){const file=localTarballName(p.name,p.version);if(!files.has(file))files.set(file,{file,archive:{url:p.resolved,length:p.length,integrity:p.integrity}});}
 return [...files.values()];
}

// `cua install`'s arguments for the cached archives (cachedArchives). The engine is not one: placeCachedEngine puts it in
// place first.
export const installArgs=archives=>['install','--archive',archives.vendor,'--node-archive',archives.node,...(archives.helper?['--sandbox-helper',archives.helper]:[]),
 ...(archives.modules?['--modules-dir',archives.modules]:[])];

// Preparation only, into a home that has no cache yet. Each archive lands under its name only once verified.
export async function fetchArchives(home,{pins=pinnedArchives(),fetch=globalThis.fetch}={}){
 const dir=archiveCacheDir(home);
 mkdirSync(dir,{mode:0o700});
 const fetchOne=async(into,{file,archive},redirect)=>{
  const partial=join(into,`.${file}.partial`);
  try{await download(redirect?{...archive,redirect}:archive,partial,fetch);await verifyArchive(partial,archive);}
  catch(error){rmSync(partial,{force:true});throw error;}
  renameSync(partial,join(into,file));
 };
 for(const [role,entry] of Object.entries(pins)){
  if(role!=='modules'){await fetchOne(dir,entry);continue;}
  // The installer takes a module tarball from its canonical URL only, refusing a redirect; so does its cache.
  const into=join(dir,entry.dir);mkdirSync(into,{mode:0o700});
  for(const tarball of entry.packages)await fetchOne(into,tarball,'error');
 }
 return cachedArchives(home,{pins});
}

// The cached paths a fixture installs from. Cheap presence checks only: the installer verifies the bytes.
export function cachedArchives(home,{pins=pinnedArchives()}={}){
 const dir=archiveCacheDir(home);
 const present=(path,{file,archive})=>{
  let stat;try{stat=lstatSync(path);}catch{stat=null;}
  // A hash-pinned archive (the engine) is checked by its hash too: the installer would replace a damaged one by a download.
  const sized=archive.length===undefined?stat?.size>0&&stat.size<=archive.maxLength&&sha256(path)===archive.sha256:stat?.size===archive.length;
  if(!stat?.isFile()||!sized)throw new Error(`The prepared archive cache ${dir} has no pinned ${file}; managed fixtures never download: run cleanup-prepared, then prepare again`);
  return path;
 };
 return Object.fromEntries(Object.entries(pins).map(([role,entry])=>{
  if(role!=='modules')return [role,present(join(dir,entry.file),entry)];
  // The module tree: its directory, once every tarball of the closure is in it at its pinned length; the installer
  // checks each one's SHA-512 again, and refuses one that differs rather than download it.
  const into=join(dir,entry.dir);
  for(const tarball of entry.packages)present(join(into,tarball.file),tarball);
  return [role,into];
 }));
}

const sha256=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
// The cached engine `file` placed in the cua home `home` as `cua install` and selection find it, executable -> its path.
// The placed copy must hash to the pin (`pins`, pinnedArchives'), or it is removed and refused: a damaged copy would
// make the install download the engine instead.
export function placeCachedEngine(home,file,{pins=pinnedArchives()}={}){
 const path=linuxEnginePath(home),expected=pins.engine?.archive?.sha256;
 mkdirSync(dirname(path),{recursive:true,mode:0o700});copyFileSync(file,path);chmodSync(path,0o755);
 if(!expected||sha256(path)!==expected){rmSync(path,{force:true});throw new Error(`The cached engine ${file} is not the pinned cua-engine; managed fixtures never download: run cleanup-prepared, then prepare again`);}
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
