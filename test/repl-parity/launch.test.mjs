import {test} from 'node:test';import assert from 'node:assert/strict';
import {noServicesLaunch} from './serve-cells.mjs';
test('isolated vendor lane bypasses the banner-overwriting launcher and cannot reach browser/native services',()=>{
 const launch=noServicesLaunch({command:'node',args:['launcher'],env:{CUA_REPL_NODE_REPL_PATH:'/pinned/node_repl',NODE_REPL_TRUSTED_SERVICES:'production',SKY_CUA_SERVICE_PATH:'helper',BROWSER_USE_BACKEND_PATHS:'owner'}});
 assert.equal(launch.command,'/pinned/node_repl');assert.deepEqual(launch.args,[]);assert.equal(launch.env.NODE_REPL_TRUSTED_SERVICES,'{}');assert.equal(launch.env.NODE_REPL_JS_BANNER,'void 0;');assert.equal(launch.env.SKY_CUA_SERVICE_PATH,undefined);assert.equal(launch.env.BROWSER_USE_BACKEND_PATHS,undefined);
});
