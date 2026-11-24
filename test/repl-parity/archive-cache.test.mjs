import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {archiveCacheDir,cachedArchives,fetchArchives,installArgs,pinnedArchives,placeCachedEngine,prepareArchiveCache} from '../../scripts/repl-parity/archive-cache.mjs';
import {loadPins,selectPin} from '../../src/runtime/manifest.mjs';
import {loadNodePins,selectNodePin} from '../../src/runtime/managed-node.mjs';
import {installModuleTree,loadModuleLock,loadModuleProvenance,localTarballName,pinnedClosure,readModuleTree} from '../../src/runtime/module-tree.mjs';
import {LINUX_ARM64,LINUX_X64,writeFixtureModules} from '../fixtures/module-registry.mjs';

const SCRIPT=fileURLToPath(new URL('../../scripts/repl-parity/archive-cache.mjs',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const BYTES={vendor:Buffer.from('tiny vendor deb fixture'),node:Buffer.from('tiny node tarball fixture')};
const PINS={
 vendor:{file:'r1-linux-x64.deb',archive:{format:'deb',url:'https://vendor.test/r1.deb',length:BYTES.vendor.length,sha256:sha(BYTES.vendor)}},
 node:{file:'node-v24.0.0-linux-x64.tar.gz',archive:{url:'https://nodejs.test/node.tar.gz',length:BYTES.node.length,sha256:sha(BYTES.node)}},
};
const served={'https://vendor.test/r1.deb':BYTES.vendor,'https://nodejs.test/node.tar.gz':BYTES.node};
function network(body=url=>served[url]){
 const calls=[];
 return {calls,fetch:async url=>{calls.push(url);const bytes=body(url);return new Response(bytes,{headers:{'content-length':String(bytes.length)}});}};
}
function home(t){const dir=realpathSync(mkdtempSync(join(tmpdir(),'cua-archive-cache-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function writeCache(dir,pins=PINS){mkdirSync(archiveCacheDir(dir),{recursive:true,mode:0o700});for(const [role,{file}] of Object.entries(pins))writeFileSync(join(archiveCacheDir(dir),file),BYTES[role]);}

test('preparation downloads each pinned archive once and keeps only the verified copies in its own cache',async t=>{
 const prepared=home(t),{calls,fetch}=network();
 const archives=await fetchArchives(prepared,{pins:PINS,fetch});
 assert.deepEqual(calls,['https://vendor.test/r1.deb','https://nodejs.test/node.tar.gz']);
 assert.deepEqual(archives,{vendor:join(prepared,'parity-archives','r1-linux-x64.deb'),node:join(prepared,'parity-archives','node-v24.0.0-linux-x64.tar.gz')});
 assert.deepEqual(readFileSync(archives.vendor),BYTES.vendor);assert.deepEqual(readFileSync(archives.node),BYTES.node);
 assert.deepEqual(readdirSync(archiveCacheDir(prepared)).sort(),['node-v24.0.0-linux-x64.tar.gz','r1-linux-x64.deb']);
 assert.equal(statSync(archiveCacheDir(prepared)).mode&0o777,0o700);
 assert.deepEqual(cachedArchives(prepared,{pins:PINS}),archives);
});

test('a prepared cache is fetched once: a second fetch into the same home is refused before any download',async t=>{
 const prepared=home(t);await fetchArchives(prepared,{pins:PINS,fetch:network().fetch});
 const again=network();
 await assert.rejects(fetchArchives(prepared,{pins:PINS,fetch:again.fetch}),/EEXIST|exists/);
 assert.deepEqual(again.calls,[]);
});

test('length and hash mismatches are refused and leave no archive in the cache',async t=>{
 const cases=[
  ['short body',url=>served[url].subarray(1),'archive_length_mismatch'],
  ['long body',url=>Buffer.concat([served[url],Buffer.from('x')]),'archive_length_mismatch'],
  ['same length, other bytes',url=>Buffer.alloc(served[url].length,0x61),'archive_hash_mismatch'],
 ];
 for(const [name,body,code] of cases){
  const prepared=home(t),{calls,fetch}=network(body);
  await assert.rejects(fetchArchives(prepared,{pins:PINS,fetch}),error=>error.code===code,name);
  assert.deepEqual(calls,['https://vendor.test/r1.deb'],`${name}: nothing after the refused archive`);
  assert.deepEqual(readdirSync(archiveCacheDir(prepared)),[],`${name}: no partial or unverified file is kept`);
 }
 const prepared=home(t),{fetch}=network(url=>url.includes('nodejs')?Buffer.alloc(BYTES.node.length):served[url]);
 await assert.rejects(fetchArchives(prepared,{pins:PINS,fetch}),error=>error.code==='archive_hash_mismatch');
 assert.throws(()=>cachedArchives(prepared,{pins:PINS}),/cleanup-prepared/);
});

test('fixtures resolve only present, regular, pin-length archives and otherwise ask for a fresh preparation',t=>{
 const prepared=home(t);
 assert.throws(()=>cachedArchives(prepared,{pins:PINS}),/never download.*cleanup-prepared.*prepare again/s);
 writeCache(prepared);
 assert.deepEqual(cachedArchives(prepared,{pins:PINS}),{vendor:join(archiveCacheDir(prepared),PINS.vendor.file),node:join(archiveCacheDir(prepared),PINS.node.file)});
 writeFileSync(join(archiveCacheDir(prepared),PINS.node.file),Buffer.concat([BYTES.node,Buffer.from('!')]));
 assert.throws(()=>cachedArchives(prepared,{pins:PINS}),/node-v24\.0\.0-linux-x64\.tar\.gz.*cleanup-prepared/s);
 rmSync(join(archiveCacheDir(prepared),PINS.node.file));
 const elsewhere=join(prepared,'elsewhere.tar.gz');writeFileSync(elsewhere,BYTES.node);symlinkSync(elsewhere,join(archiveCacheDir(prepared),PINS.node.file));
 assert.throws(()=>cachedArchives(prepared,{pins:PINS}),/cleanup-prepared/);
});

test('the checked-in pins name exactly the archives preparation fetches',()=>{
 for(const host of [{platform:'linux',arch:'x64'},{platform:'linux',arch:'arm64'},{platform:'darwin',arch:'arm64'}]){
  const node=selectNodePin(loadNodePins(),host),pins=pinnedArchives({host});
  // since #171 M6b no Linux preparation caches the vendor's deb: only macOS installs a vendor archive
  if(host.platform==='linux')assert.equal(pins.vendor,undefined);
  else{const vendor=selectPin(loadPins(),host);assert.deepEqual(pins.vendor,{file:`${vendor.release}-${host.platform}-${host.arch}.zip`,archive:vendor.archive});}
  assert.deepEqual(pins.node,{file:`node-v${node.version}-${host.platform}-${host.arch}.tar.gz`,archive:node.archive});
  for(const [role,{archive}] of Object.entries(pins))if(role!=='modules')assert.match(archive.url,/^https:\/\//);
 }
 assert.throws(()=>pinnedArchives({host:{platform:'linux',arch:'x64'},nodePins:[]}),/No Node is pinned/);
});

// #171: once cua's Linux engine is pinned (runtime/engine/linux-engine.json), preparation caches the pinned asset for the
// machine's arch too, verified by its hash under the installer's length bound, and a managed fixture places that copy in
// its scratch home before `cua install`, whose engine step then finds the pinned engine already placed: nothing downloads.
const ENGINE=Buffer.from('tiny cua-engine fixture');
const ENGINE_PIN={version:'0.1.0',release:'linux-engine-v0.1.0',assets:{x64:{url:'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.1.0/cua-engine-0.1.0-linux-x64',sha256:sha(ENGINE)},arm64:{url:'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.1.0/cua-engine-0.1.0-linux-arm64',sha256:'0'.repeat(64)}}};
test('a pinned Linux engine joins the cache: its asset for this arch, by hash under the installer\'s bound, never passed to install',async t=>{
 const host={platform:'linux',arch:'x64'};
 const pins=pinnedArchives({host,enginePin:ENGINE_PIN});
 assert.deepEqual(pins.engine,{file:'cua-engine-0.1.0-linux-x64',archive:{url:ENGINE_PIN.assets.x64.url,sha256:ENGINE_PIN.assets.x64.sha256,maxLength:64*1024*1024}});
 assert.equal(pinnedArchives({host,enginePin:null}).engine,undefined,'before the first release there is no engine to cache');
 assert.equal(pinnedArchives({host:{platform:'darwin',arch:'arm64'},enginePin:ENGINE_PIN}).engine,undefined);
 const prepared=home(t),all={node:PINS.node,engine:pins.engine};
 const {calls,fetch}=network(url=>url===ENGINE_PIN.assets.x64.url?ENGINE:served[url]);
 const archives=await fetchArchives(prepared,{pins:all,fetch});
 assert.deepEqual(calls.at(-1),ENGINE_PIN.assets.x64.url);
 assert.deepEqual(readFileSync(archives.engine),ENGINE);
 assert.deepEqual(cachedArchives(prepared,{pins:all}),archives);
 assert.deepEqual(installArgs(archives),['install','--node-archive',archives.node],'a Linux cache holds no vendor archive, and install takes no --archive');
 assert.deepEqual(installArgs({...archives,vendor:'/c/r.zip'}),['install','--archive','/c/r.zip','--node-archive',archives.node],'macOS keeps the vendor archive');
 const other=home(t);
 await assert.rejects(fetchArchives(other,{pins:all,fetch:network(url=>url===ENGINE_PIN.assets.x64.url?Buffer.from('other bytes'):served[url]).fetch}),error=>error.code==='archive_hash_mismatch');
 assert.throws(()=>cachedArchives(other,{pins:all}),/cua-engine-0\.1\.0-linux-x64.*cleanup-prepared/s);
});

test('placeCachedEngine puts the cached engine where cua install looks for it, executable',t=>{
 const prepared=home(t),scratch=home(t),file=join(prepared,'cua-engine-0.1.0-linux-x64');writeFileSync(file,ENGINE,{mode:0o600});
 const pins={engine:{file:'cua-engine-0.1.0-linux-x64',archive:{url:ENGINE_PIN.assets.x64.url,sha256:sha(ENGINE),maxLength:64*1024*1024}}};
 const placed=placeCachedEngine(scratch,file,{pins});
 assert.equal(placed,join(scratch,'engine','linux','cua-engine'));
 assert.deepEqual(readFileSync(placed),ENGINE);
 assert.equal(statSync(placed).mode&0o777,0o755);
});

// Review fix 4: a cached engine damaged after preparation is refused, never left for the installer to replace by a
// download: at the fixture's cache check and again in the copy it places.
test('a cached engine whose bytes no longer hash to the pin is refused with the re-prepare guidance, before and after the copy',t=>{
 const prepared=home(t),pins={...PINS,engine:{file:'cua-engine-0.1.0-linux-x64',archive:{url:ENGINE_PIN.assets.x64.url,sha256:sha(ENGINE),maxLength:64*1024*1024}}};
 writeCache(prepared);writeFileSync(join(archiveCacheDir(prepared),pins.engine.file),Buffer.alloc(ENGINE.length,0x61));
 assert.throws(()=>cachedArchives(prepared,{pins}),/cua-engine-0\.1\.0-linux-x64.*cleanup-prepared.*prepare again/s);
 const scratch=home(t),damaged=join(prepared,'damaged-engine');writeFileSync(damaged,Buffer.from('other bytes'));
 assert.throws(()=>placeCachedEngine(scratch,damaged,{pins}),/cleanup-prepared.*prepare again/s);
 assert.throws(()=>statSync(join(scratch,'engine','linux','cua-engine')),/ENOENT/,'nothing damaged is left where cua install looks');
});

// #171 M6a: on Linux cua's own runtime is the ModuleTree, cua's install of the lock's closure for the host
// (src/runtime/module-tree.mjs). Preparation caches each tarball of that closure as the installer fetches it (the
// canonical URL, no redirect, the pinned length, checked against its SHA-512), under the name `--modules-dir` reads, and
// every fresh install takes the directory with `--modules-dir`: it checks each tarball again and downloads none.
const MODULES=(()=>{const dir=mkdtempSync(join(tmpdir(),'cua-archive-modules-'));process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
 const written=writeFixtureModules(join(dir,'pins'));return {...written,lock:loadModuleLock(written.dir),provenance:loadModuleProvenance(written.dir)};})();
const modulePins=host=>pinnedArchives({host,modulePins:{lock:MODULES.lock,provenance:MODULES.provenance}}).modules;
test('the Linux module tree joins the cache: each tarball of the host\'s closure, by its pinned length and integrity, and --modules-dir names it',async t=>{
 const host={platform:'linux',arch:'x64'},closure=pinnedClosure(MODULES.lock,MODULES.provenance,LINUX_X64);
 const modules=modulePins(host);
 assert.equal(modules.dir,'modules');
 assert.deepEqual(modules.packages,[...new Map(closure.map(p=>[localTarballName(p.name,p.version),{file:localTarballName(p.name,p.version),archive:{url:p.resolved,length:p.length,integrity:p.integrity}}])).values()]);
 assert.deepEqual(modulePins({platform:'linux',arch:'arm64'}).packages.map(p=>p.file).sort(),[...new Set(pinnedClosure(MODULES.lock,MODULES.provenance,LINUX_ARM64).map(p=>localTarballName(p.name,p.version)))].sort());
 assert.equal(pinnedArchives({host:{platform:'darwin',arch:'arm64'}}).modules,undefined,'macOS installs no module tree');
 const prepared=home(t),all={node:PINS.node,modules},{urls,fetch:serve}=MODULES;
 const requests=[];const fetch=async(url,init)=>{requests.push(init?.redirect);return url in served?network().fetch(url):serve(url);};
 const archives=await fetchArchives(prepared,{pins:all,fetch});
 assert.equal(archives.modules,join(archiveCacheDir(prepared),'modules'));
 assert.deepEqual(readdirSync(archives.modules).sort(),modules.packages.map(p=>p.file).sort());
 assert.deepEqual([...urls].sort(),modules.packages.map(p=>p.archive.url).sort(),'each tarball fetched once');
 assert.ok(requests.slice(1).every(r=>r==='error'),'a module tarball is taken from its canonical URL only, as the installer takes it');
 assert.equal(statSync(archives.modules).mode&0o777,0o700);
 assert.deepEqual(cachedArchives(prepared,{pins:all}),archives);
 assert.deepEqual(installArgs(archives),['install','--node-archive',archives.node,'--modules-dir',archives.modules]);
 // What the cache holds is what the installer reads: a fresh home installs the tree from it, and downloads nothing.
 const fresh=home(t);
 const tree=await installModuleTree({home:fresh,lock:MODULES.lock,provenance:MODULES.provenance,host:LINUX_X64,dir:archives.modules,fetch:async url=>{throw new Error(`downloaded ${url}`);}});
 assert.equal(tree.changed,true);
 assert.equal(readModuleTree(fresh,MODULES.lock,LINUX_X64)?.record.source,'dir');
});

test('a module tarball that is not its pin\'s is refused at preparation, and a cache missing one sends the fixture back to prepare',async t=>{
 const modules=modulePins({platform:'linux',arch:'x64'}),all={...PINS,modules},first=modules.packages[0];
 const damaged=home(t);
 const fetch=async url=>url in served?network().fetch(url):url===first.archive.url?new Response(Buffer.alloc(first.archive.length,0x61),{headers:{'content-length':String(first.archive.length)}}):MODULES.fetch(url);
 await assert.rejects(fetchArchives(damaged,{pins:all,fetch}),error=>error.code==='archive_hash_mismatch');
 assert.deepEqual(existsSync(join(archiveCacheDir(damaged),'modules'))?readdirSync(join(archiveCacheDir(damaged),'modules')):[],[],'no unverified tarball is kept');
 assert.throws(()=>cachedArchives(damaged,{pins:all}),/cleanup-prepared/);
 const prepared=home(t),archives=await fetchArchives(prepared,{pins:all,fetch:async url=>url in served?network().fetch(url):MODULES.fetch(url)});
 rmSync(join(archives.modules,first.file));
 assert.throws(()=>cachedArchives(prepared,{pins:all}),new RegExp(`${first.file.replace(/\./g,'\\.')}.*cleanup-prepared.*prepare again`,'s'));
 writeFileSync(join(archives.modules,first.file),Buffer.alloc(first.archive.length+1));
 assert.throws(()=>cachedArchives(prepared,{pins:all}),/cleanup-prepared/,'a tarball of another length');
});

test('the checked-in Linux pins cache the 23 tarballs of each architecture\'s closure',()=>{
 for(const arch of ['x64','arm64']){
  const {packages}=pinnedArchives({host:{platform:'linux',arch}}).modules;
  assert.equal(packages.length,23,arch);
  for(const {file,archive} of packages){assert.match(archive.url,/^https:\/\/registry\.npmjs\.org\//);assert.match(archive.integrity,/^sha512-/);assert.ok(archive.length>0);assert.match(file,/\.tgz$/);}
 }
});

test('the synchronous preparation face fetches in one child and returns the verified paths',t=>{
 const prepared=home(t),calls=[];
 const archives=prepareArchiveCache(prepared,{pins:PINS,run:(file,args,options)=>{calls.push({file,args,options});writeCache(prepared);return '';}});
 assert.equal(calls.length,1);assert.equal(calls[0].file,process.execPath);assert.deepEqual(calls[0].args,[SCRIPT,'fetch',prepared]);
 assert.ok(calls[0].options.timeout>0);
 assert.deepEqual(archives,cachedArchives(prepared,{pins:PINS}));
 assert.throws(()=>prepareArchiveCache(home(t),{pins:PINS,run:()=>{throw Error('download refused');}}),/download refused/);
});

test('the fetch entry point refuses a relative home before any download',()=>{
 const result=spawnSync(process.execPath,[SCRIPT,'fetch','relative/home'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/nonexistent'}});
 assert.notEqual(result.status,0);assert.match(result.stderr,/absolute/);
});
