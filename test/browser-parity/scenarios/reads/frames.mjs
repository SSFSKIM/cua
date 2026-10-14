import {expectValues} from '../../support/assertions.mjs';
// Several same-process iframes: the first read after the navigation installs the injected script (the vendor's in the
// page's world, cua's in its isolated world, about 300 KB unminified) and enters each frame. The cells' ms are the
// diagnostic the M1b task records; the values are the oracle.
export default {
  id:'reads/frames',milestone:'M1b',commands:['playwright_locator_text_content','playwright_dom_snapshot'],
  setup:{page:'/counter.html',state:{}},
  cells:[
    {label:'navigate',code:"await tab.goto(fixtureURL+'/frames.html');return await tab.title();"},
    {label:'first',code:"return await tab.playwright.frameLocator('#first').locator('#frame-button').textContent();"},
    {label:'second',code:"return await tab.playwright.frameLocator('#second').locator('#frame-button').textContent();"},
    {label:'third',code:"return await tab.playwright.frameLocator('#third').locator('#frame-button').textContent();"},
    {label:'snapshot',code:"return await tab.playwright.domSnapshot();"},
  ],
  assert:expectValues({navigate:'Browser parity fixture',first:'Frame button',second:'Frame button',third:'Frame button',
    snapshot:v=>typeof v==='string'&&v.includes('Frames fixture')&&(v.match(/Frame button/g)??[]).length===3}),
};
