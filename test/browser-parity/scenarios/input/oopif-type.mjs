// cua_type after focusing an input inside a cross-site (out-of-process) frame. cua pastes into the focused frame, so
// the text lands in the child's field and the parent page never sees the paste; the vendor pastes in the top
// document, so the paste event reaches the parent at the frame element and the child's field stays empty (an expected
// difference in cua's favour, Decision Log 2026-10-14).
export default {
  id:'input/oopif-type',milestone:'M1c',commands:['cua_type'],
  setup:{page:'/oopif-input.html',state:{}},
  cells:[
    {label:'type',code:"const input=tab.playwright.frameLocator('#outer').locator('#nested');await input.click();await tab.cua.type({text:'oopif'});await new Promise(resolve=>setTimeout(resolve,500));return {child:await input.evaluate(e=>e.value),parentPaste:await tab.playwright.evaluate('document.documentElement.hasAttribute(\"data-recorded-parentpaste\")')};"},
  ],
  assert:({results,fixtureState,service})=>{
    const [result]=results;
    if(results.length!==1||!result?.ok)return {ok:false,reason:`type: ${result?.error?.message??'missing'}`};
    const sawPaste=fixtureState.events.some(e=>e.parentPaste===true);
    const expected=service==='vendor'?{child:'',parentPaste:true}:{child:'oopif',parentPaste:false};
    const ok=result.value?.child===expected.child&&result.value?.parentPaste===expected.parentPaste&&sawPaste===expected.parentPaste;
    return ok?{ok:true}:{ok:false,reason:`type: ${JSON.stringify(result.value)}, parent paste recorded ${sawPaste}`};
  },
};
