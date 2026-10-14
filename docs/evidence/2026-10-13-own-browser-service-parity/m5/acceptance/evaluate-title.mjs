// Acceptance 3, first half, on the default selection: evaluate mutates the page in its main world, and the tab's
// title reads the change back (the corpus' evaluate/mutation, cua's branch).
export default {
  id: 'acceptance/evaluate-title', milestone: 'M5', commands: ['playwright_evaluate'],
  setup: {page: '/mutation.html', state: {}},
  cells: [
    {label: 'mutate', code: "return await tab.playwright.evaluate(()=>{document.title='changed';return document.title;});"},
    {label: 'title', code: 'return await tab.title();'},
  ],
  assert: ({results}) => ({ok: results.every(r => r.ok) && results[0].value === 'changed' && results[1].value === 'changed'}),
};
