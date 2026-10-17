// The cfprefsd measurement's reduction (scripts/sandbox-probe/denials.mjs): only node's denials, mach names and
// preference domains kept, filesystem targets reduced to a class, and the two sides compared.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareDenials, summarize, targetClass} from '../../scripts/sandbox-probe/denials.mjs';

const event = message => JSON.stringify({eventMessage: message, processImagePath: '/kernel'});

test('only node\'s denials count, by operation and a target that never carries an account path', () => {
  const text = [
    event('Sandbox: node(501) deny(1) mach-lookup com.apple.cfprefsd.daemon'),
    event('Sandbox: node(502) deny(1) mach-lookup com.apple.cfprefsd.daemon'),
    event('Sandbox: node(501) deny(1) file-read-data /Users/someone/Documents/private.txt'),
    event('Sandbox: node(501) deny(1) file-read-metadata /Users/someone/Library/Application Support/cua/state'),
    event('Sandbox: Safari(77) deny(1) mach-lookup com.apple.other'),
    'not json', '',
  ].join('\n');
  assert.deepEqual(summarize(text), [
    {operation: 'file-read-data', target: '<home>', count: 1},
    {operation: 'file-read-metadata', target: '<cua home>', count: 1},
    {operation: 'mach-lookup', target: 'com.apple.cfprefsd.daemon', count: 2},
  ]);
  assert.equal(targetClass('file-read-data', '/Users/x/cua-115/home/run/abc/tmp'), '<run directory>');
  assert.equal(targetClass('file-read-data', '/System/Library/x'), '<system>');
});

test('the comparison names what only the after side denies, what went away, and every preferences denial after', () => {
  const before = [{operation: 'mach-lookup', target: 'a', count: 1}];
  const after = [{operation: 'mach-lookup', target: 'com.apple.cfprefsd.daemon', count: 3}, {operation: 'user-preference-read', target: 'kCFPreferencesAnyApplication', count: 1}];
  const result = compareDenials(before, after);
  assert.deepEqual(result.new.map(d => d.target), ['com.apple.cfprefsd.daemon', 'kCFPreferencesAnyApplication']);
  assert.deepEqual(result.gone.map(d => d.target), ['a']);
  assert.equal(result.preferences.length, 2);
});
