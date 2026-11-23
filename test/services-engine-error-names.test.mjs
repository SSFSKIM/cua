// The engines' error names in one place (src/services/engine/error-names.mjs): cua's engine's own exactly as its Swift
// sources raise them, the vendor's as the pinned client numbers them, and the native matrix judge's kinds drawn from them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ENGINE_ERROR_NAMES, errorNameOf, isErrorName, VENDOR_ERROR_NAMES} from '../src/services/engine/error-names.mjs';
import {SkyComputerUseError} from '../src/services/engine/protocol.mjs';
import {REFUSAL_NAMES, UNCONFIRMED_NAMES} from '../scripts/native-matrix/answers.mjs';

const SOURCES = fileURLToPath(new URL('../native/engine/Sources/', import.meta.url));
const swift = dir => readdirSync(dir, {withFileTypes: true}).flatMap(e => (e.isDirectory() ? swift(join(dir, e.name)) : e.name.endsWith('.swift') ? [readFileSync(join(dir, e.name), 'utf8')] : []));
const casesOf = (text, name) => [...new RegExp(`enum ${name}: Int \\{([^}]*)\\}`).exec(text)[1].matchAll(/case (\w+) =/g)].map(m => m[1]);

test('cua\'s engine\'s names are exactly the ones its Swift sources raise, and the vendor\'s codes keep theirs', () => {
  const sources = swift(SOURCES).join('\n');
  const named = [...sources.matchAll(/EngineError\(name: "(\w+)"/g)].map(m => m[1]);
  const minimized = /let windowMinimizedReason = "(\w+)"/.exec(sources)[1];
  const protocol = readFileSync(join(SOURCES, 'Engine/Protocol.swift'), 'utf8');
  const fromSwift = new Set([...named, minimized, ...casesOf(protocol, 'RPCCode')]);
  const own = ENGINE_ERROR_NAMES.filter(n => n !== 'invalidElementID');
  assert.deepEqual([...fromSwift].filter(n => !own.includes(n)).sort(), [], 'a name the engine raises is missing from the set');
  assert.deepEqual(own.filter(n => !fromSwift.has(n)).sort(), [], 'a name in the set the engine no longer raises');
  // The engine's vendor codes are named as the vendor names them.
  for (const name of casesOf(protocol, 'VendorCode')) assert.ok(VENDOR_ERROR_NAMES.includes(name), name);
  // The service's own refusal (src/services/engine/observations.mjs).
  assert.match(readFileSync(fileURLToPath(new URL('../src/services/engine/observations.mjs', import.meta.url)), 'utf8'), /refused\('invalidElementID'/);
});

test('the matrix judge\'s refusal and unconfirmed kinds are names of the set', () => {
  for (const name of [...REFUSAL_NAMES, ...UNCONFIRMED_NAMES]) assert.ok(ENGINE_ERROR_NAMES.includes(name), name);
});

test('errorNameOf: an engine error of a known name, never anything else', () => {
  assert.equal(errorNameOf(new SkyComputerUseError({code: -10005, reason: 'x', errorName: 'typeUnconfirmed'})), 'typeUnconfirmed');
  assert.equal(errorNameOf(new SkyComputerUseError({code: -10016, reason: 'x'})), 'userIntervened', 'the vendor\'s name for its code');
  assert.equal(errorNameOf(new SkyComputerUseError({code: -1, reason: 'x', errorName: 'notAName'})), null);
  assert.equal(errorNameOf(Object.assign(new Error('x'), {errorName: 'typeUnconfirmed'})), null);
  assert.equal(errorNameOf({name: 'SkyComputerUseError', errorName: 'typeUnconfirmed'}), null, 'not an Error');
  assert.equal(errorNameOf(null), null);
  assert.equal(isErrorName('constructor'), false);
});
