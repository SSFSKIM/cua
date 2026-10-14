// Two fills started together in one document. On cua each fill selects its field and pastes in one queued operation,
// the paste checked against its own field, so each value lands in its own field. The vendor selects both fields before
// either paste, so both pastes go to the field focused last (an expected difference: a vendor race cua does not keep).
const settle="await new Promise(resolve=>setTimeout(resolve,500));";
export default {
  id:'actions/concurrent-fill',milestone:'M1c',commands:['playwright_locator_fill'],
  setup:{page:'/fill-pair.html',state:{}},
  cells:[
    {label:'both',code:`const first=tab.playwright.locator('#first'),second=tab.playwright.locator('#second');await Promise.all([first.fill('one'),second.fill('two')]);${settle}return [await first.evaluate(e=>e.value),await second.evaluate(e=>e.value)];`},
  ],
  assert:({results,fixtureState,service})=>{
    const [result]=results;
    if(results.length!==1||!result?.ok||!Array.isArray(result.value))return {ok:false,reason:`both: ${result?.error?.message??JSON.stringify(result?.value)}`};
    const [first,second]=result.value;
    const typed=fixtureState.events.filter(e=>'first' in e||'second' in e);
    if(service==='vendor') {
      // The race as the vendor has it: something was typed, and not each value in its own field.
      const crossed=typed.length>0&&!(first==='one'&&second==='two')&&`${first}${second}`.includes('two');
      return crossed?{ok:true}:{ok:false,reason:`vendor fills did not cross: ${JSON.stringify(result.value)}`};
    }
    const own=first==='one'&&second==='two'&&typed.some(e=>e.first==='one')&&typed.some(e=>e.second==='two')&&!typed.some(e=>e.first==='two'||e.second==='one'||/one.*two|two.*one/.test(e.second??e.first??''));
    return own?{ok:true}:{ok:false,reason:`fills crossed: ${JSON.stringify(result.value)} ${JSON.stringify(typed)}`};
  },
};
