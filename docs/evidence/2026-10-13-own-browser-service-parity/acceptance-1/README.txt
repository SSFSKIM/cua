Acceptance 1, a one-off live check through the harness on the mini (parity clone at 2638024, profile ssfs); not a
corpus case (the corpus keeps to the fixture). The scenario is nytimes-scenario.mjs, placed under
test/browser-parity/scenarios/acceptance/ only for these two runs and removed after:
  node scripts/browser-parity.mjs run --service cua    --device mini --scenarios acceptance/nytimes.mjs --out cua
  node scripts/browser-parity.mjs run --service vendor --device mini --scenarios acceptance/nytimes.mjs --out vendor

cua (CUA_BROWSER_SERVICE=cua):
  open     cua.createBrowserTab(browser.browserId, 'https://www.nytimes.com/') -> url https://www.nytimes.com/,
           title "The New York Times - Breaking News, US News, World News and Videos"
  opinion  getByRole('link', {name: /Opinion/i}).first().click(), then waitForURL('**/opinion**')
           -> https://www.nytimes.com/section/opinion, title "Opinion - The New York Times"

vendor (CUA_BROWSER_SERVICE=vendor):
  open     rejected: "Browser Use rejected this action due to browser security policy. Reason: The site-safety policy
           blocks this action; no user permission prompt or Auto-review was attempted. Browser use is not permitted
           on https://www.nytimes.com. ..." (the vendor's site_status_blocked; only the message crosses the RPC
           boundary, so the code itself is not visible in the cell)
  opinion  not reached ("ny is not defined")

Both runs' tabs were the runs' own (closed at their end_task); no other tab was touched.
