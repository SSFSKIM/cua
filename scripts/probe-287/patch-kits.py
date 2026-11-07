# #287: the minimal edits that let the kits' unchanged cells run on the browser the job names (scripts/probe-287/
# browser.mjs). Applied once, offline, to the copies on probe/287-hosted; the edited kits are committed. Each edit is an
# exact replacement that must match once.
import sys

ROOT = sys.argv[1]
CFT_LINE = "const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';"
CFT_NEW = ("import {CHROME, BROWSER, launchOther, browserVersion, placePid} from '../probe-287/browser.mjs';\n"
           "const CFT = CHROME;  // #287: P287_CHROME names the Chrome under test (Chrome for Testing by default)")
VERSION_OLD = "chrome: sh(CFT, ['--version']).out"
VERSION_NEW = ("chrome: sh(CFT, ['--version']).out, browser: BROWSER, browserVersion: browserVersion(), "
               "firefoxA11y: process.env.P287_FIREFOX_A11Y ?? null, heads: process.env.P287_HEADS ?? null")


def edit(path, pairs):
    full = f'{ROOT}/{path}'
    text = open(full).read()
    for old, new in pairs:
        n = text.count(old)
        if n != 1:
            sys.exit(f'{path}: expected one match, found {n}: {old[:90]!r}')
        text = text.replace(old, new)
    open(full, 'w').write(text)
    print('patched', path)


COMMON = [(CFT_LINE, CFT_NEW), (VERSION_OLD, VERSION_NEW)]

# #282: the counters page in Safari or Firefox too (P287_BROWSER).
edit('scripts/probe-282/probe.mjs', COMMON + [(
    "  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',\n"
    "    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});",
    "  const child = BROWSER !== 'chrome' ? await launchOther(URL_, join(OUT, `profile-${fileName(label)}`)) : spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',\n"
    "    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});")])

# #283: the text-field page in Safari or Firefox too.
edit('scripts/probe-283/ab.mjs', COMMON + [(
    "  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',\n"
    "    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_ + query], {stdio: 'ignore'});",
    "  const child = BROWSER !== 'chrome' ? await launchOther(URL_ + query, join(OUT, `profile-${fileName(label)}`)) : spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',\n"
    "    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_ + query], {stdio: 'ignore'});")])

# #288 and #294: Chrome only; the binary from P287_CHROME.
for p in ['scripts/probe-288/probe.mjs', 'scripts/probe-288/live.mjs', 'scripts/probe-294/live.mjs']:
    edit(p, COMMON)

# #296's stale suite: Firefox groups mirroring Safari's (P287_BROWSER=firefox), and P287_HEADS to run one head.
edit('scripts/probe-296/ab.mjs', COMMON + [
    ("if (GROUP === 'native') for (const mode of ['shared', 'dedicated']) {",
     "// #287: Firefox, the Safari groups' cells.\n"
     "if (GROUP === 'firefox') {\n"
     "  for (const s of PAGE_KEPT) for (const d of [1, 20]) add(`firefox/shared/${name(s)}/${d}s`, {...s, app: 'firefox', mode: 'shared', delay: d, expect: 'kept'}, false);\n"
     "  add('firefox/shared/link/1s', {...W('link', {id: 'lnk'}), app: 'firefox', mode: 'shared', delay: 1, expect: 'kept'}, false);\n"
     "  for (const s of [...PAGE_TP, ...PAGE_LIMITS]) add(`firefox/shared/${name(s)}/5s`, {...s, app: 'firefox', mode: 'shared', delay: 5}, true);\n"
     "  add('firefox/dedicated/feed/5s', {...PAGE_TP[0], app: 'firefox', mode: 'dedicated', delay: 5, expect: 'refused/frameMoved'}, true);\n"
     "  add('firefox/dedicated/swap/5s', {...PAGE_TP[2], app: 'firefox', mode: 'dedicated', delay: 5, expect: 'refused/nodeGone'}, true);\n"
     "  add('firefox/dedicated/label/1s', {...PAGE_KEPT[0], app: 'firefox', mode: 'dedicated', delay: 1, expect: 'kept'}, false);\n"
     "}\n"
     "if (GROUP === 'native') for (const mode of ['shared', 'dedicated']) {"),
    ("const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)))",
     "const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p))).filter(c => !process.env.P287_HEADS || process.env.P287_HEADS.split(',').includes(c.engine))"),
    ("const CMD = join(OUT, 'native-cmd.txt'), NLOG = join(OUT, 'native-log.jsonl');",
     "async function launchFirefox() {\n"
     "  beacons = [];\n"
     "  const child = await launchOther(`${URL_}?case=static&k=k0`, join(OUT, 'firefox-profile'));\n"
     "  await waitLoad();\n"
     "  await sleep(800);\n"
     "  return {pid: child.pid, launchedAt: child.launchedAt, stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL'); } }};\n"
     "}\n"
     "const CMD = join(OUT, 'native-cmd.txt'), NLOG = join(OUT, 'native-log.jsonl');"),
    ("spec.app === 'safari' ? await launchSafari() : await launchNative();",
     "spec.app === 'safari' ? await launchSafari() : spec.app === 'firefox' ? await launchFirefox() : await launchNative();"),
])

# #305's sweep: Firefox as Safari (its window's title through System Events decides a re-open), P287_HEADS for one head.
edit('scripts/probe-305/ab.mjs', COMMON + [
    ("const ORDER = REP % 2 ? ['main', 'branch'] : ['branch', 'main'];",
     "const ORDER = (REP % 2 ? ['main', 'branch'] : ['branch', 'main']).filter(h => !process.env.P287_HEADS || process.env.P287_HEADS.split(',').includes(h));"),
    ("async function runFinder() {",
     "// #287: Firefox, as runSafari: a fresh profile, re-opened only when a click navigated or opened something.\n"
     "async function runFirefox() {\n"
     "  let page = LOCAL, child = null;\n"
     "  const open = async () => {\n"
     "    if (child && child.exitCode === null) { child.kill('SIGTERM'); for (let i = 0; i < 20 && child.exitCode === null; i++) await sleep(250); if (child.exitCode === null) child.kill('SIGKILL'); await sleep(1000); }\n"
     "    child = await launchOther(page, join(OUT, 'firefox-profile'), WIN); await sleep(page === LOCAL ? 7000 : 14000); placePid(child.pid, WIN); await sleep(2000);\n"
     "  };\n"
     "  const pid = () => child.pid;\n"
     "  const title = () => osa(`tell application \"System Events\" to get name of window 1 of (first process whose unix id is ${child.pid})`).out;\n"
     "  const state = () => ({title: title(), windows: osa(`tell application \"System Events\" to count windows of (first process whose unix id is ${child.pid})`).out});\n"
     "  let expected = null;\n"
     "  const reopen = async () => { await open(); expected = state(); };\n"
     "  const reset = async function () {\n"
     "    if (this?.dirty) { await escape(); this.dirty = false; }\n"
     "    const st = state();\n"
     "    if (!expected || st.title !== expected.title || st.windows !== expected.windows) await reopen(); else { placePid(child.pid, WIN); await sleep(800); }\n"
     "  };\n"
     "  const effect = async () => state();\n"
     "  if (PARTS.includes('sweep')) {\n"
     "    for (const [name, url] of [['sweep-firefox-wikipedia', 'https://en.wikipedia.org/wiki/Hacker_News'], ['sweep-firefox-github', `${GH}/torvalds/linux`]]) {\n"
     "      page = url; await reopen();\n"
     "      const s = {name, pid, effect, alwaysDirty: true};\n"
     "      s.reset = reset.bind(s);\n"
     "      await sweep(s);\n"
     "    }\n"
     "  }\n"
     "  if (child && child.exitCode === null) child.kill('SIGTERM');\n"
     "}\n"
     "async function runFinder() {"),
    ("  else if (GROUP === 'safari') await runSafari();",
     "  else if (GROUP === 'safari') await runSafari();\n  else if (GROUP === 'firefox') await runFirefox();"),
])

# #304's coverage: Firefox as Safari (positioned through the scroll bar's AXValue where it has one), a group of a few
# pages, and P287_SLOTS to cut the eight timed observations per position to the first N (A = B = main here).
edit('scripts/probe-304/ab.mjs', COMMON + [
    ("  safari: ['py-docs', 'wiki-article', 'bbc-news', 'mdn-float', 'local-table', 'local-float', 'local-overlay', 'local-fixed-tail'],",
     "  safari: ['py-docs', 'wiki-article', 'bbc-news', 'mdn-float', 'local-table', 'local-float', 'local-overlay', 'local-fixed-tail'],\n"
     "  // #287: a few of the spike's pages in Firefox.\n"
     "  firefox: ['py-docs', 'wiki-article', 'local-table', 'local-table-bar', 'local-fixed-tail', 'hn-thread'],"),
    ("  const order = [first, second, second, first, second, first, first, second];",
     "  const order = [first, second, second, first, second, first, first, second].slice(0, Number(process.env.P287_SLOTS) || 8);"),
    ("async function runSafari(ctx) {",
     "// #287: Firefox, as runSafari: a fresh launch per page, positioned through its scroll bar's AXValue where it exposes one.\n"
     "async function runFirefox(ctx) {\n"
     "  ctx.pageIndex = 0;\n"
     "  let child = null;\n"
     "  const end = async () => { if (child && child.exitCode === null) { child.kill('SIGTERM'); for (let i = 0; i < 20 && child.exitCode === null; i++) await sleep(250); if (child.exitCode === null) child.kill('SIGKILL'); await sleep(1000); } };\n"
     "  for (const target of TARGETS) {\n"
     "    if (ONLY && !ONLY.includes(target.name)) continue;\n"
     "    await end();\n"
     "    child = await launchOther(urlOf(target), join(OUT, 'firefox-profile'), WIN);\n"
     "    await sleep(target.local ? 8000 : 16000);\n"
     "    ctx.pid = child.pid;\n"
     "    placePid(child.pid, WIN); await sleep(2000);\n"
     "    const warmed = await warm(ctx, target);\n"
     "    log(`${target.name}: warm ${JSON.stringify(warmed)}`);\n"
     "    for (const [posIndex, at] of POSITIONS.entries()) {\n"
     "      const info = {title: osa(`tell application \"System Events\" to get name of window 1 of (first process whose unix id is ${child.pid})`).out};\n"
     "      info.scroll = await ctx.tool.ask({op: 'axscroll', pid: ctx.pid, window: [WIN.x, WIN.y, WIN.w, WIN.h], frac: at.frac});\n"
     "      if (at.frac > 0 && info.scroll?.after != null && Math.abs(info.scroll.after - at.frac) > 0.05) info.scrollMissed = true;\n"
     "      if (at.frac > 0 && info.scroll?.after == null) { info.scrollMissed = true; results.push({label: `${GROUP}/${target.name}/${at.name}`, skipped: 'not positioned', pageInfo: info}); save(); continue; }\n"
     "      await sleep(2500);\n"
     "      const row = await measure(ctx, target, at, info, posIndex);\n"
     "      if (posIndex === 0) row.warm = warmed;\n"
     "      results.push(row); save();\n"
     "      log(`${row.label}: ${line(row)}`);\n"
     "    }\n"
     "    ctx.pageIndex += 1;\n"
     "  }\n"
     "  await end();\n"
     "}\n"
     "async function runSafari(ctx) {"),
    ("  if (GROUP.startsWith('safari')) await runSafari(ctx); else await runChrome(ctx);",
     "  if (GROUP.startsWith('safari')) await runSafari(ctx); else if (GROUP === 'firefox') await runFirefox(ctx); else await runChrome(ctx);"),
])
