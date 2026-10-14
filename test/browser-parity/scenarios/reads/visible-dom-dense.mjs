import {expectValues} from '../../support/assertions.mjs';
// The visible-DOM listing on a dense page (owed from M1b, Decision Log 2026-10-13 "M1b whole-branch review"): shadow
// roots, select values, contenteditable, deep nesting, a credential field, elements a person cannot see, and more
// elements than the listing's 200-element cap. The oracle checks what either service must list and must not; the
// diff compares the two listings exactly.
const has = (text, needle) => text.includes(needle);
export default {
  id:"reads/visible-dom-dense", milestone:"M1b", commands:["dom_cua_get_visible_dom"],
  setup:{page:"/visible-dom-dense.html",state:{}},
  cells:[
  {
    "label": "listing",
    "code": "return await tab.dom_cua.get_visible_dom();"
  }
],
  assert:expectValues({listing:v=>typeof v==='string'
    && ['Shadow button','Nested shadow link','Deep button','Editable','Plaintext editable','Summary toggle','Role button','Tabindex span','Onclick span','typed value','value="b"','value="y"','Textarea text'].every(n=>has(v,n))
    && !['dense-secret','Offscreen button','Hidden button','Invisible button','Closed shadow button'].some(n=>has(v,n))
    && (v.match(/node_id=\d+/g)??[]).length===200}),
};
