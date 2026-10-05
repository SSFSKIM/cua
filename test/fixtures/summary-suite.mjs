// A two-test node:test file the acceptance-runner tests execute in a child process to read its real summary. It is
// not named *.test.mjs, so `npm test` never runs it directly. SUMMARY_SUITE_SKIP=1 skips the second test.
import {test} from 'node:test';

test('first', () => {});
test('second', {skip: process.env.SUMMARY_SUITE_SKIP === '1'}, () => {});
