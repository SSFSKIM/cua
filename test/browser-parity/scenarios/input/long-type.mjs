import {expectValues} from '../../support/assertions.mjs';
// A long cua_type, as a model filling a form types it (about 56 KB): the whole text arrives in one paste, within the
// typing's budget. The cell's ms is the timing evidence for both services.
const longText=()=>Array.from({length:1000},(_,i)=>'Line '+String(i).padStart(4,'0')+': the quick brown fox jumps over the lazy dog.').join('\n');
const LENGTH=longText().length;
export default {
  id:'input/long-type',milestone:'M1c',commands:['cua_type'],
  setup:{page:'/typing.html',state:{}},
  cells:[
    {label:'long',timeoutMs:60000,code:"const text=("+longText+")();await tab.playwright.locator('#long').click();await tab.cua.type({text});await tab.playwright.locator('html[data-recorded-longlength=\"'+text.length+'\"]').waitFor({state:'attached',timeoutMs:10000});const value=await tab.playwright.locator('#long').evaluate(e=>e.value);return {length:value.length,same:value===text};"},
  ],
  assert:expectValues({long:{length:LENGTH,same:true}},s=>s.events.some(e=>e.longLength===LENGTH)),
};
