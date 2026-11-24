// The per-context input preference's reads and writes (scripts/native-matrix/hitoolbox.mjs; rulings 1181 and 1188).
// The real defaults and plutil run, but against a scratch property list standing in for com.apple.HIToolbox (the exec
// is injected and swaps the domain for the scratch file's path), so the test proves what cfprefsd and plutil do with
// the rewrite and never touches this Mac's own preferences.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GLOBAL_PROPERTIES, HITOOLBOX, PER_CONTEXT_KEY, inputWriteRefusal, parsePerContext, perContextCommand, readPerContextState, selectsSource, unsetPerContext, writePerContext}
  from '../../scripts/native-matrix/hitoolbox.mjs';

const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'};
const OWNERS_MAC = {env: {}, platform: 'darwin'};
const darwin = process.platform === 'darwin';
const scratches = [];
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });

// A scratch domain: a property list at a fresh path holding `xml`'s top-level keys, and an exec that runs the real tools
// with com.apple.HIToolbox replaced by that path, recording every call.
function scratchDomain(xml) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-hitoolbox-')));
  scratches.push(dir);
  const file = join(dir, 'hitoolbox.plist');
  fs.writeFileSync(file, xml);
  execFileSync('/usr/bin/plutil', ['-convert', 'binary1', file]);
  const calls = [];
  const exec = (cmd, args, options = {}) => {
    calls.push([cmd.split('/').at(-1), ...args.map(a => (a.startsWith('<?xml') ? '<xml>' : a))]);
    const real = cmd === '/usr/bin/defaults' ? args.map(a => (a === HITOOLBOX ? file : a)) : args;
    return execFileSync(cmd, real, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options});
  };
  const exported = () => execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', file], {encoding: 'utf8'});
  const extract = path => execFileSync('/usr/bin/plutil', ['-extract', path, 'xml1', '-o', '-', file], {encoding: 'utf8'});
  return {file, exec, calls, exported, extract};
}
const plist = body => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>`;
const SOURCES = '<key>AppleSelectedInputSources</key><array><dict><key>InputSourceKind</key><string>Keyboard Layout</string><key>KeyboardLayout ID</key><integer>252</integer></dict></array>';
const OTHERS = '<key>OtherInt</key><integer>7</integer><key>OtherReal</key><real>1.5</real><key>OtherData</key><data>AAE=</data><key>OtherDate</key><date>2026-01-01T00:00:00Z</date><key>OtherText</key><string>x &amp; &lt;y&gt; \'q\' "z"</string>';
const writesOf = calls => calls.filter(c => c[0] === 'defaults' && ['write', 'delete', 'import'].includes(c[1]));

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

test('the preference read: on, off, unset inside the dictionary, and the dictionary absent', () => {
  assert.equal(parsePerContext(`{\n    ${PER_CONTEXT_KEY} = 1;\n}\n`), true);
  assert.equal(parsePerContext(`{\n    ${PER_CONTEXT_KEY} = 0;\n}`), false);
  assert.equal(parsePerContext('{\n    SomethingElse = 1;\n}'), null);
  const answer = text => () => text;
  assert.deepEqual(readPerContextState({exec: answer(`{\n    ${PER_CONTEXT_KEY} = 1;\n}`)}), {dict: true, value: true});
  assert.deepEqual(readPerContextState({exec: answer('{\n}')}), {dict: true, value: null});
  const absent = () => { throw Object.assign(new Error('exit 1'), {status: 1, stderr: `Error: Could not find key '${GLOBAL_PROPERTIES}' in domain '${HITOOLBOX}'.`}); };
  assert.deepEqual(readPerContextState({exec: absent}), {dict: false, value: null});
  const broken = () => { throw Object.assign(new Error('exit 1'), {status: 1, stderr: 'cfprefsd is not answering'}); };
  assert.throws(() => readPerContextState({exec: broken}), /could not read the per-context input preference/);
});

test('unset with other keys in the dictionary: only the nested key goes, every other value keeps its type, and no other top-level key is written', {skip: !darwin}, () => {
  const d = scratchDomain(plist(`${SOURCES}<key>${GLOBAL_PROPERTIES}</key><dict><key>${PER_CONTEXT_KEY}</key><true/>${OTHERS}</dict>`));
  const before = d.extract(GLOBAL_PROPERTIES);
  // An owner's change to another top-level key during the run survives the restore.
  execFileSync('/usr/bin/defaults', ['write', d.file, 'AppleCurrentKeyboardLayoutInputSourceID', 'com.apple.keylayout.2SetHangul']);
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: true});
  assert.deepEqual(unsetPerContext({dictBefore: true, exec: d.exec, ...HOSTED}), {changed: 'rewritten'});
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: null});
  const after_ = d.extract(GLOBAL_PROPERTIES);
  assert.equal(after_, before.replace(/\t<key>TextInputGlobalPropertyPerContextInput<\/key>\n\t<true\/>\n/, ''), 'the other nested keys are byte-for-byte as before, types included');
  assert.match(after_, /<integer>7<\/integer>/);
  assert.match(after_, /<real>1.5<\/real>/);
  assert.match(after_, /<date>2026-01-01T00:00:00Z<\/date>/);
  assert.match(d.extract('AppleSelectedInputSources'), /<integer>252<\/integer>/);
  assert.equal(execFileSync('/usr/bin/defaults', ['read', d.file, 'AppleCurrentKeyboardLayoutInputSourceID'], {encoding: 'utf8'}).trim(), 'com.apple.keylayout.2SetHangul');
  assert.deepEqual(writesOf(d.calls), [['defaults', 'write', HITOOLBOX, GLOBAL_PROPERTIES, '<xml>']], 'one write, of the one top-level key; never an import');
});

test('unset when the run created the dictionary: it is deleted, as the owner had it; when it existed or is unknown, it stays, empty', {skip: !darwin}, () => {
  const only = plist(`${SOURCES}<key>${GLOBAL_PROPERTIES}</key><dict><key>${PER_CONTEXT_KEY}</key><false/></dict>`);
  const created = scratchDomain(only);
  assert.deepEqual(unsetPerContext({dictBefore: false, exec: created.exec, ...HOSTED}), {changed: 'deleted'});
  assert.deepEqual(readPerContextState({exec: created.exec}), {dict: false, value: null});
  assert.deepEqual(writesOf(created.calls), [['defaults', 'delete', HITOOLBOX, GLOBAL_PROPERTIES]]);
  assert.match(created.extract('AppleSelectedInputSources'), /<integer>252<\/integer>/, 'the other top-level keys stay');
  for (const dictBefore of [true, undefined]) {
    const existed = scratchDomain(only);
    assert.deepEqual(unsetPerContext({dictBefore, exec: existed.exec, ...HOSTED}), {changed: 'rewritten'});
    assert.deepEqual(readPerContextState({exec: existed.exec}), {dict: true, value: null});
    assert.equal(writesOf(existed.calls).some(c => c[1] === 'delete'), false, 'the delete happens only when the dictionary was absent before');
  }
  // A dictionary the run created that another writer has since added to keeps that writer's key.
  const shared = scratchDomain(plist(`<key>${GLOBAL_PROPERTIES}</key><dict><key>${PER_CONTEXT_KEY}</key><true/><key>Late</key><integer>1</integer></dict>`));
  assert.deepEqual(unsetPerContext({dictBefore: false, exec: shared.exec, ...HOSTED}), {changed: 'rewritten'});
  assert.match(shared.extract(`${GLOBAL_PROPERTIES}.Late`), /<integer>1<\/integer>/);
});

test('unset when already unset, or with no dictionary at all, writes nothing', {skip: !darwin}, () => {
  for (const xml of [plist(`${SOURCES}<key>${GLOBAL_PROPERTIES}</key><dict>${OTHERS}</dict>`), plist(SOURCES)]) {
    const d = scratchDomain(xml);
    assert.deepEqual(unsetPerContext({dictBefore: true, exec: d.exec, ...HOSTED}), {changed: 'none'});
    assert.deepEqual(writesOf(d.calls), []);
  }
});

test('on and off are written into the dictionary, keeping its other keys', {skip: !darwin}, () => {
  const d = scratchDomain(plist(`<key>${GLOBAL_PROPERTIES}</key><dict>${OTHERS}</dict>`));
  writePerContext(true, {exec: d.exec, ...HOSTED});
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: true});
  writePerContext(false, {exec: d.exec, ...HOSTED});
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: false});
  assert.match(d.extract(GLOBAL_PROPERTIES), /<real>1.5<\/real>/);
});

// The command a failure names is the one that works: run as written (through a shell) against the scratch domain.
test('the command that sets each owner value back is exact, and the unset one runs as given', {skip: !darwin}, () => {
  assert.equal(perContextCommand(true), `defaults write ${HITOOLBOX} ${GLOBAL_PROPERTIES} -dict-add ${PER_CONTEXT_KEY} -bool true`);
  assert.equal(perContextCommand(false), `defaults write ${HITOOLBOX} ${GLOBAL_PROPERTIES} -dict-add ${PER_CONTEXT_KEY} -bool false`);
  assert.match(perContextCommand(null, {dictBefore: false}), /^defaults delete com\.apple\.HIToolbox AppleGlobalTextInputProperties when/);
  const unset = perContextCommand(null, {dictBefore: true});
  assert.doesNotMatch(unset, /System Settings/);
  const d = scratchDomain(plist(`${SOURCES}<key>${GLOBAL_PROPERTIES}</key><dict><key>${PER_CONTEXT_KEY}</key><true/>${OTHERS}</dict>`));
  execFileSync('/bin/sh', ['-c', unset.replaceAll(HITOOLBOX, `'${d.file}'`)]);
  assert.deepEqual(readPerContextState({exec: d.exec}), {dict: true, value: null});
  assert.match(d.extract(GLOBAL_PROPERTIES), /<integer>7<\/integer>/);
});
