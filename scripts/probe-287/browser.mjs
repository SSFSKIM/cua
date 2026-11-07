// #287's browser switch for the kits' Chrome cells. The kits launch Chrome for Testing; here the same cells launch the
// browser the job names:
//   P287_BROWSER  chrome (the default: P287_CHROME names the binary, else Chrome for Testing) | safari | firefox
//   P287_FIREFOX_A11Y  force: the profile's user.js sets accessibility.force_disabled -1 (Gecko's always-on); else unset
// launchOther(url, profileDir, frame) opens Safari or Firefox at url with its window at frame and answers a child-like
// object ({pid, exitCode, kill}) the kits' stop code can use unchanged.
import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const BROWSER = process.env.P287_BROWSER || 'chrome';
export const CHROME = process.env.P287_CHROME || '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
export const FIREFOX = process.env.P287_FIREFOX || '/Applications/Firefox.app/Contents/MacOS/firefox';
export const FIREFOX_A11Y = process.env.P287_FIREFOX_A11Y || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const alive = pid => sh('kill', ['-0', String(pid)]).status === 0;

/// The browser's version line, for a kit's config.
export function browserVersion() {
  if (BROWSER === 'safari') return `Safari ${sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out}`;
  if (BROWSER === 'firefox') return sh(FIREFOX, ['--version']).out;
  return sh(CHROME, ['--version']).out;
}

/// A fresh Firefox profile: no first-run pages, no default-browser check, no updates, no session restore.
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
    ...(FIREFOX_A11Y === 'force' ? {'accessibility.force_disabled': -1} : {}),
  };
  writeFileSync(join(dir, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n');
  return dir;
}

export function placePid(pid, {x, y, w, h}) {
  return osa(`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {${x}, ${y}}\nset size of window 1 to {${w}, ${h}}\nend tell\nend tell`).status;
}

/// Safari or Firefox at `url`, its window at `frame`. Safari is one instance: any earlier one is ended first (its own
/// AppleScript answers nothing on the runner, so pkill).
export async function launchOther(url, profileDir, frame = {x: 400, y: 30, w: 620, h: 720}) {
  if (BROWSER === 'safari') {
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
  if (BROWSER === 'firefox') {
    firefoxProfile(profileDir);
    const child = spawn(FIREFOX, ['-profile', profileDir, '-no-remote', '-new-instance', url], {stdio: 'ignore'});
    child.launchedAt = Date.now();
    for (let i = 0; i < 80; i++) { await sleep(250); if (placePid(child.pid, frame) === 0) break; }
    return child;
  }
  throw new Error(`launchOther: ${BROWSER}`);
}
