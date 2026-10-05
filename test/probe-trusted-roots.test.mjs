// The trusted-root step of scripts/probe-secrets.mjs (issues #20, #34): with the sandbox on (CUA_SHIM_SANDBOX=default)
// no cell may plant a module in a trusted code root, and that is a guarantee (PASS or FAIL); under the default
// (`disabled`) what a cell could write is recorded as the accepted consequence of #20 (INFO), never a failure. Either
// way a file the probe could not remove again from a trusted root is a FAIL: the probe must leave no trace there.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SANDBOX_DISABLED_STEP, SANDBOX_ON_STEP, trustedRootStep} from '../scripts/probe/trusted-roots.mjs';

const roots = [{label: 'state/codex', path: '/h/state/codex'}, {label: 'src/services', path: '/c/src/services'}, {label: 'vendor modules', path: '/h/runtimes/r/modules'}];
const observed = (results, extra = {}) => ({roots, results, planted: [], survivors: [], cwd: 'written', tmp: 'written', ...extra});

test('sandbox on: every trusted root refusing the write is a PASS that names the setting', () => {
  const step = trustedRootStep('default', observed(['EPERM', 'EPERM', 'EPERM'], {cwd: 'EPERM', tmp: 'EPERM'}));
  assert.equal(step.name, SANDBOX_ON_STEP);
  assert.match(step.name, /^sandbox on \(CUA_SHIM_SANDBOX=default\): trusted roots unwritable/);
  assert.equal(step.status, 'PASS');
  assert.match(step.detail, /state\/codex EPERM, src\/services EPERM, vendor modules EPERM/);
});

test('sandbox on: one writable root, a file found planted, or an incomplete answer fails', () => {
  assert.equal(trustedRootStep('default', observed(['EPERM', 'written', 'EPERM'])).status, 'FAIL');
  assert.equal(trustedRootStep('default', observed(['EPERM', 'EPERM', 'EPERM'], {planted: ['src/services']})).status, 'FAIL');
  assert.equal(trustedRootStep('default', observed(['EPERM', 'EPERM'])).status, 'FAIL');
  const silent = trustedRootStep('default', {roots, results: null, planted: [], survivors: [], raw: 'no answer'});
  assert.equal(silent.status, 'FAIL');
  assert.match(silent.detail, /no answer/);
});

test('sandbox disabled (the default): what a cell could write is informational and accepted, never a failure', () => {
  const step = trustedRootStep('disabled', observed(['written', 'written', 'EACCES'], {planted: ['state/codex', 'src/services']}));
  assert.equal(step.name, SANDBOX_DISABLED_STEP);
  assert.match(step.name, /^sandbox disabled \(default\)/);
  assert.equal(step.status, 'INFO');
  assert.match(step.detail, /writable: state\/codex, src\/services; refused: vendor modules \(EACCES\)/);
  assert.match(step.detail, /accepted under the trust model \(owner decision, #20\)/);
  assert.match(step.detail, /removed and verified removed/);
  assert.equal(trustedRootStep('disabled', observed(['EPERM', 'EPERM', 'EPERM'])).status, 'INFO', 'nothing writable is still only information');
  const silent = trustedRootStep('disabled', {roots, results: null, planted: [], survivors: [], raw: 'no answer'});
  assert.equal(silent.status, 'INFO');
  assert.match(silent.detail, /not observed: no answer/);
});

test('a probe file left behind in a trusted root fails either way and names the root to clean', () => {
  for (const mode of ['default', 'disabled']) {
    const step = trustedRootStep(mode, observed(['EPERM', 'written', 'EPERM'], {planted: ['src/services'], survivors: ['/c/src/services/cua-m5-planted-x.mjs']}));
    assert.equal(step.status, 'FAIL', mode);
    assert.match(step.detail, /could not remove \/c\/src\/services\/cua-m5-planted-x\.mjs/, mode);
  }
});
