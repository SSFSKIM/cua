// Acceptance 2 on the default selection: the fixture's slow page adds #late 8 s after load; a click with
// timeoutMs 15000 waits for it. The cell reloads first (restarting the 8 s clock, as the corpus' actions/slow-budget
// does) and returns how long the click took and that the page recorded it.
export default {
  id: 'acceptance/slow-click', milestone: 'M5', commands: ['playwright_locator_click'],
  setup: {page: '/slow.html', state: {}},
  cells: [
    {label: 'late', timeoutMs: 25000, code: "await tab.goto(fixtureURL+'/slow.html');const started=Date.now();await tab.playwright.locator('#late').click({timeoutMs:15000});const clickedAfterMs=Date.now()-started;await tab.playwright.locator('html[data-recorded-late=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return {clickedAfterMs,recorded:true};"},
  ],
  assert: ({results, fixtureState}) => {
    const v = results[0]?.value;
    return {ok: Boolean(results[0]?.ok && v.clickedAfterMs >= 7000 && v.clickedAfterMs < 15000 && fixtureState.events.some(e => e.late === true)), reason: JSON.stringify(results[0])};
  },
};
