// Copied without behavioral changes from origin/probe/359-hosted scripts/probe-316/browser.mjs.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export function firefoxProfile(dir) {
  mkdirSync(dir, {recursive: true});
  const prefs = {
    'browser.shell.checkDefaultBrowser': false, 'browser.aboutwelcome.enabled': false, 'browser.startup.homepage_override.mstone': 'ignore',
    'startup.homepage_welcome_url': '', 'startup.homepage_welcome_url.additional': '', 'browser.startup.firstrunSkipsHomepage': true,
    'datareporting.policy.dataSubmissionEnabled': false, 'datareporting.policy.firstRunURL': '', 'toolkit.telemetry.reportingpolicy.firstRun': false,
    'app.update.disabledForTesting': true, 'app.update.auto': false, 'browser.sessionstore.resume_from_crash': false, 'browser.tabs.warnOnClose': false,
    'browser.warnOnQuit': false, 'browser.translations.automaticallyPopup': false, 'browser.translations.enable': false,
    'browser.newtabpage.enabled': false, 'extensions.autoDisableScopes': 15, 'browser.discovery.enabled': false,
    'browser.uitour.enabled': false, 'browser.messaging-system.whatsNewPanel.enabled': false, 'browser.vpn_promo.enabled': false,
    'toolkit.startup.max_resumed_crashes': -1, 'browser.toolbars.bookmarks.visibility': 'never',
    'browser.startup.upgradeDialog.enabled': false, 'browser.startup.page': 0, 'browser.startup.homepage': 'about:blank',
    'trailhead.firstrun.didSeeAboutWelcome': true, 'browser.privacySegmentation.preferences.show': false, 'browser.rights.3.shown': true,
    'browser.contentblocking.introCount': 99, 'browser.download.panel.shown': true, 'browser.migrate.content-modal.enabled': false,
    'browser.tabs.firefox-view': false, 'sidebar.revamp': false, 'browser.ml.chat.enabled': false, 'browser.urlbar.quicksuggest.enabled': false,
    'browser.preonboarding.enabled': false, 'termsofuse.bypassNotification': true, 'termsofuse.acceptedVersion': 999,
    'termsofuse.acceptedDate': String(Date.now()), 'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
    'datareporting.policy.dataSubmissionPolicyAcceptedVersion': 999, 'datareporting.policy.dataSubmissionPolicyNotifiedTime': String(Date.now()),
  };
  writeFileSync(join(dir, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n');
  return dir;
}
