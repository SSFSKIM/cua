// Test-owned seeding channel for the opt-in live Keychain roundtrip (M4's live check, M6's acceptance 6). It stores a
// generated value through the production helper's own `set`, typed at a pseudo-terminal by the test-owned
// `cua-keychain-pty` driver, so the Keychain item is created by the production helper's code identity, exactly as
// when a person runs `cua secrets set`. The value travels parent -> driver over the driver's stdin pipe and driver
// -> helper over the pty; it never appears in argv, environment, files or output, and the helper gains no input
// route: it still reads only its controlling terminal. Nothing here is built by `npm run build:helper` or reachable
// from the `cua` CLI.
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {PACKAGE_DIR} from '../../../src/secrets/helper.mjs';

export const PTY_DRIVER = join(PACKAGE_DIR, '.build', 'release', 'cua-keychain-pty');
export const TESTHOST = join(PACKAGE_DIR, '.build', 'release', 'cua-keychain-testhost');

// Runs `<helper> set <label>` on a fresh pty and types `value` at both hidden prompts. Resolves metadata only:
// {exit, signal, timedOut, failedStep, terminalRestored, echoed}, where `echoed` says whether the value showed up in
// the terminal output (it never should).
export function setThroughTerminal({helper, label, value, timeoutMs = 15_000, driver = PTY_DRIVER, env}) {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('seed values must be non-empty text without control characters');
  const script = JSON.stringify({steps: [
    {expect: '(input hidden)', send: `${value}\r`},
    {expect: 'confirm', send: `${value}\r`},
  ]});
  return new Promise(resolve => {
    const child = execFile(driver, ['--timeout-ms', String(timeoutMs), '--', helper, 'set', label], {encoding: 'utf8', timeout: timeoutMs + 5000, killSignal: 'SIGKILL', env}, (_error, stdout) => {
      let report = {};
      try { report = JSON.parse(stdout); } catch {}
      const output = typeof report.output === 'string' ? report.output : '';
      resolve({
        exit: report.exit ?? null, signal: report.signal ?? null, timedOut: report.timedOut ?? true,
        failedStep: report.failedStep ?? null, terminalRestored: report.terminalRestored ?? false,
        echoed: output.includes(value) || stdout.includes(value),
      });
    });
    child.stdin.end(script);
  });
}
