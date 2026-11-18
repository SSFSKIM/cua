import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nonBmpShape} from './page.mjs';

test('non-BMP observation exposes only a delivery class',()=>{
  const scalar=String.fromCodePoint(0x1f4a1), expected='abcd'+scalar+'efg';
  for(const [actual,shape] of [
    [expected,'exact'], ['','empty'], ['abcdefg','missing'], ['abcd?efg','question-mark'],
    ['abcd�efg','replacement-character'], ['abcdaefg','ascii-substitution'],
    ['abcd'+scalar[0]+'x'+scalar[1]+'efg','split-or-unpaired'], ['xyz','surrounding-mismatch'],
  ])assert.equal(nonBmpShape(expected,actual),shape);
  assert.equal(nonBmpShape('no-non-bmp','not-the-input'),null);
});
