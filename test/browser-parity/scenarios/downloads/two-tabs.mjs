// Two tabs, each with its own download wait armed, download the same URL at once (M2 task 1 review: download-start
// ownership). cua gives each wait its own download (the earliest-armed matching wait owns a started download, the
// next one the next); the vendor's shared matcher lets one download reach both waits. A departure in cua's favour,
// with its expected-differences entry. Paths are read only when they name this fixture's artifact.
const check="const expected=/\\/parity(?: \\(\\d+\\))?\\.txt$/;const fs=await import('node:fs/promises');const read=async path=>{if(typeof path!=='string'||!path.startsWith('/')||!expected.test(path))throw new Error('Unexpected fixture download path');const real=await fs.realpath(path);if(!expected.test(real))throw new Error('Unexpected fixture download path');return await fs.readFile(real,'utf8');};";
export default {
  id:'downloads/two-tabs',milestone:'M2',commands:['playwright_wait_for_download','playwright_download_path'],
  setup:{page:'/downloads.html',state:{}},
  cells:[
    {label:'second-tab',code:"globalThis.second=await browser.tabs.new();await second.goto(fixtureURL+'/downloads.html');return true;"},
    {label:'both',timeoutMs:30000,code:check+"const [a,b]=await Promise.all([tab.playwright.waitForEvent('download',{timeoutMs:10000}),second.playwright.waitForEvent('download',{timeoutMs:10000}),tab.playwright.locator('#download').click(),second.playwright.locator('#download').click()]);const [pathA,pathB]=await Promise.all([a.path({timeoutMs:10000}),b.path({timeoutMs:10000})]);const [textA,textB]=await Promise.all([read(pathA),read(pathB)]);return {samePath:pathA===pathB,contents:textA==='parity download\\n'&&textB==='parity download\\n'};"},
  ],
  // cua: two downloads, each the fixture's file. The vendor: one download reaching both waits (recorded live).
  assert:({results,service})=>{
    const [second,both]=results;
    const expected=service==='vendor'?{samePath:true,contents:true}:{samePath:false,contents:true};
    const ok=second?.ok&&second.value===true&&both?.ok&&both.value?.samePath===expected.samePath&&both.value?.contents===expected.contents;
    return ok?{ok:true}:{ok:false,reason:JSON.stringify(results.map(r=>[r.cell,r.ok,r.value??r.error?.message]))};
  },
};
