# Execution report: MAWS in-app browser's Chrome-like top chrome (board #90)

Spec: `docs/doperpowers/specs/2026-10-08-maws-browser-chrome-design.md` (this directory), executed from reviewed revision `050411be`. Code: MAWS worktree `/Users/new/Developer/GitHub/MAWS-wt-90`, branch `90-browser-chrome`, based on master `5bd2cd57`.

(In progress; completed at M4.)

## Milestones

- S1 (MAWS `58125f24`): verdict **promote**; reviewed clean by reviewer-medium on opus.
- M1a (MAWS `af1c70ab`): reviewed clean by reviewer-medium on opus, with no material findings.
- M1b (MAWS `40df2f7b`): under review.

## Text for maws-fe (charter, P1 spec, ledger), collected per milestone

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


## Carried for the author session

- P2 cut (MAWS master `a2899355`), P2-B's proposed ruling Q11 ("keep eager loading; the question passes to the cua session, whose #90 owns the extensions bar"): carried here unacted, as agreed.
- Tracker row due at M4: a preparation-time bookmarks sync refused because another import or removal is running is not retried until the next preparation or a manual sync.
