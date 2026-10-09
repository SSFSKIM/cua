# MAWS in-app browser: Chrome-like top chrome (board #90)

## Purpose

MAWS's in-app browser (the Browser tool: a session panel or a main tab showing a page the session's agent and the person share) imports a Chrome profile's history, cookies and extensions, but its top chrome is a tab strip and an address row. The owner's words (2026-10-08): "프로필 임포트는 됐지만, 뭔가 크롬의 사용자 경험과 다르다. 그 이유는 크롬처럼 위의 바가 없다. 북마크바, 익스텐션바 등등. 그걸 만들어야한다", and "are we importing bookmarks too? if not, we should", and "'minhyeok' 크롬 프로필을 눌렀을때 설정이 메인탭에서 열리는건 아주 disruptive".

After this work, in a Browser tab of an imported profile:

- A **bookmarks bar** sits under the address row with the profile's Chrome bookmarks bar, in Chrome's order, folders as native menus, "Other bookmarks" at the right; it mirrors Chrome read-only and is re-read at every app start and on demand. Typing in the address field suggests bookmarks beside history.
- The **profile pill** shows the profile's avatar and opens a floating **popover** anchored to it (name, signed-in account, switch profile, re-import, sync bookmarks now) instead of replacing the main tab with Settings.
- An **extensions action bar** right of the address field shows each loaded extension's icon; a click opens its popup under the icon in a MAWS-hosted view, and its options page opens as a tab. In a narrow panel the icons fold into one puzzle button.

To see it: Settings › Browser › Import a Chrome profile… with Bookmarks checked (a fourth row), then open a Browser tab in that profile. The e2e `pnpm e2e:browser-chrome` shows the same against the synthetic Chrome fixture.

Design approved by the owner on 2026-10-08 in the cua_repl session (four forks answered: own thin action bar after a spike rather than `electron-chrome-extensions`; bookmarks as a read-only mirror re-read at each start; folder menus native; extension actions inline, folding to a puzzle button when narrow). The profile popover was decided earlier the same day (MAWS owner notes §4 decision 6, relayed on board #90).

## Progress

- [ ] S1 — Spike: what an extension popup can do in a MAWS-hosted view (verdict in Surprises & Discoveries)
- [ ] M1 — Bookmarks: the fourth import category, the index store, the mirror sync, the bar, folder menus, suggestions, the toggle
- [ ] M2 — The avatar and the profile popover
- [ ] M3 — The extensions action bar, popups and options pages (scope fixed by S1's verdict)
- [ ] M4 — Acceptance as written, gates, documents, hand-back

## Facts this design rests on

Read at MAWS master `bb6f953b` (2026-10-08) and from the Electron and `electron-chrome-extensions` sources; paths are MAWS's unless marked cua.

- **The chrome and the page.** `src/renderer/src/tools/browser/View.tsx` stacks `chrome/Chrome.tsx` (tab strip 30 px, nav row `h-9` with back/forward/reload, `AddressField`, `PartitionPill`, `ControlSlot`, `extras` from `extras.ts`, `OverflowMenu`, a 2 px loading bar; then `ZoomBanner`, `FindBar`, `Notices`) above `BrowserPane`. The page is a native `WebContentsView` placed by main at the rectangle the renderer measures (`Pane.tsx`, IPC `browser.view.place`); a taller chrome moves the page down by itself. Rows sit on whole pixels (`Chrome.tsx` header).
- **The cover protocol.** Anything the renderer draws over the page hides the live page: `cover.ts` classes Radix popper wrappers and dialogs as covering, `covering.ts` sends `browser.view.cover`, main hides the view and sends a JPEG still (`browser.view.covered`) that `Pane.tsx` draws; in-chrome layers call `holdCover()` (the address suggestions do). The page context menu is a native `Menu.popup` (`src/main/browser/context-menu.ts`), which macOS draws above the view without covering.
- **The pill.** `chrome/PartitionPill.tsx` shows "Default" or the imported profile's name from `browser.profiles.list` (`{profileDir, name}` only) and opens Settings › Browser as a main tab on click; `chrome/chrome.test.tsx` pins that. A tab's partition is fixed when it opens (`src/main/browser/index.ts`, `partition.ts`), from `settings().browser.profile`.
- **E4b's import** (`docs/doperpowers/plans/2026-10-06-e4b-profile-import.md`): categories History, Cookies, Extensions (`ImportCategoriesSchema`, strict); phases `copying, history, keychain, cookies, verifying, extensions, cleaning`; the record `ImportedProfileSchema` in `profiles.json` (`ImportedProfilesFileSchema { version: 1 }`, strict: an unknown key makes an older build treat the file as broken, after which the boot sweep deletes every imported partition; so new fields need version 2, which older builds open read-only); re-import is a removal and an import (Decision Log 2), no re-sync exists; `Local State` is decoded by `chrome/local-state.ts` taking `name`, `gaia_name`, `user_name` only; `gaiaName`/`userName` reach the consent sheet but are not persisted. Decoders are pure over a staged copy; JSON reads are capped and `O_NOFOLLOW` (`chrome/extensions.ts` `readJson`, `local-state.ts` `readCapped`). Deferred list lines 374 and 377 name exactly this work.
- **Extensions.** `src/main/browser/import/extensions-loader.ts` loads each enabled extension into the partition session at every boot (`onPartitionPrepared`) with `ses.extensions.loadExtension(dir, { allowFileAccess: false })`; the loaded `Extension` exposes `manifest`, `path` and `url` (`chrome-extension://<id>/`); only `manifest.background` is read. Nothing reads `action`, `browser_action`, `default_popup`, `default_icon`, `options_ui` or `options_page`. Electron 44 has no action UI: no toolbar, popup, options surface or `chrome.action` dispatch (Electron's extensions doc; E0b `spikes/browser-probe/findings.txt:316-321`). `electron-chrome-extensions` 4.9.0 supplies one (popup as a frameless child `BrowserWindow` loading `chrome-extension://<id>/<default_popup>` sized by `preferred-size-changed` clamped 25–800 × 25–600; `tabs`/`windows` shims that need the app to register every tab) under GPL-3.0 or a patron licence; rejected (Decision Log).
- **`chrome-extension://` is refused** on every tab path: `validateBrowserUrl` (`src/shared/browser/url.ts`) admits http(s) only; `BrowserUrlSchema` gates `browser.tabs.open`/`navigate`; `will-navigate` cancels other schemes (`src/main/browser/navigation.ts`); `decideWindowOpen` denies them; `displayUrl` shows nothing for them.
- **The index.** `src/main/index/browser-history.ts` (`visit`, `suggest(partition, query, limit)` by SQLite `LIKE` ranked by typed count, visits, recency; `removePartition`; `removeImportedExcept`), migration 5 `browser_history`, migration 6 `browser_activity` (cua board #93), pinned in `migrations.test.ts`; the next number is 7, allocated in the P1 interface ledger §4 (X15). Address suggestions: `AddressField.tsx` → `browser.history.suggest` → `chrome/address-rows.ts` (`history` kind only) → `Suggestions.tsx`.
- **Settings.** `BrowserSettingsSchema { profile, searchUrl, linkTarget }`, settings version 11 (`src/shared/settings/defaults.ts`, `migrateSettings`); a new field is version 12 with a `fromV11` step. Keymap actions live beside `composer.dictate` (E9).
- **Favicons.** `src/main/browser/favicons.ts` (`Favicons`) fetches and caches a tab's favicon per partition for the tab strip.
- **Width.** The session panel is 380 px by default; the nav row already overflows at 379 px (tracker). Main tabs are wide.
- **The e2e fixture.** `test/support/chrome-profile.ts` `buildChromeUserData` writes `Local State` with `Default` (`name 'Person 1'`, `gaia_name 'Probe Owner'`, `user_name 'probe@example.test'`, `avatar_icon`) and `Profile 1` (`name 'Work'`), History, Cookies and extensions (`spikes/browser-probe/ext/test-ext`: `action: { default_title: 'MAWS probe' }`, no popup, no icon); no `Bookmarks` file, no picture file. `e2e/browser-import.spec.ts` and `e2e/support/browser-import-scene.ts` drive it; `e2e/support/launch.ts` relaunches over the same user data.
- **Chrome's files** (public format, no key): `Bookmarks` is JSON `{ version: 1, roots: { bookmark_bar, other, synced }, checksum }`, each root a folder `{ type: 'folder', name, children, guid, date_added }`, each child `{ type: 'url', name, url, guid, date_added }` or a folder; `Local State`'s `profile.info_cache.<dir>` carries `avatar_icon` (`chrome://theme/IDR_PROFILE_AVATAR_<n>`, a stock glyph) and, for a signed-in profile, `gaia_picture_file_name` (a PNG in the profile directory, "Google Profile Picture.png" on current Chrome).
- **Ledger protocol** (maws-fe, 2026-10-08): version allocations in the ledger §4 table are this initiative's to write as "taken" rows at spec commit; any other charter, P1 spec or ledger text goes to maws-fe as text.

## Design

### Shape

Three rows of chrome, one popover, one hosted view. The chrome gains a **bookmarks bar** under the nav row; the nav row gains an **avatar** on the pill and an **action bar** right of the address field; the pill opens a **popover**; an action opens a **popup view** that main places under the icon. Everything the person sees is the renderer's except the two native things macOS draws above the page: folder menus (`Menu.popup`) and the popup view (a `WebContentsView` main owns). The page's placement needs no change: the renderer measures its own chrome.

Why not `electron-chrome-extensions`: it owns tabs and windows through shims MAWS would have to feed from its own `TabStore`, its popup is a child `BrowserWindow` outside the cua lease and cover model, and its licence is GPL-3.0 or paid. MAWS's own bar is thin because the only runtime piece Electron lacks that the bar needs is "a view under an icon"; the rest is manifest reading. What stays unreachable without the library (popups that need `chrome.tabs`/`chrome.windows` shims, `chrome.action.onClicked`) is measured by S1 and stated in the Settings copy rather than faked.

### Bookmarks: the fourth category, a read-only mirror (M1)

**Consent.** The import sheet's category list gains **Bookmarks** between Cookies and Extensions, showing the count found (`inspection.bookmarks: { count } | null`; null when the file is absent or unreadable, with the row disabled and "No bookmarks file"). Checked by default when present. `ImportCategoriesSchema` gains `bookmarks: boolean`; `ImportPhaseSchema` gains `'bookmarks'` after `cookies` (before `verifying`); the report gains `bookmarks: { imported: number, skipped: number } | null` and the summary text a "N bookmarks" clause.

**Reading.** A pure decoder `src/main/browser/import/chrome/bookmarks.ts` `parseBookmarks(text): BookmarkTree | null` over the JSON above, read with the capped, `O_NOFOLLOW` read the extension inspector uses (cap 16 MiB; a larger file is "unreadable"). It keeps `bookmark_bar`, `other` and `synced` (Chrome's "Mobile bookmarks"), folders nested as they are, URL nodes whose URL is http(s) (the rule `classifyHistoryRow` applies to history: `javascript:`, `chrome:`, `file:` and the rest are skipped and counted), names cut at `IMPORT_TEXT_MAX`, and at most `BOOKMARKS_MAX = 20000` URL nodes in document order (the rest skipped and counted). `date_added` (Chrome's microseconds since 1601) becomes epoch ms. The decoder reads the file in place from the Chrome profile directory, not from a staged copy: the file is small, the read is one `open` with `O_NOFOLLOW`, and the same read serves the sync below.

**Storage.** Index migration 7, table `browser_bookmarks` (Interfaces), one row per node, keyed per partition, with `(partition, parent_id, position)` for the tree and `(partition, url)` for suggestions. `src/main/index/browser-bookmarks.ts` `BrowserBookmarksStore` replaces a partition's rows in one transaction (`replace`), returns the tree (`tree`), matches for the address field (`suggest`), and removes per partition (`removePartition`) and for the boot sweep (`removeExcept`). Removal (`import/remove.ts`) and the sweep (`import/sweep.ts`) gain the bookmarks step beside history. A read-only index (E11's older-build case) lists nothing and syncs nothing.

**Mirror.** The record (profiles.json version 2, Interfaces) carries `bookmarks: { consentedAt, syncedAt, count, error } | null`. Every time the partition is prepared at boot (`Partitions.registerPreparer`, where the extensions load) and on `browser.bookmarks.sync { profileDir }`, main re-reads `<userDataDir>/<profileDir>/Bookmarks`, replaces the partition's rows, and writes `syncedAt` and `count`; when the read fails (file gone, unreadable, over the cap, Chrome folder moved) the rows stay as they were and `error` carries one of `'missing' | 'unreadable'` with the time, which the popover shows as "Chrome의 북마크 파일을 읽지 못함 · 마지막 동기화 <time>". Nothing is ever written to Chrome's folder; MAWS has no bookmark editing, star button or drag. Main raises `browser.bookmarks.changed { partition }` after every replace; the renderer re-fetches the tree.

Why a mirror rather than a one-time copy: bookmarks change daily in Chrome while the owner keeps using it, and a stale bar is the Chrome-unlike experience the ticket is about; the read is the same consented read the import did. Why re-read at boot rather than watch the file: Chrome rewrites `Bookmarks` through a temporary file on every change and MAWS has no reason to follow it live; boot plus "sync now" covers the day.

**The bar.** `chrome/BookmarksBar.tsx`, 28 px, rendered between the nav row and the zoom banner when the tab's partition has a record with `bookmarks` consented and the setting `browser.bookmarksBar` is `'shown'`; hidden entirely when the bar root has no children (no empty bar with an "import" hint: the import sheet is the place). Items are chips, 16 px favicon then name (elided at 160 px), in Chrome's order; folders show a folder glyph and open a **native menu** on click: main builds it from the subtree (`browser.bookmarks.menu { partition, nodeId, anchor }`), nested folders as submenus, a separator and "Open all (n)" at the end when the folder has URL children; a chosen URL loads in the current tab, "Open all" opens each in a new tab of the same partition, in order, without selecting them. The bar's last slot is **»**: the chips that do not fit (the renderer measures) and, after a separator, **Other bookmarks** and **Mobile bookmarks** as folders when non-empty. A URL chip click navigates the current tab (`browser.tabs.navigate` with `typed: false`, so the address field shows the URL like a link click); ⌘-click or middle-click opens a new unselected tab. Favicons come from the partition's `Favicons` cache when it already holds the origin's icon (a `browser.favicons.lookup { partition, url }`-style read the executor adds to the cache, batched per bar); otherwise a generic page glyph. No network fetch for a bookmark that was never visited: a bar of a hundred bookmarks must not fire a hundred requests at open.

**Toggle.** Settings version 12 adds `browser.bookmarksBar: 'shown' | 'hidden'` (default `'shown'`); the keymap action `browser.toggleBookmarksBar` on ⌘⇧B (Chrome's chord) flips it, and Settings › Browser gains the switch next to the profile select. The bar's chord is taken by the chrome, not the page, like ⌘L (keys.ts).

**Suggestions.** `browser.history.suggest` keeps its name and limit (8) and its items gain `kind: 'history' | 'bookmark'`: bookmarks whose name or URL matches rank above history rows of the same partition, at most 3 of the 8, each drawn with a bookmark glyph in `Suggestions.tsx`. A bookmark that is also history appears once, as a bookmark.

### The avatar and the profile popover (M2)

**Import.** `local-state.ts` additionally reads `avatar_icon` and `gaia_picture_file_name`; when the picture file exists in the profile directory (PNG, cap 1 MiB, `O_NOFOLLOW`) the import copies it to the partition folder as `avatar.png`; the record (version 2) carries `gaiaName`, `userName`, `avatar: { kind: 'picture' } | { kind: 'initials' }`. `avatar_icon`'s stock glyph is not reproduced (the ids map to Chrome's own art); initials stand in. `browser.profiles.list` answers `{ profileDir, name, gaiaName, userName, avatar: { kind: 'picture', dataUrl } | { kind: 'initials', letter } }` (the PNG as a data URL, read once per boot and on `browser.import.changed`). The Default partition lists with initials "D"-less: a neutral person glyph.

**The pill** shows the 18 px avatar (round; the picture, or the initial on a token-coloured disc from the profile's name hash over the theme's accent palette) and the name. Click opens the **popover** (Radix `Popover`, `modal={false}`, anchored to the pill, `holdCover()` while open as the suggestions do, closed on click-away or Esc). Content, top to bottom: avatar 40 px, name, the account line ("로그인: Probe Owner · probe@example.test" when `gaiaName` is set, else "Chrome에 로그인되지 않은 프로필"), then rows: **Switch profile** (a submenu-like list of the other listed profiles including Default, each with its avatar: choosing one sets `browser.profile` to it and opens a new selected tab in that partition at the new-tab state; the current tab stays, since a tab's partition is fixed), **Sync bookmarks now** (shown when the record's bookmarks are consented; runs `browser.bookmarks.sync`; shows "마지막 동기화 <relative time>" under it, or the error line above), **Re-import this profile…** (E4b's rule: opens the remove sheet, and on its completion the import sheet with this profile preselected), and a muted link **Browser settings** that opens Settings › Browser as a main tab (the old click, kept for the person who wants it). For the Default partition the popover has the avatar, "Default profile", Switch profile and the settings link only. `chrome.test.tsx`'s pill test changes to assert the popover opens and the layout store's tabs are unchanged.

### The extensions action bar (M3, scoped by S1)

**Actions.** After an extension loads, main reads its manifest's `action` (MV3) or `browser_action` (MV2): `default_title` (else the name), `default_icon` (a string or a size map: the largest at or under 32, resolved against `extension.path` and read as a data URL, cap 256 KiB; absent icon: a generic puzzle piece), `default_popup`; and `options_ui.page` or `options_page`. `browser.extensions.actions { partition }` lists `{ extensionId, name, title, icon, hasPopup, hasOptions }` for every loaded extension in Settings' enabled order; `browser.extensions.actions.changed { partition }` fires after loads and unloads. Extensions without an `action`/`browser_action` entry are listed with their icon from `icons` and `hasPopup: false` so the person sees them (Chrome shows these too).

**The bar.** `chrome/ActionBar.tsx` sits in the nav row right of the address field and before the pill: 24 px buttons with the icon, the title as tooltip. The renderer measures the row; when the inline icons would push the address field under 160 px the bar folds into one **puzzle** button whose click opens a native menu (built by main from the same list) with every action, each item doing what the button does, and a final "Manage extensions…" that opens Settings › Browser. In the wide main tab all icons are inline.

**The popup view.** A click on an action with `hasPopup` sends `browser.extensions.action.click { partition, extensionId, anchor: rect }`. Main creates one `WebContentsView` in the partition's session (no MAWS preload, `sandbox: true`, `contextIsolation: true`, `enablePreferredSizeMode: true`), loads `chrome-extension://<id>/<default_popup>`, places it under the anchor in window coordinates sized by `preferred-size-changed` clamped to 25–800 × 25–600 (the library's limits), on top of the page view; it closes on blur, Esc from its own page, a second click on the same action, a tab or surface change, or the window losing focus; one popup at a time per window. The popup view is native and does not take the cover protocol. Its `window.open` and navigations to http(s) open a new tab of the partition (as a link from the popup would in Chrome); any other scheme is refused. A click on an action without a popup does what S1 found: fires `chrome.action.onClicked` if Electron offers a way, else the button is drawn as present-but-inert with the tooltip "This extension has no popup here". Options: an action's context menu (and the puzzle menu's submenu) offers "Options" when `hasOptions`; it opens a new tab whose URL is the extension's options page. That is the one place a `chrome-extension://` URL loads in a tab: main constructs it from the loaded extension (`extension.url + page`) and opens the tab through a new internal path (`openExtensionPage(partition, extensionId, 'options')`) that marks the tab `internal: { extensionId }`; `will-navigate` admits that tab's own origin only; the address field shows "<extension name> · Options" and is read-only for that tab; `validateBrowserUrl`, `BrowserUrlSchema` and window-open stay http(s)-only.

**What S1 settles** (promote-or-discard criteria in the milestone): whether a popup page in such a view reaches the extension's background (MV3 service worker through `chrome.runtime.sendMessage`/`connect`; MV2 background page), what `chrome.tabs.query({ active: true, currentWindow: true })` answers inside it, whether the preferred-size event sizes it, whether Electron can fire `action.onClicked` at all, and whether MAWS's browser preload runs in extension pages (it must not). The verdict fixes M3's scope: popups promoted as designed, or reduced to icons + options + the inert tooltip with the reason recorded in the Settings copy ("Popups need Chrome's tab API, which this browser does not provide").

### Lifecycle and failure table

| Event | Effect |
|---|---|
| Import with Bookmarks checked | phase `bookmarks`: read, decode, `replace`; the record's `bookmarks.consentedAt`/`syncedAt`/`count` set; report counts imported and skipped |
| Import with Bookmarks unchecked, or no file | `bookmarks: null` on the record; no bar, no sync, no popover row |
| App start, partition prepared | sync for every record with `bookmarks`; failure keeps rows and sets `error` |
| Sync now (popover or Settings) | same as boot; the popover's time line updates; a toast on error |
| `Bookmarks` file missing at sync | rows kept, `error: 'missing'`, bar unchanged |
| Index read-only (older build) | bar hidden (empty tree), sync skipped, popover row says "unavailable in this build" |
| Remove imported profile | rows removed (new step beside history), `avatar.png` goes with the partition folder, popup closed, actions cleared |
| Boot sweep of an unlisted partition | bookmark rows removed with the history rows |
| Profile switch from the popover | `browser.profile` set; a new tab in that partition; current tab untouched |
| Extension unload or toggle Off | its action disappears; an open popup of it closes |
| Popup page crashes or fails to load | the view closes; a toast names the extension |
| Window closes with a popup open | the view is destroyed with the window |
| cua lease on the tab | none of the above changes the lease, the takeover gate or the activity rows; a person's bookmark click is a person's navigation (cua board #98's stamp, through `Navigator.navigate`) |

### What users see change

Three new things in a Browser tab of an imported profile: a bookmarks bar, an avatar on the pill with a popover, extension icons by the address field. The import sheet asks about Bookmarks. Settings › Browser gains a bookmarks-bar switch and a "Sync bookmarks now" per imported profile with its last-sync time. Nothing changes for the Default partition except the pill's popover with Switch profile. Chrome itself is never written.

### Out of scope

Bookmark editing in MAWS (star, drag, rename, delete); importing Chrome's `Favicons` store; `avatar_icon` stock glyphs; extension badges, `chrome.action.setIcon`/`setPopup` at runtime, keyboard `commands`, side panels, omnibox; per-site access grants; a bookmarks manager page; a history page; the `electron-chrome-extensions` route. Each is a backlog line, not a deferred decision.

## Acceptance

Observed against the synthetic Chrome fixture (M1 extends it with a `Bookmarks` file for Default: bar items `A`, `B`, a folder `F` with `F1`, `F2` and a nested folder `G` with `G1`, and 40 more `N01…N40` so the bar overflows; `other` with `O1`; `synced` empty; one `javascript:` node to be skipped; and a 64×64 PNG as Default's `gaia_picture_file_name`; the probe extension gains `action.default_popup: 'popup.html'` with a page that prints the answer of `chrome.runtime.sendMessage` and of `chrome.tabs.query`, and `options_ui.page: 'options.html'`), by `pnpm e2e:browser-chrome` and by hand in the owner's MAWS build with a real imported profile.

1. The import sheet lists **Bookmarks** with "44 bookmarks" (the decoder has already skipped the `javascript:` node); the report says 44 imported, 1 skipped.
2. A Browser tab in the imported profile shows the bar under the address row: chips `A`, `B`, folder `F`, then as many `N` chips as fit, then **»**; the » menu lists the remaining `N` chips, a separator, **Other bookmarks**. The Default partition's tab shows no bar.
3. Clicking `A` loads its URL in the current tab and the address field shows it; ⌘-clicking `B` opens a new, unselected tab at `B`'s URL. Opening folder `F` shows a native menu with `F1`, `F2`, submenu `G` → `G1`, a separator, "Open all (2)"; choosing `F1` loads it; "Open all" opens two unselected tabs. (The e2e drives the menu through a `MAWS_E2E` seam that lists the built menu and picks an item, as the context menu's seam does.)
4. ⌘⇧B hides the bar and the page grows by 28 px; relaunch keeps it hidden; ⌘⇧B shows it again; Settings › Browser's switch mirrors it.
5. Editing the fixture's `Bookmarks` file (rename `A` to `A2`, add `Z`) and relaunching shows `A2` and `Z`; editing again and pressing **Sync bookmarks now** in the popover shows the change without a relaunch; deleting the file and syncing keeps the bar and shows the "읽지 못함" line in the popover.
6. Typing `f1` in the address field suggests `F1` with the bookmark glyph above any history row; typing a history-only title suggests it as before.
7. The pill shows the PNG avatar for Default's import and the initial "W" for Work's; clicking it opens the popover with the name, "로그인: Probe Owner · probe@example.test" (Work: the not-signed-in line), Switch profile, Sync bookmarks now with "마지막 동기화 …", Re-import this profile…, Browser settings; the main area keeps the Browser tab (no Settings tab opens); clicking the page's chrome outside closes it.
8. Switch profile → Work opens a new selected tab in Work's partition; the previous tab still shows its page in the first profile; the pill of the new tab reads Work.
9. The probe extension's icon stands right of the address field in a main-tab Browser; clicking it opens a popup view under the icon whose page shows the background's reply (S1 promoted) or, if S1 discarded popups, the icon is inert with the tooltip; its context menu's Options opens a tab titled "MAWS probe · Options" showing `options.html`. In the session panel at 380 px the icons fold into one puzzle button whose menu lists the extension and "Manage extensions…".
10. Remove imported profile: the bar disappears from its tabs, `browser_bookmarks` has no rows of the partition, the avatar file is gone with the folder, the actions list is empty.
11. A tab under a cua lease: a person's bookmark click produces no agent activity row (cua board #98's rule); the agent's navigation through CDP still does.
12. Gates: `pnpm typecheck && pnpm lint && pnpm test`, `pnpm e2e:browser-chrome`, `pnpm e2e:browser-import`, `pnpm e2e:browser`, `pnpm e2e:browser-cua`, `pnpm build:app`.

## Constraints binding every milestone

- **Repositories and branches.** MAWS work on branch `90-browser-chrome` in worktree `/Users/new/Developer/GitHub/MAWS-wt-90` (never the main checkout `/Users/new/Developer/GitHub/MAWS`, which stays on master); this spec and its Progress in the cua worktree `/Users/new/Developer/GitHub/cua-wt-90` on `spec/browser-chrome-90`. One MAWS PR at the end; the spec's PR to cua main after it.
- **MAWS's standing rules** (`CLAUDE.md`, `docs/charter.md`): D-1 (the engine is never touched; nothing here needs it); X7 (theme tokens only; light theme default); X15 (settings version 12, index migration 7 and profiles.json version 2 are taken in the ledger §4 table at spec commit, released entries never edited, migration 7 pinned in `migrations.test.ts` in the PR that merges it); the ledger's appended-block rule for shared files (`src/shared/ipc/schema/browser.ts`, `src/shared/browser/*`); every read command used through `useCommand` listed in `QUERY_COMMANDS`; zod 4 strict objects with the `Schema` suffix; copy in the copy modules (`tools/browser/copy.ts`, `import/copy.ts`, `settings-tab/copy.ts`), Korean strings where the owner's words above are quoted as UI copy; unit tests beside sources; no attribution footers in commits or PRs.
- **E4b's rules, inherited.** The import is a copy; Chrome's folder is read, never written (P-7); each category opt-in and reported; the owner's Chrome profile is read by no executor, test or e2e (only the synthetic fixture); nothing logs a value (no bookmark URL beyond its host, no name, no picture bytes, no `Local State` field beyond the names); JSON and PNG reads are capped and `O_NOFOLLOW`; the staging directory is deleted on every exit path; every child process is stopped.
- **The cover protocol** is not changed: DOM layers in the chrome call `holdCover()`; native menus and the popup view are the only things above the live page.
- **Charter, P1 spec and ledger prose** are sent to maws-fe as text; the ledger §4 version rows are written here. Tracker rows only for residue, with the ticket named.
- **Verification.** Each milestone's review at its boundary by `doperpowers:reviewer-medium`; the whole-branch review before the MAWS PR by `doperpowers:reviewer-high` (on opus while astra is at its usage limit; the pin changes only by the owner's word); the spec's own reviews are the Decision Log's first entry. Executors and reviewers on opus at high (P-16 as E4b applied it).

## Plan of Work

### S1 — Spike: an extension popup in a MAWS-hosted view

Question: in Electron 44.4.5 as MAWS ships it, can a `WebContentsView` in the partition's session show an extension's `default_popup` page usefully? Build under `spikes/extension-popup/` in the MAWS worktree: a script that launches a bare Electron app with the fixture's probe extension (given a `popup.html` that calls `chrome.runtime.sendMessage({ ping: 1 })` and `chrome.tabs.query({ active: true, currentWindow: true })` and prints both answers, and an MV3 service worker that answers the ping; plus one MV2 variant with a background page) and two public extensions fetched into the spike's scratch dir (Dark Reader, MIT; Refined GitHub, MIT; their release zips), then opens each popup in a view with `enablePreferredSizeMode` and records: did the page load; the `sendMessage` reply; the `tabs.query` answer; the `preferred-size-changed` sizes; whether anything in Electron fires `chrome.action.onClicked` (try `webContents.executeJavaScript` in the worker through `ServiceWorkerMain` if exposed; else record "no API"); whether a frame preload registered on the session runs in the popup page. Observe through the script's stdout, recorded as `spikes/extension-popup/findings.txt` with the exact outputs. Promote when the fixture popup loads, gets the ping's reply and sizes itself: M3 builds the popup view as designed. Discard popups when the page loads but cannot reach its background, or the view cannot be sized: M3 ships icons, the puzzle menu and options pages, with popups absent and the Settings copy saying why. Either way `tabs.query`'s answer and the `onClicked` finding are recorded for the copy and the backlog. No tests; the spike directory stays as the evidence (it is not shipped code). Does not touch `src/`.

### M1 — Bookmarks: category, store, mirror, bar, menus, suggestions, toggle

At its end: the import sheet asks about Bookmarks; an imported profile's Browser tab shows the bar as the design describes, with native folder menus and the » overflow; the bar mirrors the Chrome file at boot and on `browser.bookmarks.sync`; bookmarks appear in address suggestions; ⌘⇧B and the Settings switch hide and show the bar; removal and the sweep clear the rows.

Touches: `src/shared/browser/import.ts` (categories, phase, report, inspection), `src/shared/browser/profiles.ts` (version 2 with every new field of this spec: `bookmarks`, `gaiaName`, `userName`, `avatar`, so one version bump serves M2; the loader opens version 1 files by upgrading them in memory and writing version 2 on the next write), `src/shared/browser/bookmarks.ts` (new: the node and tree schemas), `src/shared/ipc/schema/browser.ts` (appended block: `browser.bookmarks.*`, the suggest item's `kind`), `src/shared/settings/defaults.ts` and `schema/settings.ts` (version 12), the keymap, `src/main/browser/import/chrome/bookmarks.ts` (new), `import/service.ts` (inspection and phase), `import/profiles.ts` (version 2), `import/remove.ts`, `import/sweep.ts`, `src/main/browser/bookmarks/` (new: the sync and the menu builder), `src/main/index/migrations.ts` (7), `src/main/index/browser-bookmarks.ts` (new), `browser-history.ts` (`suggest` joins bookmarks or the handler merges the two), `src/main/browser/register.ts`, `src/main/browser/favicons.ts` (the lookup), `src/renderer/src/tools/browser/chrome/BookmarksBar.tsx` (new), `Chrome.tsx`, `AddressField.tsx`/`address-rows.ts`/`Suggestions.tsx`, `import/Consent.tsx`, `import/Report.tsx`, `settings-tab/BrowserSection.tsx`, copy modules, `test/support/chrome-profile.ts` (the fixture's `Bookmarks` and picture file, shared with M2), `e2e/browser-chrome.spec.ts` (new, scenes 1–6 of Acceptance) and `package.json`'s `e2e:browser-chrome`.

Interfaces: produces everything under "Bookmarks" and "Records" in Interfaces and Dependencies; consumes E4b's import pipeline and E4a's `Favicons`, `Navigator`, `TabStore`.

Decisions for this milestone: the in-place read of `Bookmarks` (design) with the inspector's capped `O_NOFOLLOW` read; the bar's chip width and elision are the executor's within the 28 px row and whole-px rule; the native menu's e2e seam copies the context menu's (`MAWS_E2E` global that exposes the last built template and a `pick(label)`); the `»` menu and folder menus are one builder; "Open all" caps at 20 tabs with the rest dropped and a toast (a folder of 200 bookmarks must not open 200 tabs); the suggest merge happens in the handler (`register.ts`) with the two stores unchanged in shape, bookmarks first; version-1 profiles.json files are upgraded, never treated as broken, and a version-2 file is opened read-only by an older build (E11's rule) — the executor adds the version-2 fixture to `profiles.test.ts`.

Does not touch: the avatar's pill drawing and the popover (M2, though their record fields land here), extensions (M3), the Default partition's chrome.

Proves: acceptance 1–6 and 10's bookmark half; unit tests pin: the decoder on a Chrome-shaped sample (roots, nesting, the skipped schemes, the cap, the microsecond dates), `replace` idempotence and per-partition isolation, the suggest ranking (bookmark above history, deduplication), the profiles.json version 1→2 upgrade and read-only-on-newer, `migrateSettings` 11→12, the sync's failure modes (missing, unreadable, over the cap keep the rows and set `error`), the menu builder's shape (submenus, separator, "Open all (n)", the cap).

### M2 — The avatar and the profile popover

At its end: the pill shows the picture or the initial; the popover opens anchored to the pill with its rows and actions; the main area is never displaced; Switch profile opens a new tab in the chosen partition; Sync bookmarks now and Re-import work from the popover; the Default partition's popover has its reduced set.

Touches: `src/main/browser/import/chrome/local-state.ts` (`avatar_icon`, `gaia_picture_file_name`), `import/service.ts` (the picture copy in the `copying` phase, capped), `src/main/browser/register.ts` (`browser.profiles.list`'s new fields, the data URL read), `src/shared/ipc/schema/browser.ts` (appended: the list item's new fields), `chrome/PartitionPill.tsx`, `chrome/ProfilePopover.tsx` (new), `chrome/chrome.test.tsx`, `tools/browser/copy.ts`, `settings-tab/BrowserImport.tsx` (Sync bookmarks now with the time line, beside Show report), `import/store.ts` (the re-import flow: removal then the sheet preselected), `test/support/chrome-profile.ts` (if M1 left the picture out), `e2e/browser-chrome.spec.ts` scenes 7–8.

Interfaces: consumes M1's record fields and `browser.bookmarks.sync`; produces `browser.profiles.list`'s extended item.

Decisions: the initial is the first grapheme of `name` (Intl.Segmenter) upper-cased, on a disc coloured by a stable hash of `profileDir` over four accent tokens; the popover width 280 px; Switch profile lists at most 8 profiles then "Browser settings…"; the re-import flow reuses the existing RemoveSheet and ImportSheet with a `preselect: profileDir` prop; relative time copy follows the transcript's existing relative-time helper; the popover is the chrome's layer (`holdCover()`), so the page freezes to its still while open, as every MAWS popover does (the owner chose the popover knowing the sidebar alternative; the still is the existing protocol, not a new effect).

Does not touch: extensions; the bookmarks bar's behaviour; the Settings tab's layout beyond the one row.

Proves: acceptance 7–8 and 10's avatar part; unit tests pin: `local-state.ts`'s new fields with absent and malformed values, the picture copy's cap and `O_NOFOLLOW` refusal, `browser.profiles.list`'s shape for picture/initials/Default, the pill test's new assertion (popover opens, layout tabs unchanged), the switch's effects (`browser.profile` written, a tab opened in the chosen partition, the current tab's partition unchanged).

### M3 — The extensions action bar, popups and options pages

At its end, under S1's verdict: action icons in the nav row with the puzzle fold; popups in the hosted view (promoted) or the inert tooltip (discarded); options pages as internal tabs; the puzzle menu and action context menus; Settings copy stating the popup limitation when discarded.

Touches: `src/main/browser/extensions/actions.ts` (new: manifest reading, the list, the event), `src/main/browser/extensions/popup.ts` (new: the view's lifetime and placement; `ViewManager` learns one auxiliary view per window), `src/main/browser/import/extensions-loader.ts` (hooks after load/unload), `src/main/browser/navigation.ts` (the internal extension tab's origin admission), `src/main/browser/tabs.ts` (the `internal` mark), `src/shared/ipc/schema/browser.ts` (appended: `browser.extensions.*`), `src/shared/browser/tab.ts` (the tab's `internal` field and `displayUrl` for it), `chrome/ActionBar.tsx` (new), `chrome/NavRow.tsx`, `AddressField.tsx` (read-only for internal tabs), copy, `spikes/browser-probe/ext/test-ext` (the popup and options pages from S1, kept as the fixture), `e2e/browser-chrome.spec.ts` scene 9, `settings-tab/copy.ts`.

Interfaces: consumes S1's verdict and E4b's loader; produces the `browser.extensions.*` block.

Decisions: the popup view's bounds are computed in main from the anchor rect the renderer sends plus the window's content offset, the view flipped above the anchor when it would not fit below; the view is destroyed, not hidden, on close (an extension's popup re-runs on every open in Chrome too); only http(s) `window.open`/navigation from the popup becomes a tab, everything else refused with the page's `refusedScheme` notice path; the internal tab's title is `<name> · Options`, its favicon the action icon, its address field shows the title and refuses typing; a puzzle fold threshold of an address field under 160 px; the actions list is per partition and recomputed on each load/unload, never persisted; when S1 discarded popups, an action with `hasPopup` is drawn with reduced opacity and the tooltip, and the Settings imported-profile block gains one muted sentence.

Does not touch: badges, runtime icon changes, `chrome.action.*` beyond `onClicked`'s attempt, site access, the bookmarks bar, the popover.

Proves: acceptance 9 and 10's actions part; unit tests pin: manifest reading for MV2/MV3 shapes, the icon size pick, absent fields; the actions list order and the change event on unload; the popup's close reasons (blur, Esc, second click, tab change, unload) as a state table test on a fake view; the internal tab's navigation admission (own origin admitted, another extension's origin and http refused as navigation but http opened as a tab); the fold threshold.

### M4 — Acceptance as written, gates, documents, hand-back

Runs Acceptance 1–12 by the quoted commands, by hand in the owner's build for the real-profile items the owner must see (the bar on their profile, the popover, their extensions' icons and whichever popups S1's verdict allows), and the full gates. Writes the MAWS pointer document `docs/doperpowers/plans/2026-10-08-browser-chrome-90.md` (purpose, the spec's path, the versions taken, the branch, the verdicts), the tracker rows for residue, the Settings and README copy where MAWS documents the browser, and sends maws-fe the charter/ledger text (the ledger §5 `browser.bookmarks.*`/`browser.extensions.*` rows, X15's lists, a §19 landing line). Opens the MAWS PR after the whole-branch review; the owner's sitting on the real profile is the last check before merge. Then this spec's Outcomes & Retrospective, Progress ticked, and the cua PR for the spec.

## Concrete Steps

Working directory for MAWS commands: `/Users/new/Developer/GitHub/MAWS-wt-90` (created with `git worktree add -b 90-browser-chrome ../MAWS-wt-90 origin/master`, then `pnpm install --frozen-lockfile`).

- S1: `node spikes/extension-popup/run.mjs` (the executor writes it; it launches `electron` from `node_modules/.bin` with the spike's main) → prints per extension `loaded: yes/no`, `ping reply: …`, `tabs.query: …`, `preferred size: WxH`, `onClicked: no API | fired`, `preload ran: yes/no`; the same lines land in `spikes/extension-popup/findings.txt`.
- Each milestone: `pnpm typecheck && pnpm lint && pnpm test` (expect every file passing; the tracker's known flaky `pause-take-over.pty.test.ts` may fail in a full run and must pass alone), `pnpm e2e:browser-import` (expect the existing 5 scenes green plus the Bookmarks row changes M1 makes), `pnpm e2e:browser-chrome` (M1: scenes 1–6; M2: 1–8; M3: 1–9), `pnpm e2e:browser-cua` (4 cases green).
- M4: the four e2e scripts above, `pnpm e2e:browser`, `pnpm build:app`; then the owner's sitting with `pnpm dev` run by the owner.
- Spec progress: `cd /Users/new/Developer/GitHub/cua-wt-90 && git add docs && git commit` at every stopping point.

## Interfaces and Dependencies

Libraries: Electron 44.4.5 as shipped (`WebContentsView`, `Menu`, `session.extensions`), zod 4, Radix `Popover`, `node:sqlite` through the index's `Db`. No new dependency.

**Bookmarks** (`src/shared/browser/bookmarks.ts`):

```ts
export const BookmarkNodeSchema: z.ZodType<BookmarkNode> = z.lazy(() => z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url'), id: z.number().int(), name: z.string().max(IMPORT_TEXT_MAX), url: BrowserUrlSchema, addedAt: z.number().int().nullable() }),
  z.strictObject({ kind: z.literal('folder'), id: z.number().int(), name: z.string().max(IMPORT_TEXT_MAX), children: z.array(BookmarkNodeSchema) }),
]));
export const BookmarkTreeSchema = z.strictObject({ bar: FolderSchema, other: FolderSchema, mobile: FolderSchema });
export const BOOKMARKS_MAX = 20000;
```

Index migration 7 (`src/main/index/migrations.ts`, appended, pinned by the merging PR):

```sql
CREATE TABLE browser_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partition TEXT NOT NULL,
  parent_id INTEGER,            -- NULL for the three roots
  root TEXT NOT NULL CHECK (root IN ('bar','other','mobile')),
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('url','folder')),
  name TEXT NOT NULL,
  url TEXT,                     -- NULL for folders
  added_at_ms INTEGER
);
CREATE INDEX browser_bookmarks_tree ON browser_bookmarks (partition, parent_id, position);
CREATE INDEX browser_bookmarks_url ON browser_bookmarks (partition, url);
```

`src/main/index/browser-bookmarks.ts`:

```ts
export class BrowserBookmarksStore {
  replace(partition: string, tree: BookmarkTree): void;          // one transaction; ids reassigned
  tree(partition: string): BookmarkTree;                          // empty roots when none or read-only
  suggest(partition: string, query: string, limit: number): { url: string; title: string }[];
  removePartition(partition: string): void;
  removeExcept(partitions: string[]): void;                       // the boot sweep
}
```

IPC (appended block in `src/shared/ipc/schema/browser.ts`, owner main): `browser.bookmarks.tree { partition } → { tree }`; `browser.bookmarks.sync { profileDir } → { syncedAt, count } | { error: 'missing' | 'unreadable' }`; `browser.bookmarks.menu { partition, nodeId, anchor: { x, y } } → {}` (the menu is native; the chosen item acts in main); `browser.bookmarks.open { partition, nodeId, how: 'current' | 'newTab' }` for chip clicks; event `browser.bookmarks.changed { partition }`. `browser.history.suggest`'s item gains `kind: 'history' | 'bookmark'`.

Settings version 12: `browser.bookmarksBar: z.enum(['shown', 'hidden'])`, default `'shown'`; keymap action `browser.toggleBookmarksBar` default `Meta+Shift+B`.

**Records** (`src/shared/browser/profiles.ts`, version 2):

```ts
bookmarks: z.strictObject({ consentedAt: z.iso.datetime(), syncedAt: z.iso.datetime().nullable(), count: z.number().int(), error: z.enum(['missing','unreadable']).nullable(), errorAt: z.iso.datetime().nullable() }).nullable(),
gaiaName: ImportNameSchema.nullable(),
userName: ImportNameSchema.nullable(),
avatar: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('picture') }), z.strictObject({ kind: z.literal('initials') })]),
```

`ImportedProfilesFileSchema { version: 2 }`; a version-1 file parses through the version-1 schema and upgrades with `bookmarks: null, gaiaName: null, userName: null, avatar: { kind: 'initials' }`. `ImportCategoriesSchema` gains `bookmarks: z.boolean()`; `ImportPhaseSchema` gains `'bookmarks'`; `ImportReportSchema` gains `bookmarks: z.strictObject({ imported, skipped }).nullable()`; the inspection answer gains `bookmarks: { count } | null`.

**Profiles list item** (`browser.profiles.list`): `{ profileDir, name, gaiaName, userName, avatar: { kind: 'picture', dataUrl } | { kind: 'initials', letter } }` for each imported record; the Default partition stays out of the list as today and the renderer draws its neutral glyph and reduced popover itself.

**Extensions** (`src/shared/browser/extensions.ts`, new; IPC appended): `browser.extensions.actions { partition } → { actions: { extensionId, name, title, icon: dataUrl | null, hasPopup, hasOptions }[] }`; `browser.extensions.action.click { partition, extensionId, anchor: Rect }`; `browser.extensions.action.options { partition, extensionId }`; `browser.extensions.puzzle { partition, anchor }` (the native menu); event `browser.extensions.actions.changed { partition }`. The tab gains `internal: { kind: 'extension', extensionId, title } | null` in `BrowserTab` (`src/shared/browser/tab.ts`).

```ts
// src/main/browser/extensions/popup.ts
export class ExtensionPopups {
  open(window: BrowserWindow, partition: string, extensionId: string, anchor: Rect): void; // closes any open one first
  close(reason: 'blur' | 'escape' | 'toggle' | 'tab' | 'unload' | 'window'): void;
  readonly open$: (listener: (state: { extensionId: string } | null) => void) => () => void;
}
```

## Surprises & Discoveries

(To be filled by the executor: S1's verdict with the recorded outputs; anything the code showed that this design did not.)

## Decision Log

- 2026-10-08 (authoring, the verification call): one independent design review by a general-purpose subagent on fable, and the `doperpowers:adversarial-reviewer` on the execution section (four build milestones plus a spike); whole-branch review rung `doperpowers:reviewer-high`, milestone frontiers `reviewer-medium`. Reviewers on opus while astra is at its usage limit (the owner's standing note).
- 2026-10-08: `electron-chrome-extensions` rejected for the action bar (GPL-3.0 or patron licence; its tabs/windows shims and child-window popup sit outside MAWS's `TabStore`, cua lease and cover model); own thin bar with S1 measuring the popup route first. Alternative kept in the backlog if the owner later wants the library's fidelity under its licence.
- 2026-10-08: bookmarks as a read-only mirror re-read at boot and on demand, over a one-time copy (stale within a day) and over MAWS-own editable bookmarks (diverges from Chrome, largest scope).
- 2026-10-08: folder menus native (`Menu.popup`) so the page stays live, over DOM popovers that freeze the page under the cover protocol; the profile popover stays DOM because its content is MAWS's own controls and the decided shape is a popover.
- 2026-10-08: extension actions inline right of the address field, folding to a puzzle button when the address field would drop under 160 px, over a permanent puzzle button or a third row.
- 2026-10-08: profiles.json version 2 carries every new field at once (bookmarks, account names, avatar) in M1, so the file's version moves once.
- 2026-10-08: `Bookmarks` read in place from the Chrome profile directory (capped, `O_NOFOLLOW`) rather than staged, since the same read serves the boot sync and nothing is modified.

## Outcomes & Retrospective

(Written at M4.)
