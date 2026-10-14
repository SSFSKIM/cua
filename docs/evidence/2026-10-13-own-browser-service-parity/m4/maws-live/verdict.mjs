// The live MAWS client-mode probe's verdict (run.mjs; acceptance 8): every required check over the report, in order,
// each failing on its own when what it needs was never observed. The takeover expectation is the selected service's:
// at the default budget both stop at the 3 s deadline while the person holds the tab; with {timeoutMs: 15000} cua's
// click goes through after MAWS's hand-back (3 s after the person's input), the vendor's stops at its 3 s cap.
export const PROFILE_NAME = 'MAWS';                // MAWS's hello.profileName (MAWS src/main/browser/cua/connection.ts)
const HANDBACK_MS = 3000;                          // MAWS's BROWSER_HANDBACK_IDLE_MS
const SLACK_MS = 100;
const VENDOR_CAP_MS = 3000;
const VENDOR_CAP_SLACK_MS = 1500;
const STOPPED = 'waiting';                         // the features page's #state before any submit
const SUBMITTED = 'submitted:x';

const stoppedAtDeadline = t => t?.click?.ok === false && /Playwright selector deadline exceeded/.test(t.click.error ?? '') && t.state === STOPPED;

export function verdict(report) {
  const summary = report.features?.summary ?? {};
  const raised = report.takeover?.timeoutMs15000;
  const checks = [
    ['error', report.error === undefined],
    ['maws', report.maws?.trusted === true && Boolean(report.maws?.sockets)],
    ['features', report.features?.status === 'PASS'],
    ['service', summary.service === 'PASS'],
    ['popup', summary.popup === 'PASS'],                                      // the adopted popup (tabs.adopted)
    ['profileName', report.created?.profileName === PROFILE_NAME],
    ['cursor', report.cursor?.ok === true && report.cursor.after > report.cursor.before],
    ['takeover.defaultBudget', stoppedAtDeadline(report.takeover?.defaultBudget)],
    ['takeover.timeoutMs15000', report.service === 'cua'
      ? raised?.click?.ok === true && raised.state === SUBMITTED && raised.click.sincePersonMs >= HANDBACK_MS - SLACK_MS
      : stoppedAtDeadline(raised) && raised.click.ms <= VENDOR_CAP_MS + VENDOR_CAP_SLACK_MS],
  ];
  const failures = checks.filter(([, ok]) => !ok).map(([check]) => ({check}));
  return {status: failures.length ? 'FAIL' : 'PASS', failures};
}
