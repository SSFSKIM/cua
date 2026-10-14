// Acceptance 3, second half, on the default selection: an evaluate that POSTs to the fixture's counter and then
// reloads its page loses its execution context; cua's service never re-dispatches it and rejects with its interruption
// sentence (evaluate_interrupted). The rejection's message is returned verbatim, then the counter is read through the
// page (the fixture's /state) and the runner's fixture state; the tab stays usable.
export default {
  id: 'acceptance/evaluate-context-loss', milestone: 'M5', commands: ['playwright_evaluate'],
  setup: {page: '/mutation.html', state: {}},
  cells: [
    {label: 'reload', code: "try{await tab.playwright.evaluate(async()=>{await fetch('/counter',{method:'POST'});location.reload();await new Promise(()=>{});},undefined,{timeoutMs:1000});return {rejected:false};}catch(e){return {rejected:true,name:e.name,message:e.message};}"},
    {label: 'counter', code: "await new Promise(r=>setTimeout(r,1500));return (await tab.playwright.evaluate(async()=>(await (await fetch('/state')).json()).counter));"},
    {label: 'usable', code: 'return await tab.title();'},
  ],
  assert: ({results, fixtureState}) => {
    const [reload, counter, usable] = results;
    const ok = reload?.ok && reload.value.rejected && /was not run again/.test(reload.value.message) && counter?.ok && counter.value === 1 && fixtureState.counter === 1 && usable?.ok && usable.value === 'Browser parity fixture';
    return {ok: Boolean(ok), reason: JSON.stringify(results.map(r => r.ok ? r.value : r.error))};
  },
};
