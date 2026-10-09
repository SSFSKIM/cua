# Execution report: MAWS in-app browser's Chrome-like top chrome (board #90)

Spec: `docs/doperpowers/specs/2026-10-08-maws-browser-chrome-design.md` (this directory), executed from reviewed revision `050411be`. Code: MAWS worktree `/Users/new/Developer/GitHub/MAWS-wt-90`, branch `90-browser-chrome`.

**Status: DONE.** MAWS PR: https://github.com/SSFSKIM/MAWS/pull/6 (against master, not merged); the spec's cua PR: https://github.com/SSFSKIM/cua/pull/101. Commit range: `16006624..95b5b871` (11 milestone commits plus the final fix `7a630cd2` and the ledger sha `95b5b871`; rebased from `5bd2cd57` onto master `16006624` with no conflicts; master's settings 11 and index 6 had not moved, so no renumbering: settings 12, index 7 pinned sha256 `e5dbe799d588c31efa19def80e2c8b54bec78b138b2e1fe3d3c789fb214fce90`, `profiles.json` 2). At PR time master was one commit further, with no change to the version files, and it merges cleanly. The owner's sitting on the real profile is parked (below), not blocked.

## Milestones

- S1 (MAWS `58125f24`): verdict **promote**; reviewed clean by reviewer-medium on opus.
- M1a (MAWS `af1c70ab`): reviewed clean by reviewer-medium on opus, with no material findings.
- M1b (MAWS `40df2f7b`, fix `3d37cb18`): reviewed clean after one P2 fix (⌘⇧B narrowed to tabs that can show a bar).
- M2 (MAWS `35cc8541`, fixes `fff71e10`, `3eab8cbf`): clean; the cover still's blank pane root-caused and fixed, then its races closed.
- M3 (MAWS `8b6c9712`, fix `8855d708`): clean after one fix wave (2 P2, 2 P3).
- M4 (MAWS `f63860d0` M3's P3 retarget, `60062715` documents): rebase, pointer document `docs/doperpowers/plans/2026-10-08-browser-chrome-90.md`, ledger §4 #90 rows at their landed state, eight tracker rows; no MAWS page documents the browser for users, so none added.
- Whole-branch review (doperpowers:reviewer-high on opus): one P2. cua could list, attach to and evaluate inside an options tab (an extension origin), contrary to A-51's intent. Fixed in `7a630cd2` (`reachable()` requires `internal === null`) and re-reviewed clean.

## Gates (rebased tree, code head f63860d0; final fix's covering gates at 7a630cd2)

| Command | Result (tail) |
|---|---|
| `pnpm typecheck && pnpm lint && pnpm test` | typecheck and lint clean (0 errors); vitest `Test Files 1 failed \| 741 passed \| 1 skipped (743)`, `Tests 1 failed \| 10336 passed \| 1 skipped (10338)`, `Type Errors no errors`. The one failure is the known flaky `pause-take-over.pty.test.ts` › "clears an unfinished line at middle in /bin/zsh emacs mode …" (expected "back in the foreground", got the "no longer the foreground job" message) |
| `vitest run src/main/sessions/pause-take-over.pty.test.ts` alone, twice | `Test Files 1 passed (1)`; `Tests 6 passed (6)` |
| `pnpm e2e:browser-chrome` | `7 passed (1.2m)`: 1, 6, 10 (6.1s); 5 (25.5s); 2, 3, 5 (14.3s); 4, 6 (5.2s); 5, 7, 8, 10 (9.5s); the cover's still (4.1s); 9, 10, 12 (7.7s) |
| `pnpm e2e:browser-import` | `6 passed (1.1m)` |
| `pnpm e2e:browser` | `8 passed (32.7s)` |
| `pnpm e2e:browser-cua` | `5 passed (34.8s)` |
| `pnpm e2e:browser-comment` | `13 passed (43.5s)` |
| `pnpm build:app` | exit 0. electron-vite build, then electron-builder 26.15.3 `--mac dir` into `dist/mac-arm64`, "skipped macOS code signing" (no identity set), "default Electron icon is used" |

Final fix at 7a630cd2: `pnpm vitest run src/main/browser/cua src/main/browser/extensions src/main/browser/tabs.test.ts`: 185/185 (13 files). `pnpm typecheck && pnpm lint`: exit 0. `pnpm e2e:browser-cua`: 5/5. My own `pnpm typecheck` at 95b5b871: exit 0.

## Acceptance 1–13 mapped (from M4's executor)

| # | Proved by | Owner's profile |
|---|---|---|
| 1 | `e2e:browser-chrome` "1, 6, 10" (the Bookmarks row with 46, the report's 46 imported and 1 skipped, 51 index rows) | yes: the real counts in the consent and the report |
| 2 | `e2e:browser-chrome` "2, 3, 5" (chips A, B, F, the N chips that fit, », the » menu, no bar for Default) | yes: their bar's look and order |
| 3 | `e2e:browser-chrome` "2, 3, 5" (A in the tab, ⌘-click B to an unselected tab, F's menu with G › G1 and Open all (2), F1, Open all, Open all above 20 asking, the narrower window's ») | yes: the real `Menu.popup` is unit-tested only (the e2e records menus through the seam) |
| 4 | `e2e:browser-chrome` "4, 6" (⌘⇧B in the page, the 28 px, the relaunch, ⌘⇧B in the chrome, the Settings switch) | yes: that a real ⌘⇧B in the focused chrome never also fires `panel.toggle` (reasoned, not observable through Playwright) |
| 5 | `e2e:browser-chrome` "5" (relaunch and `browser.bookmarks.sync`, the deleted file); "2, 3, 5" (the visible half); "5, 7, 8, 10" (Sync bookmarks now, the 읽지 못함 line) | no |
| 6 | `e2e:browser-chrome` "1, 6, 10" (the answer's shape, at most 3 of 8) and "4, 6" (`f1` drawn with the star above history; a history-only title) | no |
| 7 | `e2e:browser-chrome` "5, 7, 8, 10" (the 64 px picture, W, the popover's rows, no Settings tab, click-away) | yes: their picture and account line |
| 8 | `e2e:browser-chrome` "5, 7, 8, 10" (Switch profile → Work in a new selected tab, the first tab unchanged) | no |
| 9 | `e2e:browser-chrome` "9, 10, 12" (the icon placement and 24 px; the popup under the icon reaching the service worker, the page tab absent from `tabs.query`; second click and cover closing it; Options titled "MAWS probe extension · Options", read-only; the 380 px puzzle fold with its menu; the inert popup-less action; now also the replacement in place) | yes: their extensions' icons and real popups. Popup sizing is not observable under Playwright (a tracker row); unit tests and S1 carry it |
| 10 | rows: "1, 6, 10"; avatar: "5, 7, 8, 10"; actions and the options tab's notice: "9, 10, 12"; the profile's tabs closing (so no bar remains) is E4b's removal in `e2e:browser-import` scene 4 | no |
| 11 | `e2e:browser-cua` "a person's bookmark click on a leased idle tab is theirs: no agent row, and the agent's acting command in the hand-back window is refused; the agent's own navigation still makes its row" | no |
| 12 | `e2e:browser-chrome` "9, 10, 12" (the relaunch restores the page's tab, not the options tab; the selection falls to the neighbour) | no |
| 13 | §4 above: every gate green (the pty case alone) | no |

## The owner's sitting list (their own build and profile; parked, not blocked)

1. The bookmarks bar on their imported profile: its look and Chrome's order, and the folders and » as real native menus. The real `Menu.popup` is unit-tested only; the e2e records menus through a seam.
2. The import sheet's and the report's real bookmark counts.
3. ⌘⇧B with focus in a leased page: the bar toggles and the panel does not. Also ⌘⇧B with the chrome focused: the bar toggles once and the panel does not, the double-fire check. In a Default tab ⌘⇧B still toggles the right panel. On double-fire, the reviewer reasoned from the Chromium and Electron sources and Electron 44's typings that a real ⌘⇧B cannot fire both: on macOS the focused web contents get ⌘-key equivalents first, the menu sees only unhandled keydowns, and `preventDefault` in either path keeps the key from the menu. That is reasoned, not observed.
4. The popover: their picture and account line, Switch profile, Sync bookmarks now with its time line, Re-import this profile…, and Browser settings.
5. Under the open popover in the 380 px panel the page shows its still, never a blank pane; the popover appears about 25–60 ms after the click.
6. Their extensions' icons by the address field; their popups open under the icon and size themselves. Popup sizing is not observable in e2e.
7. Popup blur-close by hand: clicking the page, another window, or a native dialog closes it.
8. A real extension's Options opens as a tab; following a web link from it opens a new ordinary tab.

## For maws-fe (verbatim; #90 writes none of it)

### Ledger §5, §6, X15, charter §19 and the charter Decision Log (from M4, sha updated to the final code head)

**Ledger §5 (IPC), a new row after E13's**, state "landed on branch `90-browser-chrome` at 7a630cd2; merges with
#90's MAWS PR":

> cua board #90 (the in-app browser's Chrome-like top chrome; spec in the cua repository): commands
> `browser.bookmarks.tree {partition} → {tree}`, `browser.bookmarks.sync {profileDir} → {syncedAt, count} | {error:
> 'missing'|'unreadable'|'indexUnavailable'|'refused', reason?}`, `browser.bookmarks.open {tabId, nodeId, how:
> 'current'|'newTab'}`, `browser.bookmarks.menu {tabId, request: {kind:'folder', nodeId}|{kind:'overflow', hiddenFrom},
> anchor}`, `browser.bookmarks.favicons {partition, origins} → {icons}` (a query, in `QUERY_COMMANDS`),
> `browser.extensions.actions {partition} → {actions}`, `browser.extensions.action.click {tabId, extensionId, anchor}`,
> `browser.extensions.action.options {tabId, extensionId}`, `browser.extensions.action.menu {tabId, extensionId,
> anchor}`, `browser.extensions.puzzle {tabId, anchor}`; events `browser.bookmarks.changed {partition}`,
> `browser.extensions.actions.changed {partition}`, `browser.extensions.popup {tabId, extensionId|null}`,
> `browser.extensions.reveal {tabId, show: {kind:'tab', tab}|{kind:'settings'}|{kind:'replacement', tab}}`; every
> tab-scoped command carries the originating `tabId`. Additive in E4a/E4b lines: `browser.history.suggest`'s item gains
> `kind: 'history'|'bookmark'`; `browser.profiles.list`'s item gains `gaiaName`, `userName`, `avatar`;
> `BrowserChromeCommand.command` gains `toggleBookmarksBar`; notice kinds `extensionPopupFailed`, `extensionPageClosed`;
> `BrowserTab` gains `internal: {kind:'extension', extensionId, title} | null` (a sibling's `BrowserTab` literal must
> add `internal: null`); `ImportCategoriesSchema.bookmarks`, phase `bookmarks`, the report's and the inspection's
> `bookmarks`; the import log's `popupRefused` kind. New shared files `src/shared/browser/bookmarks.ts` and
> `extensions.ts`. Main-only e2e seam under `MAWS_E2E`: the native-menu recorder (`last`, `pick(path)`,
> `openAllAsked`) and `MAWS_E2E_OPEN_ALL_ANSWER`. `package.json` `e2e:browser-chrome`. The renderer layout store gains
> `retargetTab(id, target)` (X14's `TabRef` unchanged).

**Ledger §6 (dated exception lines, if the architect counts these as in-place edits of a sibling's lines):**

> 2026-10-09, cua board #90 widens E4a's and E4b's lines additively, each marked `cua #90` in place:
> `BrowserChromeCommandSchema`'s enum (`toggleBookmarksBar`), the notice-kind enum (two kinds), the suggest output's
> item (`kind`), the profiles list output, `BrowserTabSchema` (`internal`), and the import schemas in
> `src/shared/browser/import.ts` and `profiles.ts` (version 2, the version-1 schema kept whole); the comment header of
> `src/shared/keymap/actions.ts` corrected (a menu chord's keydown reaches the focused page first).

**Charter §13 X15 (line 598), the lists extended:**

> Settings versions 9 (voice), 10 (supervisor), 11 (browser), 12 (the bookmarks bar, cua board #90); index migrations
> 4 (lineage, side threads), 5 (browser history), 6 (the agent's browser activity, cua board #93, 2026-10-08), 7 (an
> imported profile's bookmarks, cua board #90, 2026-10-09); E4b's `profiles.json` version 2 (cua board #90: bookmarks,
> account names, avatar per record; an older build opens it read-only); …

**Charter §19, a landing line (at the merge, with the PR's numbers filled in):**

> 2026-10-<dd> (cua board #90 landed): MAWS PR #<n> merged at <sha>, the in-app browser's Chrome-like top chrome
> (the cua repository's spec `docs/doperpowers/specs/2026-10-08-maws-browser-chrome-design.md`): an imported Chrome
> profile's bookmarks as a read-only mirror with a bar, native folder menus and address suggestions; the profile pill's
> avatar and popover; an extensions action bar with popups in a MAWS-hosted view and transient options tabs; the
> cover's still fixed so a DOM layer never shows an empty pane. Versions settings 12, index 7, `profiles.json` 2 (X15,
> the P1 ledger §4). Gates at the rebased tree 7a630cd2: typecheck, lint, 10,336 units (1 skipped; the pause-take-over
> pty case flaky once, 6/6 alone), e2e browser-chrome 7, browser-import 6, browser 8, browser-cua 5, browser-comment 13,
> build:app. Eight tracker rows (owner cua board #90).

**Charter Decision Log, the extension bar line (from M3's controller note):**

> 2026-10-09 (cua board #90): MAWS hosts Chrome extensions' action UI itself (a thin action bar, popups in a
> `WebContentsView` of the partition session, options pages as transient internal tabs) rather than through
> `electron-chrome-extensions` (GPL-3.0 or a patron licence; its tab and window shims and child-window popup sit
> outside `TabStore`, the cua lease and the cover model). Popups cannot see the current tab (`chrome.tabs.query`
> never answers it; no `chrome.windows`), and `chrome.action.onClicked` has no API in Electron 44, so a popup-less
> action is inert; Settings says so.

### Names the per-milestone reports added (fold into the §5 row above where the architect wants the detail)

### From M1a
- **Ledger §5, a new row** (or appended to the cua board #90 line): commands `browser.bookmarks.tree {partition} → {tree}` and `browser.bookmarks.sync {profileDir} → {syncedAt, count} | {error: 'missing'|'unreadable'|'indexUnavailable'|'refused', reason?}`; event `browser.bookmarks.changed {partition}`; `browser.history.suggest` item gains `kind: 'history'|'bookmark'` (in place, marked); `BrowserImportInspection.bookmarks: {count}|null`; `ImportCategories.bookmarks`, phase `'bookmarks'`, `ImportReport.bookmarks` (in place in `src/shared/browser/import.ts`, marked); `src/shared/browser/bookmarks.ts` (`BookmarkNodeSchema`, `BookmarkTreeSchema`, `BOOKMARKS_MAX`, `BOOKMARK_SUGGESTIONS_MAX`, `BookmarkSyncErrorSchema`, `emptyBookmarkTree`, `ROOT_NAMES`); `BrowserBookmarksStore` as `Index.browserBookmarks`; `ImportedProfiles.update`; `sweepBrowserImports({…, bookmarks})` with `SweepResult.bookmarkRows`; `RemoveDeps.bookmarks`; `chrome/read-capped.ts` `readCappedNoFollow`; `local-state.ts` exports `admitted`, `realDirectory`; `test/support/chrome-profile.ts` `writeChromeBookmarks`, `FixtureBookmarks`, `bookmarksOrigin`, profile `bookmarks` and `picture`; `package.json` `e2e:browser-chrome` (in `verify`); `e2e/browser-chrome.spec.ts`.
- **Ledger §6, exceptions to "appended blocks only"** (2026-10-08, cua #90): in-place, marked edits:
  - `src/shared/browser/import.ts`: `ImportCategoriesSchema`, `ImportPhaseSchema`, and `ImportReportSchema` rebuilt over a shared v1 field set with `ImportReportV1Schema` kept.
  - `src/shared/ipc/schema/browser.ts`: the suggest output and `BrowserImportInspectionSchema`.
  - `src/main/browser/partition.ts`: the loose reader's version.
  - `src/main/browser/import/extensions-loader.ts`: its two record writes now go through `update`.
- **Ledger §4:** the migration-7 row can say "pinned in `migrations.test.ts` (sha256 `e5dbe799d588c31efa19def80e2c8b54bec78b138b2e1fe3d3c789fb214fce90`) on branch `90-browser-chrome`".


### From M1b
- **Ledger §4:** the settings-12 row names `browser.bookmarksBar: 'shown'|'hidden'`. M4's amendment should add that ⇧⌘B is a fixed chord that shadows `panel.toggle` inside a browser page and the browser chrome (no keymap action), or whatever the owner decides (Concern 1).
- **Ledger §5, cua board #90:**
  - commands `browser.bookmarks.open {tabId, nodeId, how: 'current'|'newTab'} → void`, `browser.bookmarks.menu {tabId, request: {kind:'folder', nodeId}|{kind:'overflow', hiddenFrom}, anchor:{x,y}} → void`, `browser.bookmarks.favicons {partition, origins} → {icons}` (in `QUERY_COMMANDS`);
  - `BrowserChromeCommand.command` gains `'toggleBookmarksBar'` (in place, marked);
  - `BOOKMARK_FAVICON_ORIGINS_MAX`, `BOOKMARKS_OPEN_ALL_ASK_ABOVE`;
  - `Favicons.resolve(partition, urls, page?)` and `Favicons.forOrigins`;
  - `NativeMenus`/`MenuSpec`/`MenuNode`/`NativeMenuSeam` (`src/main/browser/bookmarks/menu.ts`, for M3's reuse);
  - the e2e seam `__maws_browser.menu` and `MAWS_E2E_OPEN_ALL_ANSWER`;
  - `SETTINGS_DEFAULTS_V12`.
- **Ledger §6, exceptions to "appended blocks only":** `src/shared/ipc/schema/browser.ts` `BrowserChromeCommandSchema`'s enum (marked `cua #90`).



### From M2
- **Ledger §5 (cua board #90)**:
  - `browser.profiles.list`'s item is now `BrowserProfileListItemSchema` = `{ profileDir, name, gaiaName, userName, avatar: { kind: 'picture', dataUrl } | { kind: 'initials', letter } }` (in place, marked).
  - New shared names: `PROFILE_AVATAR_MAX_BYTES`, `PROFILE_AVATAR_URL_PREFIX`, `ProfileAvatar`.
  - Main: `import/avatar.ts` (`readChromePicture`, `avatarPng`, `AvatarImage`, `AVATAR_FILE` = `avatar.png` in the partition folder, `AVATAR_SIZE` 64, `PICTURE_MAX_BYTES` 1 MiB); `chrome/read-capped.ts`'s `readCappedBytesNoFollow`; `local-state.ts`'s `readChromePictureName`; `BrowserImportDeps.decodeImage`/`readPicture`; `browser/profile-avatars.ts` (`ProfileAvatars`, `profileInitial`); `BrowserHandlerDeps.avatars`.
  - Renderer: `import/store.ts` `syncBookmarks`, `startReimport`/`reimportRemoved`/`endReimport` and the state's `reimport`; `ProfileSheets` (app-level, in `App.tsx`); `ImportSheet`/`ProfilePicker` `preselect`; `RemoveSheet` `onRemoved`; `actions.ts` `switchProfile`.
- **Ledger §6, exceptions to "appended blocks only"**: `src/shared/ipc/schema/browser.ts`, the `browser.profiles.list` output (marked); `src/main/browser/partition.ts`, the loose `BrowserProfileSchema`'s optional `gaiaName`/`userName`/`avatar` (marked).
- **Import enumerated reads (E4b Design §9)** gain the Google profile picture: in place, after `admitted()`, `O_NOFOLLOW`, regular file, ≤ 1 MiB.

### From M3
- **Ledger §5, cua board #90:**
  - commands `browser.extensions.actions {partition} → {actions: ExtensionAction[]}` (in `QUERY_COMMANDS`), `browser.extensions.action.click {tabId, extensionId, anchor: {x, y, width, height}} → void`, `browser.extensions.action.options {tabId, extensionId} → void`, `browser.extensions.action.menu {tabId, extensionId, anchor: {x, y}} → void`, `browser.extensions.puzzle {tabId, anchor: {x, y, width, height}} → void`;
  - events `browser.extensions.actions.changed {partition}`, `browser.extensions.popup {tabId, extensionId | null}`, `browser.extensions.reveal {tabId, show: {kind: 'tab', tab: BrowserTab} | {kind: 'settings'}}`;
  - `ExtensionActionSchema {extensionId, name, title, icon: dataUrl | null, hasPopup, hasOptions}`, `EXTENSION_ICON_SIZE`, `EXTENSION_ICON_MAX_BYTES`, `EXTENSION_POPUP_MIN/MAX`, `ACTIONS_FOLD_ADDRESS_MIN_PX`, `optionsTabTitle` (`src/shared/browser/extensions.ts`);
  - `BrowserTab.internal: {kind: 'extension', extensionId, title} | null` (additive, never persisted) and `isExtensionPage(url, extensionId)` (`src/shared/browser/tab.ts`);
  - `ViewManager.onViewAdded/onCovered/isCovered`, `TabStore.evict`, `OpenRequest.internal`, `Browser.extensions.removing`; the import log kind `popupRefused`; the e2e seam `__maws_browser.extensions.popup()` and the menu ids `action:<id>`, `options`, `options:<id>`, `name`, `manage`.
- **Ledger §6, exceptions to "appended blocks only":** `BrowserNoticeSchema.kind` gains `extensionPopupFailed`, `extensionPageClosed` (in place, marked `cua #90`); `BrowserTabSchema` gains `internal` (a marked additive field, as E13's `agentBadge`).
- **X15:** no version moves: `tabs.json` keeps its version (internal tabs are never written; `PersistedTab` picks no new field).
- **Ledger §6 (M3 fix):** the partition request rule `extensionPagesRule` (`src/main/browser/extensions/pages.ts`) registered through `registerRequestRule`; `Navigator.leaveInternal`.

## Residue (for tickets)

- **Popups for extensions that need `chrome.permissions` or the current tab.** Dark Reader's popup hosts and sizes, but its background crashes on Electron 44's missing `chrome.permissions` (E0b's gap). No popup can see the page tab. Settings says so. Closing this means shimming those APIs, the `electron-chrome-extensions` question the spec deferred to the backlog.
- **The P2 cut's Q11 (eager extension loading)**, passed by the P2 composite to #90, is unacted: #90 did not change loading. It stays with the owner.

The eight minor findings live as rows in MAWS `docs/tech-debt-tracker.md` (owner cua board #90) and in the PR's Unresolved Review Findings; they are not residue tickets.

## Friction routed around

- The M1b reviewer stopped mid-review waiting on a background check and had to be resumed to deliver; the harness's hand-back enforcement fired twice while I waited on it. No effect on the work.
- Unit runs under load averages of 50–94 (other sessions' work) failed unrelated pty and rollback files that passed alone each time.

## Carried for the author session

- P2 cut (MAWS master `a2899355`), P2-B's proposed ruling Q11 ("keep eager loading; the question passes to the cua session, whose #90 owns the extensions bar"): carried here unacted, as agreed.
- The tracker rows due at M4 (the refused preparation-time sync and the seven others) are written in MAWS `docs/tech-debt-tracker.md` (`60062715`).
