// The supervisor's privileged boundaries as pure functions: elicitation requests and answers
// (src/repl-host/elicitation.mjs) and LaunchServices through a mocked OS boundary (src/repl-host/launch-services.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FORM_UNSUPPORTED_SENTENCE, INVALID_SCHEMA_PREFIX, UNEXPECTED_RESPONSE_SENTENCE, elicitationOutcome, elicitationParams, formElicitationSupported} from '../../src/repl-host/elicitation.mjs';
import {DISPATCH_FAILED_PREFIX, EXACTLY_ONE_SENTENCE, MACOS_ONLY_SENTENCE, PATH_NOT_ABSOLUTE_SENTENCE, launchServicesAction} from '../../src/repl-host/launch-services.mjs';

const SCHEMA = {type: 'object', properties: {ok: {type: 'boolean'}, n: {type: 'integer'}, s: {type: 'string', enum: ['a']}}, required: ['ok']};

test('form elicitation is offered by an elicitation capability that is empty or names form, never by one offering only url', () => {
  for (const [capabilities, supported] of [[{elicitation: {}}, true], [{elicitation: {form: {}}}, true], [{elicitation: {form: {}, url: {}}}, true],
    [{elicitation: {url: {}}}, false], [{}, false], [undefined, false], [{elicitation: true}, false], [{elicitation: []}, false]])
    assert.equal(formElicitationSupported(capabilities), supported, JSON.stringify(capabilities));
});

test('an elicit message becomes elicitation/create params, or the refusal that grants nothing', () => {
  assert.deepEqual(elicitationParams({message: 'Allow?', requested_schema: SCHEMA, meta: {k: 1}}, {formSupported: true}), {params: {message: 'Allow?', requestedSchema: SCHEMA, _meta: {k: 1}}});
  assert.deepEqual(elicitationParams({message: 'Allow?', requested_schema: SCHEMA, meta: null}, {formSupported: true}), {params: {message: 'Allow?', requestedSchema: SCHEMA}});
  assert.deepEqual(elicitationParams({message: 'Allow?', requested_schema: SCHEMA}, {formSupported: false}), {error: FORM_UNSUPPORTED_SENTENCE});
  for (const [schema, problem] of [[null, 'expected an object schema'], [{type: 'array'}, 'expected type "object"'], [{type: 'object'}, 'expected properties to be an object'],
    [{type: 'object', properties: {x: {type: 'object'}}}, 'property "x" must be a string, number, integer or boolean schema'],
    [{type: 'object', properties: {}, required: 'x'}, 'expected required to be an array of property names']])
    assert.deepEqual(elicitationParams({message: 'm', requested_schema: schema}, {formSupported: true}), {error: `${INVALID_SCHEMA_PREFIX}${problem}`});
});

test('the client\'s answer: accept, decline and cancel with content and meta intact; anything else fails', () => {
  assert.deepEqual(elicitationOutcome({result: {action: 'accept', content: {ok: true}, _meta: {persist: 'session'}}}), {ok: true, action: 'accept', content: {ok: true}, _meta: {persist: 'session'}});
  assert.deepEqual(elicitationOutcome({result: {action: 'decline'}}), {ok: true, action: 'decline', content: null, _meta: null});
  assert.deepEqual(elicitationOutcome({result: {action: 'cancel'}}), {ok: true, action: 'cancel', content: null, _meta: null});
  for (const reply of [{result: {action: 'ACCEPT'}}, {result: {}}, {result: null}, {}, {result: {action: 'accept', content: [1]}}, {result: {action: 'accept', _meta: 'x'}}])
    assert.deepEqual(elicitationOutcome(reply), {ok: false, error: UNEXPECTED_RESPONSE_SENTENCE}, JSON.stringify(reply));
  assert.deepEqual(elicitationOutcome({error: {code: -1, message: 'user closed the dialog'}}), {ok: false, error: 'user closed the dialog'});
  assert.deepEqual(elicitationOutcome({error: {code: -1}}), {ok: false, error: UNEXPECTED_RESPONSE_SENTENCE});
});

// An application path opens as a new instance in the background (`open -n -g -a`): the native engine's launch must never
// take the user's focus, and a running copy of the same bundle id must not absorb it (#117, Design "Process model").
test('LaunchServices opens exactly one target through the OS boundary, on macOS, a path as a new background instance, and reports a dispatch failure', async () => {
  const calls = [];
  const open = async args => { calls.push(args); };
  await launchServicesAction({action: 'open_application', application_path: '/Applications/Example.app'}, {platform: 'darwin', open});
  await launchServicesAction({action: 'open_application', bundle_identifier: 'com.example.app'}, {platform: 'darwin', open});
  assert.deepEqual(calls, [['-n', '-g', '-a', '/Applications/Example.app'], ['-b', 'com.example.app']]);
  const refused = async (message, platform = 'darwin', boundary = open) => {
    try { await launchServicesAction(message, {platform, open: boundary}); return null; } catch (error) { return error.message; }
  };
  assert.equal(await refused({action: 'open_application'}), EXACTLY_ONE_SENTENCE);
  assert.equal(await refused({action: 'open_application', application_path: '/A.app', bundle_identifier: 'com.a'}), EXACTLY_ONE_SENTENCE);
  assert.equal(await refused({action: 'open_application', application_path: 'Example.app'}), PATH_NOT_ABSOLUTE_SENTENCE);
  assert.equal(await refused({action: 'open_application', bundle_identifier: ''}), EXACTLY_ONE_SENTENCE);
  assert.equal(await refused({action: 'close_application', bundle_identifier: 'com.a'}), 'unsupported LaunchServices action: close_application');
  assert.equal(await refused({action: 'open_application', bundle_identifier: 'com.a'}, 'win32'), MACOS_ONLY_SENTENCE, 'Linux launches desktop entries instead (linux-launch.test.mjs)');
  assert.equal(await refused({action: 'open_application', bundle_identifier: 'com.a'}, 'darwin', async () => { throw new Error('LSOpenURLsWithRole() failed with error -10814'); }),
    `${DISPATCH_FAILED_PREFIX}LSOpenURLsWithRole() failed with error -10814`);
  assert.equal(calls.length, 2, 'no refused target reached the boundary');
});
