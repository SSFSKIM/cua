import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCpu,cpuUsageBetween} from './qualification-load.mjs';
test('CPU samples parse cumulative process time and retain measured percent',()=>{
 assert.deepEqual(parseCpu(' 12 49.5 0:12.34\n 13 51.2 1:02:03.40\n'),[{pid:12,percent:49.5,cpuSeconds:12.34},{pid:13,percent:51.2,cpuSeconds:3723.4}]);
});
test('CPU-time delta measures aggregate core usage and missing workers are unknown',()=>{
 const a={at:1000,workers:[{pid:1,cpuSeconds:10},{pid:2,cpuSeconds:5}]},b={at:3000,workers:[{pid:1,cpuSeconds:12},{pid:2,cpuSeconds:7}]};
 assert.equal(cpuUsageBetween(a,b),200);assert.equal(cpuUsageBetween(a,{...b,workers:b.workers.slice(1)}),null);
});
