// #316's browsers (copied from #287's scripts/probe-287/browser.mjs): launch Safari, Chrome (Chrome for Testing or stable)
// or Firefox at a URL with its window at a frame, and answer {pid, exitCode, kill}.
import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
export const STABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const FIREFOX = '/Applications/Firefox.app/Contents/MacOS/firefox';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const alive = pid => sh('kill', ['-0', String(pid)]).status === 0;

export function version(kind) {
  if (kind === 'safari') return `Safari ${sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out}`;
  if (kind === 'firefox') return sh(FIREFOX, ['--version']).out;
  return sh(kind === 'stable' ? STABLE : CFT, ['--version']).out;
}

/// A fresh Firefox profile: no first-run pages, no default-browser check, no updates, no session restore, no Terms of Use
/// dialog (#287's run 42375146858).
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

export function placePid(pid, {x, y, w, h}) {
  return osa(`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {${x}, ${y}}\nset size of window 1 to {${w}, ${h}}\nend tell\nend tell`).status;
}

/// The browser `kind` at `url`, its window at `frame`. Safari is one instance: any earlier one is ended first (its own
/// AppleScript answers nothing on the runner, so pkill).
export async function launch(kind, url, profileDir, frame) {
  if (kind === 'safari') {
    sh('pkill', ['-x', 'Safari']);
    for (let i = 0; i < 20 && sh('pgrep', ['-x', 'Safari']).status === 0; i++) await sleep(250);
    sh('open', ['-a', 'Safari', url]);
    let pid = null;
    for (let i = 0; i < 80 && !pid; i++) { await sleep(250); pid = Number(sh('pgrep', ['-x', 'Safari']).out.split('\n')[0]) || null; }
    if (!pid) throw new Error('Safari did not start');
    for (let i = 0; i < 20 && placePid(pid, frame) !== 0; i++) await sleep(250);
    const out = {pid, launchedAt: Date.now(), kill: () => { sh('pkill', ['-x', 'Safari']); }};
    Object.defineProperty(out, 'exitCode', {get: () => (alive(pid) ? null : 0)});
    return out;
  }
  if (kind === 'firefox') {
    firefoxProfile(profileDir);
    const child = spawn(FIREFOX, ['-profile', profileDir, '-no-remote', '-new-instance', url], {stdio: 'ignore'});
    child.launchedAt = Date.now();
    for (let i = 0; i < 80; i++) { await sleep(250); if (placePid(child.pid, frame) === 0) break; }
    return child;
  }
  const bin = kind === 'stable' ? STABLE : CFT;
  const child = spawn(bin, [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    '--lang=en-US', '--disable-features=Translate', `--window-position=${frame.x},${frame.y}`, `--window-size=${frame.w},${frame.h}`, url], {stdio: 'ignore'});
  child.launchedAt = Date.now();
  return child;
}
