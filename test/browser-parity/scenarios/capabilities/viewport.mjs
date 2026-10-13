import {expectValues} from '../../support/assertions.mjs';
export default {
  id:'capabilities/viewport',milestone:'M2',commands:['browser_viewport_set','browser_viewport_reset'],
  setup:{page:'/read.html',state:{}},
  cells:[{label:'round-trip',code:"const viewport=await browser.capabilities.get('viewport');const original=await tab.playwright.evaluate('({width:innerWidth,height:innerHeight})');const requested={width:original.width===640?641:640,height:original.height===480?481:480};let changed;try{await viewport.set(requested);changed=await tab.playwright.evaluate('({width:innerWidth,height:innerHeight})');}finally{await viewport.reset();}const restored=await tab.playwright.evaluate('({width:innerWidth,height:innerHeight})');return {overridden:changed.width===requested.width&&changed.height===requested.height,restored:restored.width===original.width&&restored.height===original.height};"}],
  assert:expectValues({'round-trip':{overridden:true,restored:true}}),
};
