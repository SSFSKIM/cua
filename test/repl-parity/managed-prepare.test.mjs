import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync,realpathSync,readlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareDevice,managePreparation} from '../../scripts/repl-parity/prepare-device.mjs';
import {socketPathFor,socketNameFor} from '../../src/chrome/extension.mjs';

function fixture(run,{managed=true}={}) {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-managed-prepare-'))),source=join(root,'source'),owned=join(root,'owned'),journal=join(root,'controller','mini.json');
 mkdirSync(source);mkdirSync(owned);
 const binding={route:'cua',chromeProfileDirectory:'Profile 1',extensionInstanceId:'fixture-backend'};
 const registry=JSON.stringify({version:1,profiles:{ssfs:binding,unrelated:{route:'cua',chromeProfileDirectory:'Default',extensionInstanceId:'other'}}});
 writeFileSync(join(source,'profiles.json'),registry);writeFileSync(join(source,'private-profile'),'DO-NOT-COPY');
 const inspections=[],commands=[],ambient={HOME:'/owner',CUA_HOME:source,CUA_NODE:'/ambient/node',CUA_PARITY_NODE_MODE:'ambient',PATH:'/bootstrap/bin:/usr/bin',DISPLAY:':0',SECRET_VALUE:'DO-NOT-RETURN'};
 const inspect=({source:home,ambient:env={}})=>{
  inspections.push({home,env});return {checkout:'/reviewed/cua-parity',commit:'reviewed',dirty:false,home,release:'pinned',node:process.version,platform:'linux',runtimeNode:'v22.14.0',ownNode:{path:env.CUA_NODE??(existsSync(join(home,'node/24.18.0/bin/node'))?join(home,'node/24.18.0/bin/node'):'/source/node'),version:'v24.18.0'},browserRoute:{selection:'cua',manifests:[]}};
 };
 const runCommand=(file,args,options)=>{
  commands.push({file,args,env:options.env});return JSON.stringify({profiles:[{key:'ssfs',ready:true,extensionInstanceId:'fixture-backend',chromeProfileDirectory:'Profile 1',label:'DO-NOT-RETURN'},{key:'unrelated',ready:false,extensionInstanceId:'other'}]});
 };
 const cached=[],cacheArchives=home=>{cached.push(home);return {vendor:join(home,'parity-archives','vendor.deb'),node:join(home,'parity-archives','node.tar.gz')};};
 const deps={ambient,inspect,run:runCommand,endpointOptions:{directoryRoot:owned,tempRoot:'/not-this-test-directory',cacheArchives,runCli:(home,args)=>{
  commands.push({home,args});assert.deepEqual(cached,[home],'the archive cache is fetched once, into this home, before install');
  assert.deepEqual(args,['install','--archive',join(home,'parity-archives','vendor.deb'),'--node-archive',join(home,'parity-archives','node.tar.gz')]);cached.length=0;
  if(managed){mkdirSync(join(home,'node/24.18.0/bin'),{recursive:true});writeFileSync(join(home,'node/24.18.0/bin/node'),'installer double');}
 }}};
 try{return run({root,source,owned,journal,binding,registry,inspections,commands,deps});}finally{rmSync(root,{recursive:true,force:true});}
}

test('ordinary preparation installs a fresh managed home and aliases only the selected ready backend',()=>fixture(({source,owned,binding,registry,inspections,commands,deps})=>{
 const first=prepareDevice({device:'mini',profile:'ssfs',home:source},deps),second=prepareDevice({device:'mini'},deps);
 assert.notEqual(first.home,source);assert.notEqual(first.home,second.home);assert.ok(first.home.startsWith(owned+'/'));
 assert.equal(first.nodeMode,'managed');assert.equal(first.nodeOverride,null);assert.equal(first.fixturePort,48732);assert.equal(first.userHome,join(first.home,'home'));
 assert.equal(first.ownNode.path,join(first.home,'node/24.18.0/bin/node'));
 assert.equal(first.ownedPreparation.home,first.home);assert.ok(first.ownedPreparation.token);assert.ok(first.ownedPreparation.experiment);
 assert.deepEqual(JSON.parse(readFileSync(join(first.home,'profiles.json'),'utf8')),{version:1,profiles:{ssfs:binding}});
 assert.equal(readlinkSync(socketPathFor(first.home,socketNameFor('fixture-backend'))),socketPathFor(source,socketNameFor('fixture-backend')));
 assert.ok(!existsSync(join(first.home,'private-profile')));assert.equal(readFileSync(join(source,'private-profile'),'utf8'),'DO-NOT-COPY');assert.equal(readFileSync(join(source,'profiles.json'),'utf8'),registry);
 assert.ok(!JSON.stringify(first).includes('DO-NOT-RETURN'));assert.ok(!JSON.stringify(first).includes('SECRET_VALUE'));assert.equal(first.environment.CUA_HOME,first.home);assert.equal(first.environment.HOME,first.userHome);assert.equal(first.display,':0');assert.equal(first.load.average.length,3);
 assert.equal(commands.filter(c=>c.home).length,2);assert.ok(commands.filter(c=>c.home).every(c=>c.home!==source));
 const discovery=commands.find(c=>c.file);assert.deepEqual(discovery.args,['bin/cua.mjs','profiles','list','--json']);assert.equal(discovery.env.CUA_REPL_HOST,'vendor');assert.equal(discovery.env.CUA_BROWSER_SERVICE,'cua');assert.equal(discovery.env.CUA_NODE,undefined);
 const last=inspections.at(-1);assert.equal(last.home,second.home);assert.equal(last.env.CUA_HOME,second.home);assert.equal(last.env.HOME,second.userHome);assert.equal(last.env.CUA_NODE,undefined);assert.equal(last.env.CUA_PARITY_NODE_MODE,'managed');
}));

test('preparation refuses an installer without managed Node and removes only the failed scratch',()=>fixture(({source,owned,commands,deps})=>{
 assert.throws(()=>prepareDevice({device:'mini',home:source},deps),/managed Node/);
 assert.deepEqual(readdirSync(owned),[]);assert.equal(commands.filter(c=>c.home).length,1);assert.ok(existsSync(join(source,'profiles.json')));
},{managed:false}));

test('explicit Node diagnostics are recorded without turning a resolved source Node into an override',()=>fixture(({source,deps,inspections})=>{
 const result=prepareDevice({device:'mini',home:source,node:'/diagnostic/node'},deps);
 assert.equal(result.nodeMode,'diagnostic-override');assert.equal(result.nodeOverride,'/diagnostic/node');assert.equal(result.ownNode.path,'/diagnostic/node');
 assert.equal(inspections.at(-1).env.CUA_NODE,'/diagnostic/node');
}));

test('unready or ambiguous discovery fails before installing anything',()=>fixture(({source,owned,commands,deps})=>{
 assert.throws(()=>prepareDevice({device:'mini',home:source,profile:'missing'},deps),/ready bound profile/);assert.deepEqual(readdirSync(owned),[]);
 const ambiguous={...deps,run:()=>JSON.stringify({profiles:[{key:'ssfs',ready:true,extensionInstanceId:'a'},{key:'me',ready:true,extensionInstanceId:'b'}]})};
 assert.throws(()=>prepareDevice({device:'mini',home:source},ambiguous),/ready bound profile/);assert.equal(commands.filter(c=>c.home).length,0);
}));

test('the shared preparation controller journals ownership and cleanup never forwards a journal PID',()=>fixture(({journal,source,deps})=>{
 const prepared=prepareDevice({device:'mini',home:source},deps),calls=[];
 const execute=command=>{calls.push(command);return calls.length===1?'installer notice\n'+JSON.stringify(prepared)+'\n':JSON.stringify({removed:true});};
 const options={device:'mini',commit:'1234567890abcdef',profile:'ssfs',journal};
 assert.deepEqual(managePreparation('prepare',options,{execute}),prepared);assert.deepEqual(JSON.parse(readFileSync(journal,'utf8')),prepared);
 assert.throws(()=>managePreparation('prepare',options,{execute}),/cleanup-prepared/);assert.equal(calls.length,1);
 const withPid={...prepared,pid:12345,ownedPreparation:{...prepared.ownedPreparation,pid:54321}};writeFileSync(journal,JSON.stringify(withPid));
 const cleaned=managePreparation('cleanup-prepared',options,{execute});assert.equal(cleaned.removed,true);assert.equal(existsSync(journal),false);
 const script=calls.at(-1).args.at(-1);assert.ok(!script.includes('12345'));assert.ok(!script.includes('54321'));assert.ok(script.includes(prepared.ownedPreparation.token));
 assert.throws(()=>managePreparation('cleanup-prepared',options,{execute}),/journal|prepared|ENOENT/);
}));

test('cleanup refuses legacy state and preserves ownership if device cleanup fails',()=>fixture(({journal,source,deps})=>{
 mkdirSync(join(journal,'..'),{recursive:true});writeFileSync(journal,JSON.stringify({device:'mini',home:source}));
 let calls=0;assert.throws(()=>managePreparation('cleanup-prepared',{device:'mini',journal},{execute(){calls++;}}),/owned|ownership/);assert.equal(calls,0);
 const prepared=prepareDevice({device:'mini',home:source},deps);writeFileSync(journal,JSON.stringify(prepared));
 assert.throws(()=>managePreparation('cleanup-prepared',{device:'mini',journal},{execute(){throw new Error('still live');}}),/still live/);assert.deepEqual(JSON.parse(readFileSync(journal,'utf8')),prepared);
}));

test('the device entry point refuses local invocation before installation or cleanup',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/repl-parity/prepare-device.mjs',import.meta.url)),'prepare','--device','mini'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/nonexistent'}});
 assert.notEqual(result.status,0);assert.match(result.stderr,/prepared parity clone|remote-only/);
});

// After M3 retires the vendor host on Linux (replHostFor refuses CUA_REPL_HOST=vendor there), preparation on a Linux
// device must still list its profiles: it asks for the own host, and only the M0 control runs select the vendor host.
const retiredOnLinux=run=>(file,args,options)=>{
 if(options.env.CUA_REPL_HOST==='vendor')throw new Error('repl_host_refused: CUA_REPL_HOST=vendor is refused on Linux, where cua\'s own host serves every session');
 return run(file,args,options);
};
test('preparation on a Linux device lists profiles through the own host, so it survives the vendor host\'s retirement',()=>fixture(({source,commands,deps})=>{
 const prepared=prepareDevice({device:'cua-gce',profile:'ssfs',home:source},{...deps,run:retiredOnLinux(deps.run)});
 assert.equal(prepared.device,'cua-gce');assert.equal(prepared.profile,'ssfs');
 const discovery=commands.find(c=>c.file);
 assert.equal(discovery.env.CUA_REPL_HOST,'cua');assert.equal(discovery.env.CUA_SHIM_SURFACES,'browser');assert.equal(discovery.env.CUA_BROWSER_SERVICE,'cua');
}));
test('preparation on the mini keeps the vendor host for its listing',()=>fixture(({source,commands,deps})=>{
 prepareDevice({device:'mini',profile:'ssfs',home:source},deps);
 assert.equal(commands.find(c=>c.file).env.CUA_REPL_HOST,'vendor');
}));
