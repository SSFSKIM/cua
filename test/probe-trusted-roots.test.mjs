// The trusted-root step of scripts/probe-secrets.mjs (issues #20, #34, #36): under the scoped default no cell may plant
// a module in a trusted code root while its own run directory and $TMPDIR stay writable, and that is a guarantee (PASS
// or FAIL); with CUA_SHIM_SANDBOX=disabled what a cell could write is recorded as the accepted consequence of #20
// (INFO), never a failure. Either way a file the probe could not remove again from a trusted root is a FAIL: the probe
// must leave no trace there.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SANDBOX_DISABLED_STEP, SANDBOX_SCOPED_STEP, trustedRootStep} from '../scripts/probe/trusted-roots.mjs';

const roots = [{label: 'state/codex', path: '/h/state/codex'}, {label: 'src/services', path: '/c/src/services'}, {label: 'vendor modules', path: '/h/runtimes/r/modules'}];
const observed = (results, extra = {}) => ({roots, results, planted: [], survivors: [], cwd: 'written', tmp: 'written', ...extra});

test('scoped (the default): every trusted root refusing the write while the run directory and $TMPDIR take it is a PASS', () => {
  const step = trustedRootStep('scoped', observed(['EPERM', 'EPERM', 'EPERM']));
  assert.equal(step.name, SANDBOX_SCOPED_STEP);
  assert.match(step.name, /^sandbox scoped \(default\): trusted roots unwritable, run directory and \$TMPDIR writable/);
  assert.equal(step.status, 'PASS');
  assert.match(step.detail, /state\/codex EPERM, src\/services EPERM, vendor modules EPERM; run directory written, \$TMPDIR written/);
});

test('scoped: one writable root, a file found planted, an incomplete answer, or a refused run directory or $TMPDIR fails', () => {
  assert.equal(trustedRootStep('scoped', observed(['EPERM', 'written', 'EPERM'])).status, 'FAIL');
  assert.equal(trustedRootStep('scoped', observed(['EPERM', 'EPERM', 'EPERM'], {planted: ['src/services']})).status, 'FAIL');
  assert.equal(trustedRootStep('scoped', observed(['EPERM', 'EPERM'])).status, 'FAIL');
  // Everything refused is node_repl's write-denying default, not the scoped profile: cua did not send it.
  const allRefused = trustedRootStep('scoped', observed(['EPERM', 'EPERM', 'EPERM'], {cwd: 'EPERM', tmp: 'EPERM'}));
  assert.equal(allRefused.status, 'FAIL');
  assert.match(allRefused.detail, /run directory EPERM, \$TMPDIR EPERM/);
  assert.equal(trustedRootStep('scoped', observed(['EPERM', 'EPERM', 'EPERM'], {tmp: 'EPERM'})).status, 'FAIL');
  const silent = trustedRootStep('scoped', {roots, results: null, planted: [], survivors: [], raw: 'no answer'});
  assert.equal(silent.status, 'FAIL');
  assert.match(silent.detail, /no answer/);
});

test('scoped without a granted temp root ($TMPDIR unset, empty or relative): a refused $TMPDIR write is expected, not a failure', () => {
  const step = trustedRootStep('scoped', observed(['EPERM', 'EPERM', 'EPERM'], {tmp: 'EPERM', tmpGranted: false}));
  assert.equal(step.status, 'PASS');
  assert.match(step.detail, /\$TMPDIR EPERM \(no temp root granted\)/);
  assert.equal(trustedRootStep('scoped', observed(['EPERM', 'EPERM', 'EPERM'], {cwd: 'EPERM', tmp: 'EPERM', tmpGranted: false})).status, 'FAIL', 'the run directory must still take the write');
});

test('sandbox disabled (requested explicitly): what a cell could write is informational and accepted, never a failure', () => {
  const step = trustedRootStep('disabled', observed(['written', 'written', 'EACCES'], {planted: ['state/codex', 'src/services']}));
  assert.equal(step.name, SANDBOX_DISABLED_STEP);
  assert.match(step.name, /^sandbox disabled \(CUA_SHIM_SANDBOX=disabled\)/);
  assert.equal(step.status, 'INFO');
  assert.match(step.detail, /writable: state\/codex, src\/services; refused: vendor modules \(EACCES\)/);
  assert.match(step.detail, /accepted under the trust model \(owner decision, #20\)/);
  assert.match(step.detail, /the scoped default keeps them read-only/);
  assert.match(step.detail, /removed and verified removed/);
  assert.equal(trustedRootStep('disabled', observed(['EPERM', 'EPERM', 'EPERM'])).status, 'INFO', 'nothing writable is still only information');
  const silent = trustedRootStep('disabled', {roots, results: null, planted: [], survivors: [], raw: 'no answer'});
  assert.equal(silent.status, 'INFO');
  assert.match(silent.detail, /not observed: no answer/);
});

test('a probe file left behind in a trusted root fails either way and names the root to clean; another mode is a probe bug', () => {
  assert.throws(() => trustedRootStep('default', observed(['EPERM', 'EPERM', 'EPERM'])), /scoped or disabled/);
  for (const mode of ['scoped', 'disabled']) {
    const step = trustedRootStep(mode, observed(['EPERM', 'written', 'EPERM'], {planted: ['src/services'], survivors: ['/c/src/services/cua-m5-planted-x.mjs']}));
    assert.equal(step.status, 'FAIL', mode);
    assert.match(step.detail, /could not remove \/c\/src\/services\/cua-m5-planted-x\.mjs/, mode);
  }
});
