import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareCommand} from '../../scripts/repl-parity/topology.mjs';
import {prepareNative, cleanupNative} from '../../scripts/native-baseline/prepare.mjs';
import {serveCommand} from '../../scripts/native-baseline/remote.mjs';
import {spawnGeditScript} from '../../scripts/native-baseline/linux.mjs';

const xSession = {DISPLAY: ':7', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1234/bus', XDG_RUNTIME_DIR: '/run/user/1234', XAUTHORITY: '/run/user/1234/x-cookie'};
test('a declared cloud device prepares without inheriting the VM discovery home', () => {
  const cloud = prepareCommand({device: 'cua-bench', commit: 'abcdef0'});
  assert.equal(cloud.args[2], 'cua-bench');
  assert.doesNotMatch(cloud.args.at(-1), /cua-h4|\/home\/admin|192\.168\.64|cua-parity-node/);
  assert.match(prepareCommand({device: 'cua-linux', commit: 'abcdef0'}).args.at(-1), /\/home\/admin\/\.local\/share\/cua-h4/);
  assert.throws(() => prepareCommand({device: 'undeclared-device', commit: 'abcdef0'}), /declared/);
});

test('fresh native preparation installs both runtimes in an owned home, removes ambient overrides and cleans only its home', t => {
  const parent = mkdtempSync(join(tmpdir(), 'native-prepare-test-'));
  t.after(() => rmSync(parent, {recursive:true, force:true}));
  const calls = [];
  const prepared = prepareNative({device:'cua-bench'}, {
    directoryRoot:parent, tempRoot:'/different-tmp', ambient:{HOME:'/home/bench', CUA_HOME:'/foreign/h4', CUA_NODE:'/foreign/node', ...xSession},
    desktop:() => xSession,
    run:(exe,args,options) => { calls.push({exe,args,env:options.env}); return ''; },
    inspect:({source}) => ({home:source, ownNode:{path:join(source,'node/24.22.0/bin/node'),version:'v24.22.0'}}),
  });
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].args.slice(-2),['bin/cua.mjs','install']);
  assert.equal(calls[0].env.CUA_HOME,prepared.home);
  assert.equal(calls[0].env.CUA_NODE,undefined);
  assert.equal(calls[0].env.HOME,join(prepared.home,'home'));
  assert.deepEqual(prepared.xSession,xSession);
  assert.equal(prepared.nodeMode,'managed');
  assert.ok(existsSync(prepared.home));
  assert.throws(() => cleanupNative({...prepared,token:'wrong'},{directoryRoot:parent}),/ownership/);
  cleanupNative(prepared,{directoryRoot:parent});
  assert.equal(existsSync(prepared.home),false);
});

test('preparation rejects a fallback Node and removes the failed install', t => {
  const parent=mkdtempSync(join(tmpdir(),'native-prepare-test-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));
  let installed;
  assert.throws(()=>prepareNative({device:'cua-bench'},{directoryRoot:parent,tempRoot:'/different-tmp',desktop:()=>xSession,run:(_e,_a,o)=>{installed=o.env.CUA_HOME;},inspect:({source})=>({home:source,ownNode:{path:'/usr/bin/node',version:'v24.22.0'}})}),/managed Node/);
  assert.equal(existsSync(installed),false);
});

// Execute the generated shell with a harmless node double. This catches quoting, env-option ordering and inheritance.
test('serve and gedit use the recorded X session, not an account-cookie guess', () => {
  const options={device:'cua-bench',checkout:'/tmp',home:'/scratch/cua',userHome:'/scratch/cua/home',host:'cua',platform:'linux',display:':7',xSession};
  const script=serveCommand(options).args.at(-1);
  const shell=script.replace('exec env ','env ').replace(/node .*$/, 'sh -c \'printf "%s|%s|%s|%s" "$DISPLAY" "$XAUTHORITY" "$DBUS_SESSION_BUS_ADDRESS" "${CUA_NODE-unset}"\'');
  const result=execFileSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/wrong',CUA_NODE:'/foreign/node'}});
  assert.equal(result,':7|/run/user/1234/x-cookie|unix:path=/run/user/1234/bus|unset');
  // Parse/evaluate the generated gedit program with imports replaced by boundary doubles; no GUI is launched.
  const command=spawnGeditScript({display:':7',role:'scratch',xSession});
  const source=execFileSync('/bin/sh',['-c',`node() { printf '%s' "$3"; }; ${command}`],{encoding:'utf8'});
  let captured;
  const stripped=source.replace(/^import .*;$/gm,'');
  new Function('spawn','randomBytes','mkdtempSync','writeFileSync','homedir','join','process','console',stripped)(
    (_exe,_args,opts)=>{captured=opts;return {once(){},pid:42,unref(){}};},()=>({toString:()=> 'abcdef'}),()=>'/tmp/cua-native-baseline-AbCdEf',()=>{},()=>'/wrong',join,{env:{HOME:'/wrong',XAUTHORITY:'/wrong/cookie'}},{log(){}});
  for(const [key,value] of Object.entries(xSession))assert.equal(captured.env[key],value);
});

test('an authless cloud X session cannot inherit a login cookie or bus when opening gedit', () => {
  const command=spawnGeditScript({display:':0',role:'scratch',xSession:{DISPLAY:':0'},userHome:'/scratch/home'});
  const source=execFileSync('/bin/sh',['-c',`node() { printf '%s' "$3"; }; ${command}`],{encoding:'utf8'});
  let captured;
  new Function('spawn','randomBytes','mkdtempSync','writeFileSync','homedir','join','process','console',source.replace(/^import .*;$/gm,''))(
    (_exe,_args,opts)=>{captured=opts.env;return {once(){},pid:42,unref(){}};},()=>({toString:()=> 'abcdef'}),()=>'/tmp/cua-native-baseline-AbCdEf',()=>{},()=>'/wrong',join,{env:{HOME:'/wrong',XAUTHORITY:'/wrong/cookie',DBUS_SESSION_BUS_ADDRESS:'wrong-bus',PATH:'/usr/bin'}},{log(){}});
  assert.equal(captured.XAUTHORITY,undefined);
  assert.equal(captured.DBUS_SESSION_BUS_ADDRESS,undefined);
  assert.equal(captured.HOME,'/scratch/home');
});
