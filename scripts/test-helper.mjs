#!/usr/bin/env node
// `npm run test:helper`: the actual Swift helper's tests, separate from the Node-only `npm test`. Requires the
// production helper from `npm run build:helper`; builds the test-owned products (in-memory test host, pty driver)
// next to it, then runs the Swift tests (production code with injected in-memory storage and pseudo-terminals) and
// the Node-driven tests of the built executables. Nothing here reads or writes the Keychain or needs a prompt.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {PACKAGE_DIR, BUILD_OUTPUT, locateHelper} from '../src/secrets/helper.mjs';

if (!locateHelper({path: BUILD_OUTPUT}).built) {
  console.error('test:helper: run `npm run build:helper` first; these tests exercise the built production helper');
  process.exit(1);
}
const run = (command, args, env = {}) => {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const r = spawnSync(command, args, {stdio: 'inherit', env: {...process.env, ...env}});
  return !r.error && r.status === 0;
};
const swift = ['--package-path', PACKAGE_DIR];
const binDir = join(PACKAGE_DIR, '.build', 'release');
const built = ['cua-keychain-testhost', 'cua-keychain-pty'].every(product => run('swift', ['build', '-c', 'release', ...swift, '--product', product]));
if (!built) process.exit(1);
// The Command Line Tools for Swift 6.4 ship swift-testing's macro plugin in usr/lib/swift/host/plugins/testing but
// do not hand that directory to the compiler, so `swift test` stops at "plugin for module 'TestingMacros' not found"
// (found by the clean-machine gate, issue #9). Name it there; Xcode is unchanged.
const developerDir = process.env.DEVELOPER_DIR || spawnSync('xcode-select', ['-p'], {encoding: 'utf8'}).stdout?.trim() || '';
const testingPlugins = join(developerDir, 'usr', 'lib', 'swift', 'host', 'plugins', 'testing');
const pluginArgs = developerDir.endsWith('/CommandLineTools') && existsSync(testingPlugins) ? ['-Xswiftc', '-plugin-path', '-Xswiftc', testingPlugins] : [];
const swiftTests = run('swift', ['test', ...swift, ...pluginArgs], {CUA_KEYCHAIN_BIN_DIR: binDir});
const nodeTests = run(process.execPath, ['--test', join(PACKAGE_DIR, 'test', '*.test.mjs')], {CUA_KEYCHAIN_BIN_DIR: binDir});
console.log(`\ntest:helper: swift tests ${swiftTests ? 'passed' : 'FAILED'}; node-driven executable tests ${nodeTests ? 'passed' : 'FAILED'}`);
process.exit(swiftTests && nodeTests ? 0 : 1);
