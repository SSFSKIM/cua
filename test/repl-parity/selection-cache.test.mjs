// Exercise the oracle's actual client against production serve/lazy-runtime with the harmless installed runtime double.
// The handshake must be persisted from a live tools/list, not merely from initialize and js_reset.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ordinaryCall} from '../../scripts/repl-parity/selection-device.mjs';
import {fakeInstalledHome,installedHomeSupported} from '../fixtures/installed-home.mjs';
import {handshakeRecords} from '../../src/mcp/lazy-runtime.mjs';
import {homeLayout} from '../../src/runtime/layout.mjs';
import {loadPins,selectPin} from '../../src/runtime/manifest.mjs';
import {hostIdentity} from '../../src/repl-host/identity.mjs';

test('ordinary selection calls record a complete cold handshake and reuse it on the next call',{skip:!installedHomeSupported},async t=>{
 const home=fakeInstalledHome(t),release=selectPin(loadPins()).release;
 const env={PATH:process.env.PATH,HOME:home,CUA_HOME:home,CUA_PARITY_REMOTE:'1',CUA_SHIM_SECRETS:'off',CUA_SHIM_SURFACES:'computer',CUA_REPL_HOST:'vendor'};
 const records=handshakeRecords({dir:join(homeLayout(home).handshake,release),surfaces:['computer'],host:hostIdentity({host:'vendor',release})});
 const version='2025-06-18';assert.equal(records.read(version),null);
 const cold=await ordinaryCall({home,env,node:process.execPath});
 const record=records.read(version);assert.ok(record,'ordinaryCall must cause a real handshake record; absence cannot count as cache success');
 assert.deepEqual(record.initialize.serverInfo,cold.serverInfo);assert.ok(record.tools.tools.some(tool=>tool.name==='js_reset'));
 const received=()=>{const rows=readFileSync(join(home,'state','codex','fake-upstream.jsonl'),'utf8').trim().split('\n').map(JSON.parse);return rows.slice(rows.findLastIndex(row=>row.start)).filter(row=>row.received).map(row=>row.received.method);};
 assert.deepEqual(received().slice(0,3),['initialize','notifications/initialized','tools/list']);
 assert.equal(received().filter(method=>method==='tools/list').length,1);
 const warm=await ordinaryCall({home,env,node:process.execPath});
 assert.deepEqual(warm.serverInfo,cold.serverInfo);assert.deepEqual(records.read(version),record);
 assert.deepEqual(received().slice(0,3),['initialize','notifications/initialized','tools/call']);
 assert.equal(received().includes('tools/list'),false,'warm tools/list is served from the persisted record, while reset still launches and attests the host');
});
