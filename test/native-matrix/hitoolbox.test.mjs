// The per-context input preference's reads and writes (scripts/native-matrix/hitoolbox.mjs; rulings 1181 and 1188).
// The real defaults and plutil run, but against a scratch property list standing in for com.apple.HIToolbox (the exec
// is injected and swaps the domain for the scratch file's path, and the unset script is given the path), so the test
// proves what cfprefsd and plutil do with the rewrite and never touches this Mac's own preferences.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GLOBAL_PROPERTIES, HITOOLBOX, PER_CONTEXT_KEY, UNSET_SCRIPT, inputWriteRefusal, ownerValueName, perContextCommand, readPerContextState, selectsSource, unsetPerContext, writePerContext}
  from '../../scripts/native-matrix/hitoolbox.mjs';

const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'};
const OWNERS_MAC = {env: {}, platform: 'darwin'};
const darwin = process.platform === 'darwin';
const scratches = [];
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });

// A scratch domain: a property list at a fresh path holding `xml`'s top-level keys, and an exec that runs the real tools
// with com.apple.HIToolbox replaced by that path.
function scratchDomain(xml) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-hitoolbox-')));
  scratches.push(dir);
  const file = join(dir, 'hitoolbox.plist');
  fs.writeFileSync(file, xml);
  execFileSync('/usr/bin/plutil', ['-convert', 'binary1', file]);
  const exec = (cmd, args, options = {}) => {
    const real = cmd === '/usr/bin/defaults' ? args.map(a => (a === HITOOLBOX ? file : a)) : args;
    return execFileSync(cmd, real, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options});
  };
  const exported = () => execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', file], {encoding: 'utf8'});
  const extract = path => execFileSync('/usr/bin/plutil', ['-extract', path, 'xml1', '-o', '-', file], {encoding: 'utf8'});
  return {file, exec, exported, extract};
}
const plist = body => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>`;
const SOURCES = '<key>AppleSelectedInputSources</key><array><dict><key>InputSourceKind</key><string>Keyboard Layout</string><key>KeyboardLayout ID</key><integer>252</integer></dict></array>';
const OTHERS = '<key>OtherInt</key><integer>7</integer><key>OtherReal</key><real>1.5</real><key>OtherData</key><data>AAE=</data><key>OtherDate</key><date>2026-01-01T00:00:00Z</date><key>OtherText</key><string>x &amp; &lt;y&gt; \'q\' "z"</string>';
const withKey = (value, rest = '') => `<key>${GLOBAL_PROPERTIES}</key><dict><key>${PER_CONTEXT_KEY}</key>${value}${rest}</dict>`;

test('off a GitHub-hosted runner nothing is written: the write and the unset refuse before any defaults or plutil call', () => {
  const calls = [];
  const exec = (...args) => { calls.push(args); return ''; };
  assert.throws(() => writePerContext(false, {exec, ...OWNERS_MAC}), /GitHub-hosted runner.*ruling 1188|ruling 1188.*GitHub-hosted/s);
  assert.throws(() => unsetPerContext({dictBefore: true, exec, ...OWNERS_MAC}), /GitHub-hosted runner/);
  assert.throws(() => writePerContext(true, {exec, env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'linux'}), /macOS/);
  assert.deepEqual(calls, []);
  assert.match(inputWriteRefusal(OWNERS_MAC), /ruling 1188/);
  assert.equal(inputWriteRefusal(HOSTED), null);
  assert.deepEqual([selectsSource(['input-source', 'current']), selectsSource(['input-source', 'com.apple.keylayout.ABC']), selectsSource(['input-source', 'x', '--at', '5']), selectsSource(['keystroke'])],
    [false, true, true, false]);
});

// The preference as typed, from one snapshot: a string where the dictionary belongs, or a number where the Boolean
// belongs, is malformed and never "unset".
test('the preference read as typed: on, off, unset in the dictionary, the dictionary absent, and malformed values named', {skip: !darwin}, () => {
  const read = body => readPerContextState({exec: scratchDomain(plist(body)).exec});
  assert.deepEqual(read(withKey('<true/>')), {dict: true, value: true});
  assert.deepEqual(read(withKey('<false/>', OTHERS)), {dict: true, value: false});
  assert.deepEqual(read(`<key>${GLOBAL_PROPERTIES}</key><dict>${OTHERS}</dict>`), {dict: true, value: null});
  assert.deepEqual(read(SOURCES), {dict: false, value: null});
  assert.deepEqual(read(`<key>${GLOBAL_PROPERTIES}</key><string>{ ${PER_CONTEXT_KEY} = 1; }</string>`), {dict: true, value: {malformed: `${GLOBAL_PROPERTIES} is a string, not a dictionary`}});
  assert.deepEqual(read(withKey('<integer>1</integer>')), {dict: true, value: {malformed: `${PER_CONTEXT_KEY} is a integer, not a Boolean`}});
  assert.equal(ownerValueName({malformed: 'x is a string'}), 'malformed (x is a string)');
  assert.deepEqual([ownerValueName(true), ownerValueName(false), ownerValueName(null)], ['on', 'off', 'unset']);
  const broken = () => { throw Object.assign(new Error('exit 1'), {status: 1, stderr: 'cfprefsd is not answering'}); };
  assert.throws(() => readPerContextState({exec: broken}), /could not read the per-context input preference.*cfprefsd is not answering/);
});

test('unset with other keys in the dictionary: only the nested key goes, every other value keeps its type, and no other top-level key changes', {skip: !darwin}, () => {
  const d = scratchDomain(plist(`${SOURCES}${withKey('<true/>', OTHERS)}`));
  const before = d.extract(GLOBAL_PROPERTIES);
  // An owner's change to another top-level key during the run survives the restore.
  execFileSync('/usr/bin/defaults', ['write', d.file, 'AppleCurrentKeyboardLayoutInputSourceID', 'com.apple.keylayout.2SetHangul']);
  const others = d.extract('AppleSelectedInputSources');
  assert.deepEqual(unsetPerContext({dictBefore: true, domain: d.file, ...HOSTED}), {changed: 'rewritten'});
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: null});
  assert.equal(d.extract(GLOBAL_PROPERTIES), before.replace(/\t<key>TextInputGlobalPropertyPerContextInput<\/key>\n\t<true\/>\n/, ''), 'the other nested keys as before, types included');
  assert.equal(d.extract('AppleSelectedInputSources'), others);
  assert.equal(execFileSync('/usr/bin/defaults', ['read', d.file, 'AppleCurrentKeyboardLayoutInputSourceID'], {encoding: 'utf8'}).trim(), 'com.apple.keylayout.2SetHangul');
  assert.doesNotMatch(fs.readFileSync(UNSET_SCRIPT, 'utf8'), /defaults import|PlistBuddy|> *"?\$domain/, 'never a domain import or a file edit');
});

test('unset when the run created the dictionary: it is deleted, as the owner had it; when it existed or is unknown, it stays, empty', {skip: !darwin}, () => {
  const only = plist(`${SOURCES}${withKey('<false/>')}`);
  const created = scratchDomain(only);
  assert.deepEqual(unsetPerContext({dictBefore: false, domain: created.file, ...HOSTED}), {changed: 'deleted'});
  assert.deepEqual(readPerContextState({exec: created.exec}), {dict: false, value: null});
  assert.match(created.extract('AppleSelectedInputSources'), /<integer>252<\/integer>/, 'the other top-level keys stay');
  for (const dictBefore of [true, undefined]) {
    const existed = scratchDomain(only);
    assert.deepEqual(unsetPerContext({dictBefore, domain: existed.file, ...HOSTED}), {changed: 'rewritten'});
    assert.deepEqual(readPerContextState({exec: existed.exec}), {dict: true, value: null}, 'deleted only when the dictionary was absent before');
  }
  // A dictionary the run created that another writer has since added to keeps that writer's key.
  const shared = scratchDomain(plist(withKey('<true/>', '<key>Late</key><integer>1</integer>')));
  assert.deepEqual(unsetPerContext({dictBefore: false, domain: shared.file, ...HOSTED}), {changed: 'rewritten'});
  assert.match(shared.extract(`${GLOBAL_PROPERTIES}.Late`), /<integer>1<\/integer>/);
});

// The recovery command fails closed and is safe to repeat: a key already absent writes nothing, and an extraction that
// fails never hands defaults an empty value or a string.
test('the unset is safe to repeat and fails closed: already unset writes nothing; a malformed dictionary or an unreadable domain is never written', {skip: !darwin}, () => {
  const twice = scratchDomain(plist(`${SOURCES}${withKey('<true/>', OTHERS)}`));
  assert.deepEqual(unsetPerContext({dictBefore: true, domain: twice.file, ...HOSTED}), {changed: 'rewritten'});
  const once = twice.exported();
  assert.deepEqual(unsetPerContext({dictBefore: true, domain: twice.file, ...HOSTED}), {changed: 'none'});
  assert.equal(twice.exported(), once, 'the second run wrote nothing');
  const none = scratchDomain(plist(SOURCES));
  const untouched = none.exported();
  assert.deepEqual(unsetPerContext({dictBefore: false, domain: none.file, ...HOSTED}), {changed: 'none'});
  assert.equal(none.exported(), untouched);
  // A string where the dictionary belongs: nothing extracted, nothing written, a failure naming it.
  const malformed = scratchDomain(plist(`<key>${GLOBAL_PROPERTIES}</key><string>oops</string>`));
  const kept = malformed.exported();
  assert.throws(() => unsetPerContext({dictBefore: true, domain: malformed.file, ...HOSTED}), /AppleGlobalTextInputProperties is a string, not a dictionary: nothing written/);
  assert.equal(malformed.exported(), kept);
  // An export, an extraction or a removal that fails, or a removal that prints nothing: the script stops before any
  // write, and the domain is as it was. The tools are the real ones but for a stand-in that fails one call.
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-hitoolbox-')));
  scratches.push(dir);
  const standIn = (name, real, failing, how) => {
    const file = join(dir, name);
    fs.writeFileSync(file, `#!/bin/sh\ncase " $* " in *" ${failing} "*) ${how};; esac\nexec ${real} "$@"\n`, {mode: 0o755});
    return file;
  };
  const failures = [
    [{UNSET_DEFAULTS: standIn('defaults-export', '/usr/bin/defaults', 'export', 'echo "cfprefsd is not answering" >&2; exit 1')}, /could not unset.*cfprefsd is not answering/],
    [{UNSET_PLUTIL: standIn('plutil-extract', '/usr/bin/plutil', '-extract', 'echo "extraction failed" >&2; exit 1')}, /could not unset.*extraction failed/],
    [{UNSET_PLUTIL: standIn('plutil-remove', '/usr/bin/plutil', '-remove', 'echo "removal failed" >&2; exit 1')}, /could not unset.*removal failed/],
    [{UNSET_PLUTIL: standIn('plutil-silent', '/usr/bin/plutil', '-remove', 'exit 0')}, /plutil left no property list: nothing written/],
    [{UNSET_PLUTIL: standIn('plutil-type', '/usr/bin/plutil', '-type', 'echo "type failed" >&2; exit 1')}, /plutil -type AppleGlobalTextInputProperties failed: type failed: nothing written/],
  ];
  for (const [tools, why] of failures) {
    const d = scratchDomain(plist(`${SOURCES}${withKey('<true/>', OTHERS)}`));
    const was = d.exported();
    const exec = (cmd, args, options) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: {...options.env, ...tools}});
    assert.throws(() => unsetPerContext({dictBefore: false, domain: d.file, exec, ...HOSTED}), why);
    assert.equal(d.exported(), was, `nothing written: ${Object.values(tools)[0]}`);
  }
});

// The script is a CLI a person can run, so it guards every write itself: off a GitHub-hosted runner a plain run
// refuses before any defaults call, whatever the domain's spelling (its name, or a path, which may be the owner's own
// plist), and only the owner's explicit `--manual-recovery` writes there. The defaults here is a recorder that never
// delegates, so not even a guard that failed could touch this Mac's domain.
test('the script refuses off a hosted runner, by domain name or by path, unless asked for manual recovery', {skip: !darwin}, () => {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-hitoolbox-')));
  scratches.push(dir);
  const log = join(dir, 'calls'), recorder = join(dir, 'defaults');
  fs.writeFileSync(recorder, `#!/bin/sh\necho "$*" >> '${log}'\necho 'the recorder never answers' >&2\nexit 1\n`, {mode: 0o755});
  const {RUNNER_ENVIRONMENT, ...offHosted} = process.env;
  const run = (args, env = offHosted) => spawnSync('/bin/sh', [UNSET_SCRIPT, ...args], {encoding: 'utf8', env: {...env, UNSET_DEFAULTS: recorder}});
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []);
  const ownersPlist = join(process.env.HOME ?? '/Users/owner', 'Library/Preferences/com.apple.HIToolbox.plist');
  const scratchPlist = join(dir, 'hitoolbox.plist');
  for (const args of [[], ['--delete-if-empty'], [HITOOLBOX], ['--delete-if-empty', HITOOLBOX], [ownersPlist], [scratchPlist]]) {
    const refused = run(args);
    assert.equal(refused.status, 2, `${args.join(' ')}: ${refused.stderr}`);
    assert.match(refused.stderr, /refused: off a GitHub-hosted runner the harness never writes .*\(ruling 1188\).*--manual-recovery/);
    assert.deepEqual(calls(), [], 'no defaults call');
  }
  // The owner's own recovery, and a hosted runner's run, reach the domain (here, the recorder).
  assert.equal(run(['--manual-recovery', '--delete-if-empty']).status, 1);
  assert.equal(run([], {...offHosted, RUNNER_ENVIRONMENT: 'github-hosted'}).status, 1);
  assert.deepEqual(calls(), ['export com.apple.HIToolbox -', 'export com.apple.HIToolbox -']);
  // A test's scratch domain runs only as a hosted runner's or in the manual mode, like any other.
  const d = scratchDomain(plist(`${SOURCES}${withKey('<true/>', OTHERS)}`));
  const plain = spawnSync('/bin/sh', [UNSET_SCRIPT, d.file], {encoding: 'utf8', env: offHosted});
  assert.equal(plain.status, 2, plain.stderr);
  const manual = spawnSync('/bin/sh', [UNSET_SCRIPT, '--manual-recovery', d.file], {encoding: 'utf8', env: offHosted});
  assert.deepEqual([manual.status, manual.stdout.trim()], [0, 'rewritten'], manual.stderr);
});

test('on and off are written into the dictionary, keeping its other keys', {skip: !darwin}, () => {
  const d = scratchDomain(plist(`<key>${GLOBAL_PROPERTIES}</key><dict>${OTHERS}</dict>`));
  writePerContext(true, {exec: d.exec, ...HOSTED});
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: true});
  writePerContext(false, {exec: d.exec, ...HOSTED});
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: false});
  assert.match(d.extract(GLOBAL_PROPERTIES), /<real>1.5<\/real>/);
});

// The command a failure names is the one that works: the unset one is the script itself, run as a person would.
test('the command that sets each owner value back is exact, and the unset one runs as given and again', {skip: !darwin}, () => {
  assert.equal(perContextCommand(true), `defaults write ${HITOOLBOX} ${GLOBAL_PROPERTIES} -dict-add ${PER_CONTEXT_KEY} -bool true`);
  assert.equal(perContextCommand(false), `defaults write ${HITOOLBOX} ${GLOBAL_PROPERTIES} -dict-add ${PER_CONTEXT_KEY} -bool false`);
  assert.equal(perContextCommand(null, {dictBefore: true}), 'sh scripts/native-matrix/unset-per-context.sh --manual-recovery (in the harness checkout)');
  assert.equal(perContextCommand(null, {dictBefore: false}), 'sh scripts/native-matrix/unset-per-context.sh --manual-recovery --delete-if-empty (in the harness checkout)');
  assert.match(perContextCommand({malformed: 'x'}), /^none: .*by hand$/);
  const d = scratchDomain(plist(`${SOURCES}${withKey('<true/>', OTHERS)}`));
  const repo = new URL('../../', import.meta.url).pathname;
  const command = perContextCommand(null, {dictBefore: true}).replace(' (in the harness checkout)', '');
  assert.equal(execFileSync('/bin/sh', ['-c', `${command} '${d.file}'`], {cwd: repo, encoding: 'utf8'}).trim(), 'rewritten');
  assert.equal(execFileSync('/bin/sh', ['-c', `${command} '${d.file}'`], {cwd: repo, encoding: 'utf8'}).trim(), 'none', 'safe to repeat');
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: null});
});
