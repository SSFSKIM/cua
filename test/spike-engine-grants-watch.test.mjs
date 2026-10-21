// grants-watch.mjs's filters (the second input sitting, U5, U7, U8): nothing about another app is kept.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureApprovals, tccEvent} from '../scripts/spike/engine/grants-watch.mjs';

test('a TCC log line is kept only when its message names the engine, with only the fields the runbook reads', () => {
  const ours = JSON.stringify({timestamp: 't', processImagePath: '/System/Library/PrivateFrameworks/TCC.framework/Support/tccd', category: 'access',
    messageType: 'Default', eventMessage: 'AUTHREQ_SUBJECT: msgID=1, subject=io.github.ssfskim.cua.engine', senderImagePath: '/x'});
  assert.deepEqual(tccEvent(ours), {timestamp: 't', process: 'tccd', category: 'access', messageType: 'Default',
    eventMessage: 'AUTHREQ_SUBJECT: msgID=1, subject=io.github.ssfskim.cua.engine'});
  assert.equal(tccEvent(JSON.stringify({eventMessage: 'subject=com.other.app'})), null, 'another app\'s line is dropped');
  assert.equal(tccEvent('Filtering the log data using "subsystem == ..."'), null, 'the banner is not JSON');
  assert.equal(tccEvent(JSON.stringify({eventMessage: 'subject=io.github.ssfskim.cua.engine.u7'}), ['cua.engine.u7'])?.eventMessage, 'subject=io.github.ssfskim.cua.engine.u7');
});

test('the capture approvals keep only the entries naming the engine, at whatever depth they sit', () => {
  const plist = {
    'com.other.app': {lastAlert: '2026-10-19'},
    '/Users/x/Library/Application Support/cua/engine/cua Engine.app': {lastAlert: '2026-10-19 15:38'},
    nested: {list: [{bundle: 'io.github.ssfskim.cua.engine', at: 1}, {bundle: 'com.other.app', at: 2}], other: {bundle: 'com.else'}},
  };
  assert.deepEqual(captureApprovals(plist), {
    '/Users/x/Library/Application Support/cua/engine/cua Engine.app': {lastAlert: '2026-10-19 15:38'},
    'nested/list/0': {bundle: 'io.github.ssfskim.cua.engine', at: 1},
  });
  assert.deepEqual(captureApprovals({'com.other.app': 1}), {});
});
