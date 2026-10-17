// Experiment A's confinement cell (#115 M0, scripts/sandbox-probe/experiment.mjs) is generated source a model cell
// runs; it must parse as an async function body for any harness paths, quoting them as JSON.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confinementCell} from '../../scripts/sandbox-probe/experiment.mjs';

const AsyncFunction = (async () => {}).constructor;

test('the confinement cell parses, with every harness path embedded as a JSON string', () => {
  const body = confinementCell({outside: '/s/out"x', marker: '/s/home/m.txt', moduleDir: '/s/mods', cuaHome: '/s/home', tcpPort: 4242, unixPath: '/private/tmp/c.sock', sessionTmp: "/s/tmp'q"});
  assert.doesNotThrow(() => new AsyncFunction('nodeRepl', body));
  assert.ok(body.includes(JSON.stringify('/s/out"x/cua115-probe')));
  assert.ok(body.includes('port: 4242'));
});
