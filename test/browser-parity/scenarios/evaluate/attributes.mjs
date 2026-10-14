import {expectValues} from '../../support/assertions.mjs';
// Attributes returned from evaluate: a bare attribute and an attribute list project as the vendor's read-only
// attributes ({name, nodeName, nodeValue, specified, value}); a credential-named field's value attribute is left out
// of its list and read as null.
const attribute = (name, value) => ({name, nodeName: name, nodeValue: value, specified: true, value});
export default {
  id:'evaluate/attributes',milestone:'M1b',commands:['playwright_evaluate'],
  setup:{page:'/attributes.html',state:{}},
  cells:[
    {label:'bare',code:"return await tab.playwright.locator('#note').evaluate(e=>e.attributes[1]);"},
    {label:'list',code:"return await tab.playwright.locator('#note').evaluate(e=>e.attributes);"},
    {label:'hidden',code:"return await tab.playwright.locator('#secret').evaluate(e=>({value:e.attributes.getNamedItem('value'),list:e.attributes}));"},
  ],
  assert:expectValues({
    bare:attribute('class','item'),
    list:[attribute('id','note'),attribute('class','item'),attribute('data-note','stable')],
    hidden:{value:null,list:[attribute('id','secret'),attribute('name','password')]},
  }),
};
