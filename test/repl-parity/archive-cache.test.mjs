import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {archiveCacheDir,cachedArchives,fetchArchives,installArgs,pinnedArchives,placeCachedEngine,prepareArchiveCache} from '../../scripts/repl-parity/archive-cache.mjs';
import {loadPins,selectPin} from '../../src/runtime/manifest.mjs';
import {loadNodePins,selectNodePin} from '../../src/runtime/managed-node.mjs';

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
  const vendor=selectPin(loadPins(),host),node=selectNodePin(loadNodePins(),host),pins=pinnedArchives({host});
  assert.deepEqual(pins.vendor,{file:`${vendor.release}-${host.platform}-${host.arch}.${host.platform==='linux'?'deb':'zip'}`,archive:vendor.archive});
  assert.deepEqual(pins.node,{file:`node-v${node.version}-${host.platform}-${host.arch}.tar.gz`,archive:node.archive});
  for(const {archive} of Object.values(pins))assert.match(archive.url,/^https:\/\//);
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
 const prepared=home(t),all={...PINS,engine:pins.engine};
 const {calls,fetch}=network(url=>url===ENGINE_PIN.assets.x64.url?ENGINE:served[url]);
 const archives=await fetchArchives(prepared,{pins:all,fetch});
 assert.deepEqual(calls.at(-1),ENGINE_PIN.assets.x64.url);
 assert.deepEqual(readFileSync(archives.engine),ENGINE);
 assert.deepEqual(cachedArchives(prepared,{pins:all}),archives);
 assert.deepEqual(installArgs(archives),['install','--archive',archives.vendor,'--node-archive',archives.node]);
 const other=home(t);
 await assert.rejects(fetchArchives(other,{pins:all,fetch:network(url=>url===ENGINE_PIN.assets.x64.url?Buffer.from('other bytes'):served[url]).fetch}),error=>error.code==='archive_hash_mismatch');
 assert.throws(()=>cachedArchives(other,{pins:all}),/cua-engine-0\.1\.0-linux-x64.*cleanup-prepared/s);
});

test('placeCachedEngine puts the cached engine where cua install looks for it, executable',t=>{
 const prepared=home(t),scratch=home(t),file=join(prepared,'cua-engine-0.1.0-linux-x64');writeFileSync(file,ENGINE,{mode:0o600});
 const placed=placeCachedEngine(scratch,file);
 assert.equal(placed,join(scratch,'engine','linux','cua-engine'));
 assert.deepEqual(readFileSync(placed),ENGINE);
 assert.equal(statSync(placed).mode&0o777,0o755);
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
