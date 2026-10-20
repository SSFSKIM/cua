# Sky behaviour: the specification cua's macOS engine and renderer are built against

For SSFSKIM/cua #117 (cua's own macOS native engine; child 4 of #114). This is the M0 deliverable named in `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (read at f81de17 and at the branch head, whose later changes are the intervention tap's content boundary and two Surprises entries). The spec is cited as "Design, <paragraph>" by the paragraph's lead words and "Decision Log n" for its n-th entry counted from the top (entry 9 is the revision from F).

It consolidates three readings in this directory into one rule set: `A-contract.md` (the JS side), `E-helper-catalogue.md` (tier 1: the binary's strings, symbols and type metadata) and `F-helper-logic.md` (tier 2: the code). The rules are for the engine (`native/engine/`) and the service's renderer, diff and policy (`src/services/engine/`). Together they replace `Codex Computer Use.app` (bundle 26.924.1001281 in runtime 26.928.40906-darwin-arm64) and `@oai/sky` 0.7.5's macOS target behind the unchanged facade. Nothing new was read from the binary. Where E abbreviates a vendor sentence, its full text was copied from E's own strings artifact at the line E cites.

## How to read it

- **Source tags.** Every rule carries its source in square brackets.
  - `[F §n]` was read in the helper's code. `[E §n]` is what the binary's strings, symbols and types state. `[A §n]` is the JS side, cua's harnesses and observed behaviour.
  - `[cua: Decision Log n]` is cua's own departure, recorded in that Decision Log entry. `[cua: Design, <paragraph>]` is a cua rule the Design states with no entry of its own. An entry added after this reading is cited by its date and subject (`[cua: Decision Log, 2026-10-19 screenshot-size ruling]`): later entries are inserted above the last one, so a number would shift.
  - `[undetermined: F §14.n]`: the vendor's rule is not known. The tag cites F §14's numbered item, or the section that leaves the rule open when §14 does not list it.
  - "inference" inside a tag means the source marks the point as inference.
- **Precedence.** Where A, E and F disagree, F (read from the code) wins over E (strings and types), which wins over A (the JS side). Each such rule says so in the words "**F over E**", "**F over A**" or "**E over A**", so they can be found by searching.
- **Departures.** Where cua departs, the rule gives both sides on the same line, "vendor: … / cua: …". A rule with no cua half is adopted as written.
- **Defects.** "**Vendor defect, not copied.**" marks vendor behaviour that is wrong for the model and that cua deliberately does not reproduce.
- **Quotes.** Vendor sentences are verbatim in code spans; `<app>`, `<n>` and the like are the substituted parts. No decompiled code is quoted beyond a few words; the decompiled sources stay local.
- **Goldens.** "Pinned by the goldens" means the exact whitespace or formatting is settled by the vendor text M0 records on the scenes (Design, Verification system, part 3), not by this document.
- **Open points.** §23 lists where the Design is silent, or inconsistent with this reading, and a decision is needed before M1a or M2a. §24 maps F §13's 27 divergences to the rules that resolve them.

## 1. The method surface

- `setup` answers `{target: "mac", methods: ["list_apps", "get_app_state", "click", "drag", "paste", "perform_secondary_action", "press_key", "scroll", "select_text", "set_value", "type_text"]}`. macOS has no `launch_app`, `list_windows`, `get_screenshot` or `drag_handle` [A §1.4].
- vendor: `start_audio_recording` and `stop_audio_recording` join the list when `SKY_ENABLE_AUDIO=1` / cua: never; audio is out of scope [A §1.4; cua: Decision Log 12].
- An `execute` naming a method that is not advertised fails with `Sky runtime method is not available: <method>` [A §1.2].
- Every method except `list_apps` is app-scoped and passes the policy (§20) before the engine sees it. `list_apps` is not policy-wrapped and sets the response meta's `app` to null [A §1.4, §2.6].
- Arguments arrive from the facade in snake_case [A §1.4; E §1.3]:

| method | arguments | defaults and checks |
|---|---|---|
| `list_apps` | none | none |
| `get_app_state` | `app`, `disableDiff?` | `disableDiff` is sent only when the caller passed it; an absent key means false [A §1.4; E §1.2, inference] |
| `click` | `app`, `element_index` or `x`/`y`, `mouse_button?`, `click_count?` | `click_count` defaults to 1. `mouse_button` accepts `left`/`right`/`middle`, `l`/`r`/`m` or `0`/`1`/`2`, sent as 0, 1, 2 |
| `drag` | `app`, `from_x`, `from_y`, `to_x`, `to_y` | finite coordinates |
| `paste` | `app`, `text`, `format` | `format` is `text` (the facade's default), `md` or `html` |
| `perform_secondary_action` | `app`, `element_index`, `action` | none |
| `press_key` | `app`, `key` | an empty key is rejected (§21) |
| `scroll` | `app`, `direction`, `element_index` or `x`/`y`, `pages?` | `pages` defaults to 1 and must be finite and greater than 0. It is a Double on the wire, so fractions are allowed. The facade refuses an object distance |
| `select_text` | `app`, `element_index`, `text`, `prefix?`, `suffix?`, `selection_type?` | `selection` is `text` (default), `cursorBefore` or `cursorAfter` |
| `set_value` | `app`, `element_index`, `value` | none |
| `type_text` | `app`, `text` | none |

- The JS never sends a click's `duration` or held `key`, nor a pressKey `duration`. The hold, held-key and holdKey paths are therefore dormant on cua's path [E §1.3].
- Coordinates are "in the app-window screenshot" [A §3.7], so in its pixels; on the mini's 2× display the screenshot is the window's pixel size, twice its points (§2, Screenshot) [cua: Decision Log, 2026-10-19 screenshot-size ruling].
  - vendor: coordinates are CGFloat on the wire and truncated to integers [E §1.3, inference]. They map to the screen as point × scaling factor + the visible rect's origin, and the factor's value is not visible [F §5.2; E §4.2].
  - cua: coordinates are in the screenshot's pixel space, as the vendor's are. A click divides them by the scale of the screenshot its observation returned (the image's pixels per window point), not by the scale of the display under the window when the click comes, to get the window point it lands on [cua: Design, Screenshot; Decision Log, 2026-10-19 screenshot-size ruling].
- To the facade, `get_app_state` returns `{app, screenshot: {url} | null, text}`, where `app` is the bound identity (§3) [A §1.4, §7]. Every input method returns `undefined` [A §1.4].
- vendor: every action's IPC answer is `{app, skyshot?}`; the skyshot is absent on the IPC path, and the JS discards the answer [E §1.2; F §8.6] / cua: input results carry only meta (`cua/inputRoute`, `cua/actionInterval`, `cua/receivedAt`, `cua/hidIdleMs`) [cua: Design, Result meta].
- vendor: when the helper returns `appSpecificInstructions`, the JS prepends `<app_specific_instructions>\n…\n</app_specific_instructions>\n` to the text once per app per service process, never for Numbers. The helper ships seven `AppInstructions/*.md` files and a compiled-in `## Browser Computer Use` note [A §3.1; E §8, §6.5] / cua: no per-app instruction text [cua: Decision Log 12].
- Response meta is reset at the start of every app-scoped call. It is then set to `codex/toolSurface: {kind: "computerUse", app: {appId: <bundle id>, kind: "appId"}}`, plus `codex/computerUseChrome: true` for `com.google.Chrome` [A §2.6]. cua adds its `cua/*` keys beside these [cua: Design, Result meta].
- vendor: the wire is `CodexComputerUseIPC-5`, with `ComputerUseIPC*Request` types, `{_0: …}` enum encodings and a `codexTurnMetadata` of which the helper decodes `model`, `session_id` and `turn_id` [A §2.2; E §1.1–1.3] / cua: the facade's vocabulary one layer down (`cua-engine-1`) with the same 4-byte little-endian framing, 8 MiB per frame, one request in flight per connection, and no turn metadata [cua: Decision Log 2; Design, Protocol].
- vendor order of checks for one request [A §2.6; F §8.9, §9.5, §5.1]:
  1. the JS policy (§20);
  2. on the helper, the deadline at frame receipt (§17);
  3. in the dispatcher, the stopped-by-user check, then the intervention gate (§18); the lock-screen check is also in the dispatcher, at a position not read;
  4. the handler.
- vendor: one controller per app instance, shared by every client of the machine-wide helper; whether lineages are per connection or per app is not settled [A §2.5; undetermined: F §14.4] / cua: everything per-app in this document (lineage, diff baseline, approvals) is per (connection, app) [cua: Design, Indexes and handles].

## 2. Observation and window choice

- **Context.** `get_app_state` observes in the full-UI context. F places it outside the informational context, and the event-stream context belongs to the recorder [F §2.3, §4.1; E §2.3]. Several rules below apply only in this context.
- **Primary window.** `AXFocusedWindow`, else `AXMainWindow`, else the last element of `AXWindows` [F §1.7].
- **No window.** The request fails `noWindowsAvailable` [F §1.7, inference; E §4.2; A §1.5]. cua's harnesses match `/noWindowsAvailable/` in the message [A §6.3]. The message's form is in §21.
- **Window id.** The primary window maps to its CGWindow id through `_AXUIElementGetWindow`; failure is `cgWindowNotFound` [F §1.7, §11].
- **Focused element.** `AXFocusedUIElement` is read, tolerating −25212 (no value) and −25205 (attribute unsupported) [F §1.7].
- **Context flags.** These choose the settle sampling (§17), the web-area wait (§4) and the click decisions (§10) [F §1.7]:
  - *web-shaped*: the bundle's `CFBundleURLTypes` include the scheme `http`, or `NSPrincipalClass` is `AtomApplication` (Electron) or `BrowserCrApplication` (Chromium);
  - *Chromium*: web-shaped, and the window's first `AXChildren` element lists `ChromeAXNodeId`;
  - *Catalyst*.
- **What is walked.** The primary window's `AXChildren` subtree, plus the menu bar's top-level items without submenus (inference). Sheets appear as the window's AX children. Nothing else is walked [F §1.8]. **F over A**: A §3.5 left the menu bar at rest open.
- **Terminated app.** The observation throws when the app's `NSRunningApplication` is terminated. The next call relaunches the app under a new controller and lineage ("getAXState() relaunches it") [F §3.4, inference; A §7].
- **Screenshot, vendor.** Every `get_app_state` captures one: no caller passes `skipScreenshot`, and only a menu-bar-item focus skips the image [F §4.8]. Other facts [E §4.1–4.2; F §11]:
  - two back ends exist, ScreenCaptureKit and SkyLight's `SLSHWCaptureWindowListInRect`, and which is the default is not visible;
  - related windows (sheets, popovers, menus, inference) can be added and cropped to the key window;
  - the encoding is JPEG or PNG, with the quality not visible;
  - a classifier behind `feature/skyshotClassifier` can return no screenshot; its default is not visible.
  
  The screenshot is returned as a `file://` URL. The size is the window's WindowServer bounds in points times the backing scale factor of the screen the window sits on (2.0 when no screen matches), each side rounded up, with no cap; a downsizing fit (long side at most 2048, then short side at most 768) sits behind the server-side flag `should_use_legacy_screenshot_sizing` of Statsig config `406601636`, unset (false) in both Macs' caches on 2026-10-19. The image covers the window's bounds, stored as the observation's `visibleRect`. Measured, all on the mini's 2× display and all fitting the rule: 1220 × 1720 for the TextEdit scene's 610 × 860-point window, 1840 × 872 for Finder's, 1440 × 1120 for Electron's, and the 2026-10-14 baseline's 1172 × 976 JPEG of about 50 KB [A §3.7], which was taken on the mini, not the MacBook [cua: Decision Log, U1 resolved, 2026-10-19].
- **Screenshot, cua.** A screenshot is captured only when the request asks (`includeScreenshot`). It uses `SCScreenshotManager` with a desktop-independent-window filter, is captured at the display's pixel size (the window's frame times the pixels per point of the display under it), as the vendor's was on the mini, and is written as a JPEG at quality 0.8 with mode 0600 into `outputDirectory`, returned as a `file:` URL [cua: Design, Screenshot; Decision Log, 2026-10-19 screenshot-size ruling]. The tree is walked on every observation either way, so the diff baseline still advances (§9).

## 3. App resolution, launch and listing

- **The app string.** A bundle id, a display name or a path [A §7].
  - vendor: the matching order is not in A, E or F [undetermined: F §14, not listed].
  - cua: running regular apps match first. Then LaunchServices: by bundle id, or for a name the `.app` of that name or localized name in `/Applications`, `/System/Applications`, `~/Applications` or `/System/Library/CoreServices` [cua: Design, App resolution and launch].
- **Ambiguity.**
  - vendor: `Ambiguous app identifier '<x>'. Multiple apps share this bundle identifier: <list>. Use an app name or full app path instead.`, code `ambiguousApp` −10018. Its behaviour for an ambiguous name or path is not read [E §6.1; A §1.5].
  - cua: `ambiguousApp` for any bundle id, name or path that matches more than one candidate, never a silent pick [cua: Decision Log 4]. The vendor's wording names bundle identifiers (§23).
- **No match.** `invalidApp` −10010 [A §1.5; cua: Design, App resolution and launch]. The vendor's sentence for it is not recovered [undetermined: F §14, not listed].
- **Bound identity.** The policy's `appPath` replaces `app` before the call, and `getApp` binds to it, so every later call passes a path [A §2.6, §7]. cua does the same [cua: Design, App resolution and launch].
- **Launch.**
  - vendor: an app that is not running is launched with `activates = NO` [F §5.4]. `awaitingLaunchCompletion` re-reads `AXWindows` every 50 ms until it reads (or gives −25212 or −25205), with no attempt count or timeout of its own. The bound that was observed lives elsewhere: a cold TextEdit's first `getApp` failed after about 5.5 s with `Computer Use server error -10005: timeoutReached`, and the retry bound [F §8.8; A §7; undetermined: F §14.5].
  - cua: `NSWorkspace.openApplication` with `activates = false`, then a wait of up to 5 s for a window, then `timeoutReached` [cua: Design, App resolution and launch].
- **Dock attention.** vendor: `_SetApplicationDesiresAttention(psn, false)` runs twice at controller set-up [F §5.4] / cua: not in the Design (§23).
- **list_apps.**
  - vendor: the running apps plus the apps used in the last 14 days, from Spotlight (`kMDItemLastUsedDate_Ranking`, `kMDItemUseCount`) [E §7]. Server rows are `{displayName, bundleIdentifier, appPath?, lastUsedDate?, useCount?, isRunning, isFrontmost}`, with the four non-optional fields always present [E §1.2]. The JS maps each to `{id: bundleIdentifier ?? displayName ?? "unknown", displayName, isRunning, lastUsedDate?, useCount?}` [A §1.4].
  - cua: every running regular app, plus the apps this engine resolved before, from its `usage.json` (bundle id, last used, use count). `lastUsedDate` and `useCount` therefore carry cua's meaning [cua: Design, App resolution and launch].
- **Permissions.**
  - vendor: `permissionsNotGranted` −10009 and `permissionsPending` −10014 [A §1.5].
  - cua: the first observation prompts through `AXIsProcessTrustedWithOptions` and fails `permissionsPending`, with a sentence naming "cua Engine" in System Settings → Privacy & Security → Accessibility. The first screenshot does the same through `CGRequestScreenCaptureAccess`, then follows the Design's relaunch rule [cua: Design, Permissions].

## 4. The walk, attributes, enablement and caps

- **Order.** Depth-first preorder in AX child order [F §1.5].
- **The 20 attributes, in order.** `role, subrole, roleDescription, title, description, value, valueDescription, placeholderValue, numberOfCharacters, help, identifier, selected, focused, enabled, disclosing, url, traits, servesAsTitleForUIElements, rowIndexRange, columnIndexRange` [F §1.2].
  - vendor: `domClassList` is added only for `com.kishanbagaria.jack` [F §1.2] / cua: not in the Design (§23).
  - The settle's busy walk fetches its own three attributes (§17) [F §8.4].
- **Not prefetched.**
  - vendor: position, size, frame, actions and pid. Actions come from `AXUIElementCopyActionNames` per rendered element, and the walk never calls `AXUIElementGetPid` [F §1.2, §1.8].
  - cua: also prefetches position and size (the `Skyshot` frame), reads actions per element, and reads the owning pid only for elements an action targets [cua: Design, Observation].
- **Batched fetch, vendor.**
  - The private `AXUIElementCopyHierarchy` runs once per subtree transaction [F §1.1]. Its options are `SkipInspectionForAttributes` = the 20, `ArrayAttributes` = `[AXChildren]`, `TruncateStrings` = `true` (a Bool: the SPI chooses the length) and `MaxArrayCount` = 100.
  - A child whose `IncompleteResult` is set is fetched again by the same function. For the helper's own pid, the call hops to the main queue [F §1.1].
  - The prefetch is always on for `get_app_state`: it defaults to true, and the Statsig keys `ax_prefetch_enabled` and `ax_prefetch_disabled_bundle_ids` bind it only in the event-stream recorder [F §1.4]. **F over E**: E §2.3 tied those keys to the observation's prefetch.
- **Fallback, vendor.** For an element the prefetch missed, `AXUIElementCopyAttributeNames` is intersected with the 20 and fetched with `AXUIElementCopyMultipleAttributeValues(…, options 0, …)` [F §1.3].
- **Batched fetch, cua.** Either the private hierarchy call (by `dlsym` with its seven keys, feature-detected) or the public per-element `AXUIElementCopyMultipleAttributeValues`, whichever M0's pricing chooses; the public route is always the fallback [cua: Decision Log 9].
- **Timeouts.**
  - vendor: none. There is no `AXUIElementSetMessagingTimeout` (it is neither imported nor among the recovered soft-link names) and no traversal deadline [F §1.6, §11]. **F over E**: E §2.3 left this open.
  - cua: a 1 s messaging timeout on every element it touches, and a 10 s traversal deadline per observation, after which the tree is truncated with a marker [cua: Decision Log 9].
- **Width.** Up to 100 children: all of them. More than 100: the visible subset (`AXVisibleChildren` or the visible rows, inference), else position filtering. More than 499 with no visible subset: the children are omitted [F §1.5]. The partial set is recorded as `{count, availableRanges}` and rendered as `(showing … of N items)` (§6) [F §1.5; E §2.3]. cua does the same [cua: Design, Observation].
- **Depth.**
  - vendor: the walk continues while the path is shorter than 201 levels, so deeper subtrees are dropped with a log line and no marker. `Max depth exceeded` is debug text only [F §1.5]. **F over E**: E §5.2 and §7 read `Max depth exceeded` as a rendering rule, and A §3.5 cited it as a limit.
  - cua: 200 levels, with a marker [cua: Design, Observation].
- **Node count.** vendor: no node budget [F §1.5] / cua: 4,000 nodes; the remaining subtrees are omitted, counted in `truncated` and marked [cua: Decision Log 9].
- **Strings.**
  - vendor: the hierarchy call truncates strings at its own length, and a partial value carries `{count, availableRange}` [F §1.1; E §2.3].
  - cua: 10,000 characters per value, cut with a `[truncated]` suffix [cua: Decision Log 9].
- **Whole observation.** vendor: bounded only by the 8 MiB frame [A §3.5; F §10.2] / cua: 6 MiB per serialized `Skyshot`, enforced during the walk, so a large window truncates rather than fails [cua: Decision Log 4].
- **Markdown values.**
  - vendor: `retrieveAttributedTextFromTextAreas` (§5) applies to every `AXTextArea` whose `AXTextualContext` is not `AXTextualContextSourceCode`. It replaces the value with the Markdown rendering of `AXAttributedStringForRange` over the value's length (or its truncation range), with no size cap. Web areas are never converted for `get_app_state` [F §2.3].
  - cua: the same predicate, fetched only when the plain value is at most 2,000 characters [cua: Design, Observation]. The Design's "text elements" is narrowed by F to text areas outside a source-code context.
- **Enablement.** One assertion per (app, kind), reference-counted; whether releasing it restores the attribute is not read [F §1.9; E §2.4]. The rules [F §1.9]:
  - `AXManualAccessibility` is set to true, if not already, when the application element lists it among its attribute names (Electron, Chromium). The app is then marked for the web-area wait.
  - Otherwise `AXEnhancedUserInterface` is set, if not already true, when the bundle id starts with `com.apple.iWork`, equals `com.spotify.client`, or the app lists the attribute (any app, in the full-UI context).
  - An app never gets both.
  - Spotify only: when the app is not active, fake activation (§12) runs first, polled every 0.05 s for up to 1 s; the enforcer is deactivated afterwards.
  - cua: the same one-attribute rule, once per process [cua: Decision Log 9]. The Spotify step is not in the Design (§23).
- **VoiceOver preference.**
  - vendor: set only for `com.microsoft.Excel`, `com.apple.Music`, the prefix `com.openai.atlas`, `company.thebrowser.Browser` and `company.thebrowser.dia`, in the full-UI context. The value is written through `NSUserDefaults` (suite and key inferred as `com.apple.VoiceOver` / `voiceOverOnOffKey`), then `com.apple.universalaccess.VoiceOverSettingsDidChange` is posted. For Arc, Dia and Atlas a later task follows (inference: a restore). Chrome, Chromium, Electron and AppKit apps never touch it [F §1.9; undetermined: F §14.3 for the literals]. **F over E**: E §2.4 could not see which apps.
  - cua: never touched, since the preference is global. Those five apps may expose less until the owner decides at M5 [cua: Decision Log 9].
- **Web-area wait.** On the first observation of an app after enabling, or of a Chromium window: sleep 100 ms, then poll every 50 ms for up to 1 s for an `AXWebArea` under the window, then record the app as initialized [F §1.9]. F's wording does not say whether a Chromium window pays this on every observation or only until its app is recorded. The Design reads it as "or of any Chromium window" [cua: Design, Observation]; M0's Chrome timings settle it (§23).

## 5. Tree transformations (the nine and the four)

- **Where they run.** vendor: in the helper, before numbering, so IDs number only the nodes that survive (§8) [F §2.1, §3.1] / cua: the Design puts them in the service's renderer and puts numbering in the engine. That is inconsistent with numbering over the surviving nodes (§23, item 1).
- **Pipeline.** The Mac pipeline runs in this order [F §2.1; the order of the last three is inference]:
  1. `filterActions`;
  2. the nine shared cases, in declaration order (0 to 8 below);
  3. `removeElementsUnderCalendarEvents`, `retrieveAttributedTextFromTextAreas`, `retrieveAttributedTextFromWebAreas`.
  
  Each node runs the whole pipeline first, then its resulting subtree is transformed: top-down, preorder (inference) [F §2.1]. A case answers transformed, replaced, removed or unchanged [E §5.3].
- **Helper predicates** [F §2.1]:
  - *descriptive (node)*: `description`, `value`, `title` or `placeholderValue` is non-empty, or the role is `AXImage`.
  - *descriptive (subtree)*: the same, over the node and all its descendants.
  - *focusable* and *selectable*: the element's derived flags; F reads their use, not their derivation (§23, item 2).
  - *can be user-interactive*: `AXStaticText` when focusable or selectable; `AXTextArea` and `AXGroup` when focusable; every other role always.
  - *interesting actions*: any action other than `AXScrollToVisible` and `AXShowMenu`.
- **(0) associateTitleUIElements.** A child that serves as title (`AXServesAsTitleForUIElements`) for exactly one element gives its text (value, else title, else description) to that sibling's `title`, and is removed [F §2.2]. The multi-target branch is not read [undetermined: F §14.3].
- **(1) flattenIntoSelectableAncestor.**
  - Applies when the node is selectable and not focused, its role is not `AXTable`, its subrole is not `AXTableRow`, and no descendant is settable or selectable.
  - Then its `title`, `description` and `value` become the flattened titles, descriptions and string values of the subtree. Its focusable flag becomes "any descendant focusable". Its children become only the descendants whose `AXValue` is a Bool (toggles) [F §2.2].
  - The join used when flattening is not read [undetermined: F §14.3]. Flattened roles: `AXRadioButton` gives `radio button` / `radio buttons`, `AXRow` gives `outline row` / `rows` [F §2.2; E §5.2].
- **(2) pruneNonDescriptiveSubtrees.** A node is removed unless any of these holds: it is focusable or selectable; it has an interesting action; its subtree has descriptive attributes; or a descendant is focusable, selectable or has an interesting action [F §2.2]. The Mac pre-check that also removes childless non-descriptive leaves runs only outside the full-UI context, so not for `get_app_state` [F §2.2].
- **(3) pruneEmptyDisabledElements.** A node that is disabled, not focused, childless and not descriptive is removed [F §2.2].
- **(4) mergeSingleItemGroups.** Applies to an `AXGroup` that is not selectable, not focused and not descriptive. With one child that carries no partial-array marker, the group is replaced by that child; with no children, the group is removed [F §2.2].
- **(5) flattenRedundantHierarchy.** Applies to a node that is not selectable, not focused and not descriptive. A child with the same role, no partial-array marker and the same rendered line is replaced by its own children [F §2.2].
- **(6) flattenRepetitiveStaticText.** Applies to a node that is not focusable, not selectable and has no user-interactive descendant. A child is dissolved into its own children when its trimmed description is contained in the node's description, or its trimmed value in the node's string value; this repeats recursively [F §2.2].
- **(7) flattenLinksIntoMarkdownText.** An `AXLink` with a URL has its subtree text turned into a Markdown link (§7). It becomes role `AXStaticText` with the English role description `link`, its `url` is cleared and its children are removed [F §2.2].
- **(8) mergeTextOnlySiblings.** Applies under a node that is neither selectable nor focusable. A run of consecutive text-only children (static text with a string value, or a leaf link rendered as Markdown) is merged into the run's first element [F §2.2]. The join rule is not read [undetermined: F §14.3].
- **filterActions** (full-UI context only). It rewrites the action descriptions through a predicate that takes the Catalyst flag; the predicate is not read [F §2.3; undetermined: F §14.3]. The static list `AXPress AXPick AXIncrement AXDecrement AXConfirm AXCancel AXShowDefaultUI AXRaise AXShowMenu AXDelete SAIExpand SAICollapse` is its likely allowlist and order [E §2.1, inference]. *(Read 2026-10-19 in M1a.2b: the predicate is `FUN_100782c24`, a per-action drop rule, not an allowlist; the spec's Decision Log, M1a.2b item 5, gives its cases.)*
- **removeElementsUnderCalendarEvents.** In `com.apple.iCal`, an `AXStaticText` with role description `Event` and one static-text child has its children cleared [F §2.3].
- **retrieveAttributedTextFromTextAreas.** As in §4, Markdown values [F §2.3].
- **retrieveAttributedTextFromWebAreas.** Runs only in the informational context, so never for `get_app_state` [F §2.3].
- cua implements all thirteen in this order [cua: Design, Renderer]. The unread parts are pinned by the goldens.

## 6. The element line, header and trailer

- **Line.** A line is `"\t" × depth + "<id> " + text`, then `" " + detailText` when there is one. Depth is the path length − 1, with the window at depth 0 [F §2.4, §4.5].
- **Text.** `text` is the non-empty pieces of role word, flags and details, joined by one space [F §2.4].
- **IDs.** IDs are always printed for `get_app_state`; the option that drops them is used only in the informational context [F §4.1].
- **Role word.** The localized `AXRoleDescription`, with overrides by presentation kind [F §2.4; E §5.2]:
  - kind `row`: `row`;
  - kind `generic` with an empty description: `element`;
  - kind `other` with role `AXGroup`: `container`;
  - kinds `menuBarItem`, `menuItem` and `radioGroup`: nothing;
  - no role description at all: `menu` (kind menu), `menu bar` (kind menuBar), else `unknown`.
  
  The kinds are `button checkBox menu menuBar menuBarItem menuButton menuItem radioGroup row generic other`; the role-to-kind table is not listed [F §2.4; E §5.2].
- **Localization.** Role descriptions are localized (the Korean mini prints `텍스트 엔트리 영역`), while the override words, flag words and part labels are not [A §3.2; F §2.4]. This confirms A §3.2's inference and adds the overrides.
- **Flags.** `(` + flags joined by `, ` + `)`, omitted when there are none [F §2.4]. In order:
  1. `selectable`: selectable and not selected;
  2. `selected`;
  3. `disabled`: not enabled, never for `AXGroup` or `AXStaticText`;
  4. `expanded` or `collapsed`: disclosable elements;
  5. `settable`, or `settable, <type>` when the value is settable, where the type is `boolean`, `integer` or `float`; a `string` value prints plain `settable`;
  6. `sent by me`: `domClassList` contains `is-sender`. The Design's flag list omits it, and it needs `domClassList` (§4).
  
  **F over A**: A §3.2 inferred a Linux-like set with `focused` and `checked`; neither flag exists.
- **Parts, in order.** Title (bare); `Description`; `Rows: a-b` and `Columns: a-b` (from `AXRowIndexRange` / `AXColumnIndexRange`, only when lower < upper); `URL` (shortened, §7); `Help`; `Value`; `Details` (= `AXValueDescription`); `Placeholder`; `ID` (`AXIdentifier`); `Secondary Actions` [F §2.4].
- **ID part.** The `ID` part is dropped entirely when the identifier starts with `_` or `NS` [F §2.4]. **F over E**: E §5.2 read `NS` as a prefix stripped from the value.
- **Secondary Actions.** The element's presentation actions after `filterActions`, minus those of kinds `press`, `showMenu` and `scrollToVisible`, and minus the descriptions `Add comment`, `Remove unused rows`, `Remove unused columns` and `Remove unused rows and columns`. Their descriptions are joined by `, ` [F §2.4]. The descriptions are the system's (`AXUIElementCopyActionDescription`), with English fallbacks such as `Decrement`, `Show Default UI` and `Scroll Left` [E §5.2, inference].
- **Dedupe.** A part whose value equals an earlier part's value is skipped [F §2.4].
- **Long parts last.** Long parts (about 100 characters or more, or containing `\n`) move after the short ones, keeping their order [F §2.4; the threshold is medium confidence, F §12].
- **Lone part.** If exactly one part remains and it is not `Secondary Actions`, only its value prints. Otherwise each part prints as `Label: value` (the title bare), joined by `, ` [F §2.4].
- **Partial children.** `detailText` is `(showing <lo-hi>, <lo-hi> of <count> items)` from the available ranges, present only when ranges exist [F §2.4]. Whether `hi` is inclusive is inference; the goldens pin it. **F over E**: E §5.2 read `(showing n of m items)`.
- **Values.** The vendor stringifies a value by its type (`float | integer | boolean | string | date | unknown`) [E §2.3]. The exact formatting is not read and is pinned by the goldens (§23): numbers, booleans, dates, and whether newlines are escaped. Linux escapes `\r`, `\n` and `\t` [A §4.3]; the Mac's long-part rule implies raw newlines.
- **Header.** `Window: "<title>", App: <app name>.`, a newline, the lines joined by `\n`, then a final `\n`. The title and app name default to `Unknown` [F §2.6; E §5.1].
- **No `App=` line.** Neither producer of the IPC text emits one; the literal belongs to the legacy MCP module [F §2.6, inferred from the two producers, confirmed by a recorded capture]. **F over E and A**: A §3.2's test double begins `App=com.apple.TextEdit`, and E §5.1 left the question open. The double is corrected in M1a [cua: Design, Renderer].
- cua's harnesses read the header with `^Window: "([^"]*)"` [A §3.2]. Which name `App:` prints (localized or bundle name) is not read (§23).
- **Trailer precedence.** Selected text, else selected elements, else the focused element; the focused line is omitted whenever there is a selection [F §2.6; E §5.1].
  - Selected text is a blank line, then `Selected text: ` with the text fenced in three backticks, then the note. F reads the fences on their own lines; E's literal attaches the opening fence to the label. The consistent reading is the block below; the goldens pin the whitespace [F §2.6; E §5.1].
  - Selected elements are `\nSelected:\n`, their lines, then the note [F §2.6].
  - The focused element is `\nThe focused UI element is ` followed by its rendered line, ID included [F §2.6; E §5.1].
  - The note, verbatim: `Note: Pay special attention to the content selected by the user. If the user asks a question or refers to the content they are looking at on-screen, they might be referring to the selected content (but they might be referring to something else that's visible, too).` The binary has two variants that print identically in `strings` [E §5.1].
  - Where the selected text and selected elements are read from is not read in F (§23) [undetermined: F §2.6].
  - **Focus-only node.** When the focused element is not in the main tree, it is rendered from a separate focus tree that is never diffed, and it takes a fresh ID every revision [F §3.3, inference].

~~~
<tree lines>

Selected text: ```
<the selected text>
```
Note: Pay special attention to the content selected by the user. …
~~~

- **Per-app note.**
  - vendor: for `com.spotify.client`, a blank line and then `Note: In order to be usable, Spotify app links must be rewritten as regular links (e.g. use open.spotify.com instead of xpui.app.spotify.com). Only use Spotify links that are written verbatim in the UI above. Note that IDs are only valid with their associated type (e.g. you cannot change an "album" URL to a "track" URL).` is appended [F §2.6; E §5.4].
  - cua: no per-app text [cua: Decision Log 12].
- **Google Docs.** The Google Docs host pattern only marks a screenshot as needed; it changes no text [F §2.6, §4.8]. **F over E**: E §5.4 read it as a text special case.

## 7. URL shortening

- **Links.** Links render as Markdown, `[text](url)`, with `\[` and `\]` escapes [F §2.5; E §5.4].
- **Per URL.** URLs with the schemes `webdoc:` and `data:`, one more scheme that is not read, and image URLs are not rendered. `http:` / `https:`, a leading `//` and a host's `www.` are removed [F §2.5; undetermined: F §14.3 for the third scheme].
- **Individual limit.** When a limit is set, a longer URL keeps its first `limit − 1` characters plus `…` [F §2.5].
- **Tree budget.** The defaults set no limits; compaction supplies a budget of 4,000 URL characters per tree. URLs are rendered first; then, while the tree's URLs exceed the budget, fragments are dropped, then queries, then the individual limit is set to 120, 110, … down to 20 [F §2.5].
- **F over E**: E §5.4 saw no limit values. The 4,000 is this URL budget, not a node budget [F §13.6].
- cua does the same [cua: Design, Renderer].

## 8. Indexes, lineages and re-resolution

- **Numbering a fresh lineage.** 0-based, contiguous, depth-first preorder over every rendered node, the order the text prints. Nodes the transformations removed get no ID [F §3.1]. **F over A**: A §3.3 inferred numbering over a fuller tree from the test double's 0, 1, 74, 76.
  - cua: numbers as the vendor does [cua: Design, Indexes and handles]; where the numbering runs relative to the transformations is §23, item 1.
- **Lineage id.** vendor: a lowercased UUID [F §3.1] / cua: an opaque string carried on every `Skyshot` [cua: Design, Indexes and handles].
- **A new lineage starts** on `disableDiff: true` (renumbered from 0, full tree), on the first observation, or when diffing is off. The vendor also starts one for a new controller, such as a relaunched app (inference) [F §3.4]. The facade's `getApp` always passes `disableDiff: true` [A §3.4]. cua: `disableDiff` starts a new lineage renumbered from 0, as do a new connection and an engine restart [cua: Design, Indexes and handles].
- **Window switch.** vendor: there is no window identity check. A key-window switch appends to the old lineage, and the diff then overflows into the full tree (inference) [F §3.4]. cua gets the same outcome from the matching rule below.
- **Keeping an index.** Each observation is matched against the immediately previous revision only, sibling list against sibling list under matched parents [F §3.2]:
  1. walk the common prefix while the handles are `CFEqual`;
  2. look the remaining old nodes up by handle; a new node that is absent is `insert`;
  3. a new node that is present and in the "stable" set is kept (`none`, or `update` when its line text differs); one outside the stable set is `insert`, and its old entry is dropped;
  4. leftover old nodes are `remove`;
  5. matched pairs queue their children.
  
  The stable-set rule is not read; longest-increasing-subsequence is the inference [undetermined: F §14.4].
- **Consequence.** An element keeps its index while its handle stays `CFEqual` under a matched parent. It loses it when it moves to another parent, is reordered out of the stable set, has an ancestor replaced, or is missing from even one revision [F §3.2]. cua does the same [cua: Decision Log 9].
- **New nodes.** A new node keeps an inherited ID; else takes the ID already given to the same handle in this revision; else takes the next free ID [F §3.2].
- **Next free ID.**
  - vendor: `max(surviving IDs) + 1`, `+ 2`, … (a missing ID counts as 0, so in an all-new appended tree the first new ID is 1). IDs above the surviving maximum are therefore reused: with IDs 0–20, node 20 removed and one node added, the new node is 20. Nothing on the action path reads the lineage, so a stale reused ID resolves silently to the new element [F §3.3]. **Vendor defect, not copied.**
  - cua: a retired index is never reused within its lineage; a new element takes the next index never issued in it [cua: Decision Log 9].
- **Retired IDs.** An ID resolves only against the current revision; a retired one gives `<n> is an invalid element ID` [F §3.3].
- **Lineage check.** vendor: none on actions [F §3.3] / cua: every action names the lineage its index came from. The service keeps the last observation's lineage per app and refuses an index from another with `The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.` [cua: Decision Log 9].
- **No observation yet.** vendor: an element action with no stored tree throws; `AX tree unexpectedly missing.` is the likely sentence [F §5.1; E §6.2, inference] / cua: the lineage refusal above, since there is no lineage (Design reading) [cua: Design, Indexes and handles].
- **Resolving an index** [F §3.5]:
  1. An ID not in the current revision gives `<n> is an invalid element ID`.
  2. No invalidation monitor gives `The skyshot is unexpectedly missing an invalidation monitor. This state shouldn't happen, likely programmer error.`
  3. If the monitor (`layoutChanged` and `uiElementDestroyed`, registered on the application element) saw no layout change and the element is not among the destroyed, there is no re-fetch. `AXRole` is read: only `kAXErrorInvalidUIElement` (−25202) gives the "no longer valid" sentence, and any other result passes with the cached handle.
  4. Otherwise, re-fetch.
  
  cua does the same, with invalidation from the notifications since the observation [cua: Design, Indexes and handles].
- **Re-fetch** [F §3.6]:
  1. Re-read the element live; if it still matches its cached attributes, use it.
  2. Otherwise count the cached element's matches in the stored tree. Anything but exactly one gives the "couldn't be started" sentence.
  3. Re-run the extraction and count the matches in the new tree: none gives "no longer valid", one gives that element, more than one gives the "couldn't be finished" sentence.
- **Match predicate.** Exact equality, with nil equal to nil, over role (`CFEqual`), subrole, role description, title, value, value description, description, placeholder, help, identifier and URL. There is no path, position, frame or pid. The value is skipped only on the re-check after `setValue` [F §3.6]. cua stores the same eleven attributes per index, with the owning pid [cua: Design, Indexes and handles].
- **Re-fetch and the baseline.**
  - vendor: the re-fetch writes its new tree into the stored observation, so the next diff is against a revision the model never saw [F §3.6, inference]. Not copied.
  - cua: the diff baseline is the service's last rendered tree, which a re-fetch never touches (Design reading) [cua: Design, Diff].
- **Sentences.** Verbatim, kept by cua [F §3.7; E §6.2; cua: Design, The contract kept]. The two "no longer valid" cases share one sentence [F §3.7]. In trigger order:
  1. `<n> is an invalid element ID`
  2. `The skyshot is unexpectedly missing an invalidation monitor. This state shouldn't happen, likely programmer error.`
  3. `The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.`
  4. `The element was invalidated, and an attempt was made to refetch it, but the refetch couldn't be started because multiple elements were found that match the criteria. Try to get the on-screen content again and see if that resolves the issue.`
  5. `The element was invalidated, and an attempt was made to refetch it, but the refetch couldn't be finished because multiple elements were found that match the criteria. Try to get the on-screen content again and see if that resolves the issue.`

## 9. Diffing and its budget

- **Mode.** The controller always asks for a diff against the previous revision. The cumulative form, `The following is a cumulative diff from the initial accessibility tree`, is passed by no caller [F §4.1]. **F over E and A**: E §5.5 and A §3.4 listed the cumulative header as live.
- **Outcome.** No previous revision gives the full tree. A diff over budget gives the full tree. No change lines give the no-change sentence. Otherwise, the diff [F §4.1].
- **Diff text.** `The following is a diff from the previous accessibility tree for Window: "<title>" `, then the legend, then `\n`, then the lines joined by `\n` [F §4.2]. The `Window: "…", App: ….` header is not printed; the trailer is (§6).
- **Legend.** Chosen by `feature/axTreeDiffingRemovedElementIDRanges` (default true; an `NSUserDefaults` value overrides it), not by the length of the removed list [F §4.2, §4.7]. **F over E**: E §5.5 inferred a length rule.
  - true: `with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.`
  - false: `with ~, +, and - representing changed, added, and removed elements, respectively.`
  
  cua always uses the true legend [cua: Design, Diff].
- **No change.** `There has been no change in the accessibility tree for Window: "<title>".`, for example `…for Window: "Untitled".` [F §4.2]. The first-call document's "do not repeat a no-change getAXState" depends on it [A §3.4].
- **Diffing on.** `feature/axTreeDiffing` defaults to false and is read by no code. The controller's own switch is on for cua's client, as the observed diffs show; its inputs are not read [F §4.7; A §3.4; undetermined: F §14.4]. **F over E**: E §5.5 read diffing as gated by that flag.
- **Computation.** Both revisions' rendered trees, keyed on element ID, go through the same sibling algorithm. A node is `update` exactly when its line text differs; `detailText` is never compared [F §4.4, §3.2].
- **Lines.** [F §4.5]
  - Unchanged: nothing. Update: `~` + line. Insert: `+` + line for the node and for each descendant. Remove: `-` + line for each node of the removed subtree (only under the non-summary legend).
  - The marker precedes the tabs (`~\t\t12 button Save`). There are no context lines.
  - Changes are sorted depth-first by path (the new path, or the old one for a removal). Ties go `none < remove < insert < update`.
- **Removed IDs.** Under the summary legend, one line `Removed element IDs: <ranges>` comes first (inference on its position) [F §4.6]. The IDs are de-duplicated and sorted; consecutive runs print as `a-b` (two consecutive IDs give `3-4`) and single IDs alone, joined by `, ` (`3-7, 12`). They cover whole removed subtrees (inference).
- **Budget.** The diff may have at most as many lines as the current full tree has nodes (ratio 1.0) [F §4.3]. Each change's lines are subtracted in order, and a change that does not fit makes the whole answer the full tree. Under the summary legend, removals are not counted, but with removals and less than one line left, the answer is the full tree.
- **Reused IDs.** vendor: a reused ID at the same position shows as `~` (inference) [F §4.4] / cua: never reuses, so a replaced element appears as an insertion plus its ID in the removed ranges [cua: Decision Log 9].
- **Baseline.** Every observation advances the baseline, including those whose text the facade discards: `getScreenshot` calls `get_app_state({app})` in default mode. There is no screenshot-only mode [F §4.8; A §3.4]. On cua's path, actions return no observation (§17), so the vendor's baseline moves on `get_app_state` and on re-fetches. cua: every observation advances it, re-fetches do not (§8) [cua: Design, Diff].
- The first-call document tells the model to request a full tree after a screenshot-only observation [A §3.4].
- **Where it runs.** cua: in the service, per (connection, app), from the previous and current `Skyshot` [cua: Design, Diff].

## 10. Input routes and the click decision

- **Principle.**
  - vendor: input never activates the target app. Real activation (`activateWithOptions: 0`) is used only to give the user's original frontmost app its status back. `CPSSetFrontProcessWithOptions` is reached only from the picture-in-picture stream [F §5.4].
  - cua: the same; the engine never activates an app on its own, except route 4, which is reported [cua: Design, Input].
- **Routes, as cua numbers them** [cua: Design, Input]. Every input result carries `cua/inputRoute`.
  - 1: an accessibility action.
  - 2: events posted to the owning pid, with ⌘ added when the app is inactive.
  - 3: fake activation, then events.
  - 4: foreground assist. This is cua only; the vendor has no such path [F §5.4].
  - `"paste"`: typeText's fallback.
- **Menu-bar item.** A plain click (left, one click, no hold, no held key, no flags) on an `AXMenuBarItem` runs fake activation for the window (§12) and records the open menu [F §5.1].
- **AX action choice.** `AXPick` if advertised, else `AXPress`, else none [F §5.1].
- **When to synthesize** instead [F §5.1]:
  - a click count above 1, no AX action, a button other than left, a hold, a held key, flags, or `alwaysSimulateClick`. That is the feature flag `computerUseAlwaysSimulateClick`, whose default is not read [undetermined: F §5.1];
  - inside a web view, `FUN_1007a1b9c` decides: it hit-tests the clickable point and walks the hit element's ancestor chain (up to 300 levels, CFEqual per ancestor) looking for the clicked element — true, so synthesize, exactly when the point lands on a strict descendant of the target; no AXWebArea role is read, so the "web view" case is really the nested-content case, native or web [F §5.1, decompiled 2026-10-18].
- **Performing the action.** Otherwise the AX action is performed. In a Catalyst app, when the element has `clickingMayCauseSelection` or role `AXMenuButton` and the app does not believe it has focus, fake activation runs first [F §5.1]. What `clickingMayCauseSelection` is, F does not define (§23).
- **Right clicks.** `AXShowMenu` is never used; right clicks are synthesized [F §5.1].
- **No inter-click delay.** `humanClickInterval` (0.1 s) is dropped by the click thunk and never applies [F §5.1].
- **Synthesized element click.** The clickable point is computed by scrolling into view and taking the midpoint of the visible frame. When the element is not visible, the error is `cannotClickOffscreenElement`, which has no sentence of its own [F §5.1; E §6.2].
- **First interaction.** The first element interaction creates the app's focus enforcer (§12) [F §5.1].
- **Coordinate click.** The screen point is point × scaling factor + the visible rect's origin, and the target is the window under it, taken from the ordered windows [F §5.2]. A menu element there gets `AXPress` (a hold, a multi-click or a held key is an error). Otherwise the click is synthesized [F §5.2]. The likely sentences are `Menu mouse action not supported` and `Failed to click menu item` [E §6.2, inference].
- **The ⌘ flag (route 2)** [F §5.4]:
  - With no enforcer: no extra flag when the app is active, else ⌘ (0x100000).
  - With an enforcer: no extra flag when the app believes it has focus.
  - Otherwise, these cases get fake activation (route 3) and no extra flag: a held key or flags, an element inside a web view, `clickingMayCauseSelection`, or a Catalyst app with that or `AXMenuButton`.
  - Every other background click gets ⌘, and a failed fake activation also falls back to ⌘.
  - A ⌘-flagged click is delivered to an inactive window without activating it (the AppKit convention).
  
  cua uses the same rule [cua: Decision Log 9]; which route carries each app family is M0's measurement [cua: Design, Input].
- **Target pid.**
  - vendor: the target's nearest ancestor whose process type is in a static set (not decoded; the types are regular app, view service, non-event-handling process), when its pid (`_AXUIElementGetActualPid`) differs from the app's, gives the event target. Keyboard events go to the out-of-process owner of the app's focused element, else to the app [F §5.7; E §3.3].
  - cua: `AXUIElementGetPid` of the target element, read at observation for elements an action targets [cua: Design, Observation]. Whether that equals the private "actual" pid for view services is §23.
- **The pointer.** The real pointer is never moved [F §5.3].

## 11. The mouse-event recipe

- **Creation.** Each event is made by AppKit and taken as its `CGEvent`: `NSEvent mouseEventWithType:` with modifier flags 0, timestamp 0, the window number, context nil, an event number, the click count and pressure 1.0. No event source [F §5.3].
- **Fields set** [F §5.3, §11]:
  - flags := the flags OR the extra flag (§10);
  - location := the global screen point;
  - field 3 := the button;
  - field 7 (`mouseEventSubtype`) := 3;
  - fields 91 and 92 := the window id, when known;
  - `CGEventSetWindowLocation` (private, by `dlsym`) := the window-local point: the window's origin subtracted, y flipped when the window uses flipped coordinates.
  - Fields 42, 45 and 51 are not set on clicks.
- **Types.** Left down/up 1/2, right 3/4, other 25/26; dragged 6 (left), 7 (right), 27 (other) [F §5.3].
- **Clicks.** For n clicks: down (click count i), then up (click count i), for i = 1…n. No mouse-moved events [F §5.3].
- **Drag.** Down; dragged at the start, at the midpoint and at the end; up. The three dragged events share one event number and click count 0 [F §5.3]. cua: the Design says "interpolated moves"; parity is these three (§23).
- **Event numbers.** From one global counter, one per down/up pair [F §5.3].
- **Posting.** Each event's timestamp is set to now (uptime nanoseconds), then it is sent with `CGEventPostToPid(target pid)`, back to back, with no gap [F §5.3]. After each mouse-down there is a sleep only when a hold duration is given, which never happens on cua's path [F §5.3; E §1.3].
- **Held keys and flags.** A held key is pressed before the click. Non-zero flags are posted as modifier events from an HID-state source before the first mouse event and released after the last [F §5.3].
- **System-wide posting.** `CGEventPost` is called only by lock-screen code [F §5.3].
- cua uses this recipe for route 2 [cua: Decision Log 9].

## 12. Fake activation (route 3) and focus-steal prevention

- **The enforcer** [F §5.5]. Each driven app's pid has an enforcer holding three states: *believes active*, *believes it has focus*, *is active*.
  - At creation, *believes active* = *is active*, and *believes it has focus* comes from the steal preventer's current focus.
  - It starts focus-steal prevention for the pid.
  - It installs a process tap, an active filter, on AppKit-defined events (13) and the private types 19 and 20 (inference: app deactivated and activated). The tap drops suppressed events and tracks *is active*: true on 20 or on 13 with subtype 1, false on 19 or subtype 2.
- **enforceActiveState** [F §5.5]:
  - If the app believes it has focus: nothing.
  - Else, if it does not believe it is active: post to its pid an AppKit-defined event of subtype 1 (application activated), with modifier flags 0xC0000 and the window number, plus a left mouse down and up at the window's `AXActivationPoint` with the §11 recipe. Then set both beliefs.
  - Else (active but not focused): post a process-notification event (type 21) of subtype 0x8000 (`kCPSNotifyKeyFocusReturned`), and set the focus belief.
- **safelyEnforceActiveState** [F §5.5]:
  - If the target is already frontmost: enforce, then wait up to 0.25 s for it to believe it is frontmost.
  - Else:
    1. Record the user's frontmost app and its focused window.
    2. Start process taps on both apps with a suppression predicate.
    3. `SLSDisableUpdate`, then enforce.
    4. Poll every 10 ms for up to 1 s (`timeoutReached`) that the user's app is still frontmost and that the target's window has not ordered above the user's focused window. An ordering above is answered with `AXRaise` on the user's window.
    5. If the user's app lost frontmost, call `activateWithOptions: 0` on it. Failure gives `originalApplicationActivationFailed`; another app in front gives `frontmostApplicationChanged`.
    6. Finally `SLSReenableUpdate`, clear the predicate and stop the taps.
- **deactivateFocusEnforcer.** If the app believes it is active but is not, post AppKit-defined subtype 2 and clear both beliefs [F §5.5]. Otherwise the believed-active state persists between actions [F §13.13]; its callers other than Spotify's enablement are not listed in F. cua: the Design posts the deactivation subtype "when done" (§23).
- **When the vendor uses fake activation** [F §5.1, §5.4, §6.1, §7.1, §7.3, §1.9]:
  - a plain click on a menu-bar item;
  - background clicks with a held key or flags, inside a web view, with `clickingMayCauseSelection`, or in a Catalyst app with that or `AXMenuButton`;
  - every keyboard action into an app that does not believe it has focus;
  - paste, both before the pasteboard is written and again before ⌘V;
  - Spotify's enablement.
- **SystemFocusStealPreventer** [F §5.6]:
  - It is seeded from `CPSGetKeyFocusProcess`, falling back to the frontmost app.
  - Each protected pid gets process taps on types 13, 19 and 20.
  - A theft is reversed by `CPSReleaseKeyFocusWithID(focusTheftID)`, by re-posting a suppressed event to the victim pid, or by posting `kCPSNotifyKeyFocusTaken` (0x4000) and then `kCPSNotifyKeyFocusReturned` (0x8000) to a pid.
  - The theft predicate and the view-bridge keyboard tap are not read [undetermined: F §14.1].
  - **F over E**: E §3.4 inferred theft reversal through `setFrontProcess` [F §5.4; E §3.4].
- **Private event fields used.** sourcePID 41, targetPID 40, windowID 51, eventTypeValue 55, cpsEventSubtype 64, focusThiefAlsoStoleTypingFocus 69, focusTheftID 71, subjectPID 73, appKitEventSubtype 83, subject PSN 66/67 [F §5.6].
- `synthesizedActionWasPerformed()` stores (uptime, pid) in a global, presumably for the intervention monitor (inference). That monitor in fact filters only by source pid (§18) [F §5.5, §9.2].
- **cua route 3.** This machinery [cua: Decision Log 9]. The event posting is public API. `SLSDisableUpdate` / `SLSReenableUpdate`, `CPSGetKeyFocusProcess` and `CPSReleaseKeyFocusWithID` are private: resolved by `dlsym` with feature detection, and skipped when absent. M0 probes route 3 for keyboard actions into a background app and for the web-view click; a family where it fails falls to route 4.
- **Route 4** (cua only). Activate the app, post, then restore the previously frontmost app and its key window. It is reported as `cua/inputRoute: 4`, and it counts as a non-interference failure unless the owner accepted that app family [cua: Design, Input].

## 13. pressKey and the key-name table

- **Grammar** [F §6.3]:
  - Split on spaces into sequential combos, then split each combo on `+`, dropping empty tokens.
  - Each token is matched exactly and case-sensitively. An unknown name throws; its sentence is not recovered.
  - A combo's modifier masks are OR-ed into one key press.
  - A combo with two non-modifier keys, or with modifiers only, is not read [undetermined: F §6.3].
- **Key codes.** From a fixed ANSI table, never the current layout [F §6.3]. **F over A**: A §7, following the vendor's documentation, lists aliases (`Control`, `Ctrl`, `Alt`, `Shift`, `Enter`, `Esc`, `PageUp`, `Option`); none exists in the code. **F over E**: E §3.3 could not find `End`, `Page_Down`, `Caps_Lock`, `bracketleft` and others, and all of them exist.
- **Events.** Four per press [F §6.2–6.3]: flags-changed with the combo's mask; key down; key up (both with the mask); flags-changed restoring `CGEventSourceFlagsState(combinedSession)`. They come from an HID-system source and are posted to the keyboard target's pid with no gap. Whether pressKey events carry a Unicode string is not read.
- **Focus first.** Before the press, an app that does not believe it has focus gets fake activation (§12) [F §6.1].
- **holdKey** (the down half, a sleep of 0–30 s, then the up half; inference) is dormant, since the JS never sends a duration [F §6.3; E §1.3].
- cua accepts exactly these names in this work; aliases would be an extension recorded in the first-call document. `equal` is corrected (below) [cua: Design, Keys].

The table [F §6.4]. Codes are macOS virtual key codes (`kVK_*`); "MOD" means a modifier only, with its Carbon mask; "+S" adds the shift mask (0x200). The table has 210 cases [F §6.3].

| names | code |
|---|---|
| `BackSpace` | 0x33 |
| `Tab` | 0x30 |
| `Linefeed`, `Return` | 0x24 |
| `Clear`, `KP_Delete` | 0x47 |
| `Escape` | 0x35 |
| `Delete` (forward delete) | 0x75 |
| `space` | 0x31 |
| `Help` | 0x72 |
| `Menu` | 0x6E |
| `Caps_Lock`, `Shift_Lock` | 0x39 |
| `Home`, `Begin` | 0x73 |
| `End` | 0x77 |
| `Left`, `Up`, `Right`, `Down` | 0x7B, 0x7E, 0x7C, 0x7D |
| `Prior`, `Page_Up` | 0x74 |
| `Next`, `Page_Down` | 0x79 |
| `KP_Enter` | 0x4C |
| `KP_Equal` | 0x51 |
| `KP_Multiply` | 0x43 |
| `KP_Add` | 0x45 |
| `KP_Subtract` | 0x4E |
| `KP_Decimal` | 0x41 |
| `KP_Divide` | 0x4B |
| `KP_0` … `KP_9` | 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5B, 0x5C |
| `F1` … `F20` | 0x7A, 0x78, 0x63, 0x76, 0x60, 0x61, 0x62, 0x64, 0x65, 0x6D, 0x67, 0x6F, 0x69, 0x6B, 0x71, 0x6A, 0x40, 0x4F, 0x50, 0x5A |
| `Shift_L`, `Shift_R`, `shift` | MOD shiftKey 0x200 |
| `Control_L`, `Control_R`, `ctrl` | MOD controlKey 0x1000 |
| `Alt_L`, `Alt_R`, `alt` | MOD optionKey 0x800 |
| `Meta_L`, `Meta_R`, `meta`, `Super_L`, `Super_R`, `super`, `command`, `Command`, `cmd` | MOD cmdKey 0x100 |
| `0` … `9` | 0x1D, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16, 0x1A, 0x1C, 0x19 |
| `a` … `z` (ANSI positions) | a 0x00, b 0x0B, c 0x08, d 0x02, e 0x0E, f 0x03, g 0x05, h 0x04, i 0x22, j 0x26, k 0x28, l 0x25, m 0x2E, n 0x2D, o 0x1F, p 0x23, q 0x0C, r 0x0F, s 0x01, t 0x11, u 0x20, v 0x09, w 0x0D, x 0x07, y 0x10, z 0x06 |
| `A` … `Z` | the lowercase letter's code, +S |
| `apostrophe`, `comma`, `minus`, `period`, `slash`, `semicolon` | 0x27, 0x2B, 0x1B, 0x2F, 0x2C, 0x29 |
| `bracketleft`, `backslash`, `bracketright`, `grave` | 0x21, 0x2A, 0x1E, 0x32 |
| `exclam`, `at`, `numbersign`, `dollar`, `percent`, `asciicircum`, `ampersand`, `asterisk`, `parenleft`, `parenright` | +S: 0x12, 0x13, 0x14, 0x15, 0x17, 0x16, 0x1A, 0x1C, 0x19, 0x1D |
| `underscore`, `plus` | +S: 0x1B, 0x18 |
| `colon`, `quotedbl`, `less`, `greater`, `question` | +S: 0x29, 0x27, 0x2B, 0x2F, 0x2C |
| `braceleft`, `braceright`, `bar`, `asciitilde` | +S: 0x21, 0x1E, 0x2A, 0x32 |
| `equal` | vendor: 0x18 +S, which types `+` [F §6.4]. **Vendor defect, not copied.** / cua: 0x18 with no modifier, which types `=` [cua: Design, Keys] |
| unsupported (each throws) | `Pause Scroll_Lock Sys_Req Back Select Print Execute Insert Undo Redo Find Cancel Break Mode_switch script_switch Num_Lock Hyper_L Hyper_R KP_Space KP_Tab KP_F1 KP_F2 KP_F3 KP_F4 KP_Home KP_Left KP_Up KP_Right KP_Down KP_Prior KP_Page_Up KP_Next KP_Page_Down KP_End KP_Begin KP_Insert KP_Separator` |

## 14. typeText

Vendor:

- **Entry.** Before typing, an app that does not believe it has focus gets fake activation (§12) for the observed window; a fresh observation is taken first when none exists. The target is the keyboard target (§10). Missing text gives `Missing text to type` [F §6.1; E §3.3].
- **Source and layout.** The events come from `CGEventSourceCreate(hidSystemState)`; failure is `failedToCreateSource` [F §6.2]. The layout comes from `TISCopyCurrentKeyboardLayoutInputSource` and `kTISPropertyUnicodeKeyLayoutData` [E §3.2]. Its failures read `Unable to get current keyboard layout.`, `Unable to get keyboard layout data.` and `Unable to get keyboard layout pointer.` [E §3.3].
- **Reverse map.** For each UTF-16 code unit (a `\n` is looked up as `\r`), search the eight Carbon masks `0, 0x200, 0x800, 0xA00, 0x1000, 0x1200, 0x1800, 0x1A00` (shift, option, control and their combinations, never ⌘) across key codes 0–127. Each probe is `UCKeyTranslate(…, kUCKeyActionDisplay, mask >> 8, LMGetKbdType(), 0, dead-key state 0, …)`, and the first exact single-unit match wins [F §6.2]. That the masks form the outer loop is inferred from F's wording.
- **No match.** The unit is logged (`Could not find key code for character: %C`) and skipped, with no error and no Unicode fallback. Emoji (surrogate pairs) and, by inference, dead-key characters such as `é` on a US layout are dropped [F §6.2]. **Vendor defect, not copied.** **F over E**: E §3.3 inferred that some characters might go as Unicode-string events.
- **Events.** Four per character [F §6.2]:
  1. flags-changed, with the mask's `CGEventFlags` (the mapping table is not read [undetermined: F §14.1]);
  2. key down, with those flags and `CGEventKeyboardSetUnicodeString(<the character>)`;
  3. key up, likewise;
  4. flags-changed, restoring `CGEventSourceFlagsState(combinedSession)`.
- **Posting.** The whole string is one event array, posted with `CGEventPostToPid` to the keyboard target. Each event is stamped with the current time and followed by a 250 µs gap (5 ms when the app is iPhone Mirroring) [F §6.2]. Return is key code 0x24 [F §6.2].

cua:

- **Focus first.** Fake activation before keying when the app does not believe it has focus, as the vendor does [cua: Design, Text].
- **Routing by input source.** cua reads `TISCopyCurrentKeyboardInputSource` and routes by it [cua: Decision Log 2]. With a Latin source, every character the layout can produce is keyed exactly as the vendor keys it. The reverse map is built once per layout and rebuilt on `kTISNotifySelectedKeyboardInputSourceChanged` [cua: Decision Log 6].
- **Mid-request switch.** The current source's id is compared before every event and after the last. A change stops the request with `inputSourceChanged` and a bounded sentence naming how many UTF-16 units were entered [cua: Decision Log 8].
- **Unkeyable characters** (an emoji, CJK, a combining sequence) go as Unicode-string events with key code 0. Each carries at most 20 UTF-16 units and never splits a surrogate pair or a combining sequence [cua: Decision Log 9].
- **Korean source active.** The text takes the paste route (§15), and newlines go as Return key events [cua: Decision Log 6].
- **Per-context source.** When the per-context input preference ("Automatically switch to a document's input source", in `com.apple.HIToolbox`) is on and the driven app is not frontmost, the source is unknown and the text takes the paste route [cua: Decision Log 6]. M0 probe (e) checks the transliteration case.
- **Concealed requests** (`concealed: true`, set by `src/services/sky.mjs` on a substituted request) are keyed only under a Latin source whose reading is reliable: the preference off, or the driven app frontmost. Otherwise the request fails `concealedInputUnavailable` before anything is entered. A concealed request never takes the paste route [cua: Decision Log 4].
- **Reporting.** Every paste fallback is reported as `cua/inputRoute: "paste"` [cua: Decision Log 3].

## 15. Paste

- **Serialization.** Every paste runs through one process-wide serial queue, whatever the app or client [F §7.1]. cua: the Design does not say (§23).
- **Focus first.** The app's enforcer is created if needed. If the app does not believe it has focus, `enforceActiveState` runs for its primary window before the pasteboard is touched, and an error there propagates [F §7.1].
- **Effect baseline.** Before writing, the vendor snapshots the focused element's `AXSelectedTextRange` and `AXNumberOfCharacters` (those it supports). It also registers an observer on the app for `selectedTextChanged` and `valueChanged`, which counts only once the read has happened and the paste has started [F §7.1].
- **Representations** [F §7.2]:
  - `text`: `public.utf8-plain-text` only.
  - `md`: the Markdown is converted to HTML, then treated as `html`.
  - `html`: converted to an attributed string and to RTF (both required), then declared in order as `public.html` (the HTML source), `public.rtf`, and `public.utf8-plain-text` (the attributed string's text, not the source). No RTFD, no web archive, no per-app case.
- **Markers.** vendor: no marker types [F §7.2] / cua: also `org.nspasteboard.ConcealedType` and `org.nspasteboard.TransientType` [cua: Decision Log 9].
- **Writing** [F §7.2]:
  1. Create a lazy data-provider item.
  2. Snapshot the general pasteboard first, materializing every type of every item, so a previous owner's promised data becomes plain data.
  3. `prepareForNewContentsWithOptions:` with `NSPasteboardContentsCurrentHostOnly` (which keeps the paste off Universal Clipboard); its return value is kept as the own change count.
  4. `writeObjects:`.
  
  Any failure gives `Could not write generated content to the clipboard`.
- **⌘V.** If the app still does not believe it has focus, `safelyEnforceActiveState` runs on the last observed window, observing first when there is none. Then `super+v` goes through the pressKey path to the keyboard target's pid, with no gap [F §7.3].
- **Read wait.** Up to 2 s for one of two signals: the provider is asked for data (only a successful hand-over counts), or the pasteboard drops the provider (`pasteboardFinishedWithDataProvider:`, meaning ownership was lost). A timeout gives `Timed out waiting for the application to read the clipboard` [F §7.4]. **F over E**: E §3.5 inferred that HTML is rendered in a `WKWebView`; whether that provider is ever used is open [undetermined: F §14.5].
- **Conflict.** A change count other than the own one gives `The user may have conflicted with your paste operation. Check the app's state to ensure the user's content did not paste instead of your intended content before continuing.` [F §7.5].
- **Effect wait.** With an observer or a non-empty baseline: poll every 25 ms for up to 2 s for the observer's signal, or for a change in the selected range or the character count. With neither: a fixed 100 ms sleep. A poll timeout gives the "read the clipboard" sentence [F §7.5]. The worst case before restore is about 4 s.
- **Restore** runs on every path, success and every error after the write [F §7.6]:
  - only if the change count is still the own one: clear; stop there if the snapshot was empty; otherwise write one new item per saved item, with each type's data;
  - otherwise the human's newer contents are left and the event is logged;
  - a read timeout with a moved change count is reported as the conflict sentence.
- **Settle.** Deferred to the next observation (§17) [F §7.7].
- cua follows this flow [cua: Decision Log 9]. A concealed paste is refused with `concealedInputUnavailable` [cua: Decision Log 4].

## 16. Scroll, drag, setValue, selectText and secondary actions

- **perform_secondary_action.**
  - vendor: runs the named action through `perform(action:)`. The advertised actions are the line's `Secondary Actions` (§6) after `filterActions`, whose list includes the pseudo-actions `SAIExpand` and `SAICollapse`, which by inference set the disclosure attribute [E §2.1, §3.3]. An unknown action gives `<action> is not a valid secondary action for <element>`; how `<element>` is rendered is not read [E §6.2].
  - cua: the element's own actions, with `AXIncrement`/`AXDecrement` among them [cua: Design, Input]. Whether `action` is matched against the description or the AX name is not read (§23).
- **set_value.**
  - vendor: sets the attribute, then re-checks the element ignoring its value (§8). The controller passes `autosubmitSearchFields`; its effect is not read, but Apple Music's instructions say set-value on its search field auto-submits [F §3.6; E §1.3, §8]. A field that is not settable gives `Cannot set a value for an element that is not settable` [E §6.2].
  - cua: `AXValue` when settable [cua: Design, Input].
- **select_text.**
  - vendor: finds `text` in the element "exactly as it appears in the accessibility tree, including any Markdown formatting", using `prefix` and `suffix` to disambiguate. It then selects the text, or puts the caret before or after it [A §3.2; E §1.3].
  - Errors: `Could not find the requested text to select in the element` when the text is not found; `Cannot select text for an element that does not support a settable selected text range` when the range is not settable [E §6.2].
  - Mapping Markdown offsets back to the element's text is not read; `TransformedUIString` keeps source offsets [E §5.4].
  - cua: `AXSelectedTextRange` [cua: Design, Input]; the offset mapping is §23.
- **scroll.**
  - vendor: builds scroll-wheel events (`CGEventCreateScrollWheelEvent2`) from an HID-state source, sets the private window field 51 on them, and never settles or sets the settle flag [F §5.3, §8.1, §11, §13.11]. `pages` is a Double [E §1.3]. How pages become wheel deltas is not read; `scrollUsingScrollBar(direction:)` exists [E §3.3]. Errors: `Missing scroll amount`, `Missing scroll direction` [E §6.2].
  - cua: wheel events in lines, `pages` × the scroll area's visible lines, at the element's centre or the point, posted to the owning process [cua: Design, Scroll].
- **drag.**
  - vendor: §11's drag sequence, then a deferred settle [F §5.3, §8.1].
  - cua: down, moves, up, posted to the owning process [cua: Design, Drag]; the number of moves is §23.

## 17. Settle

- **The call.** `waitForUIToSettle(delay, notificationDelay: 0.25, includingScrollEvents: false)`; the quiet period is 0.25 s at every one of the 22 call sites [F §8.1].
- **Sampling delay** [F §8.1]:
  - 0.1 s after an AX-action click, keyboard actions, paste and two secondary-action sites;
  - no delay given after synthesized clicks, setValue, selectText, coordinate clicks and drags, three secondary-action sites, and the deferred settle;
  - "no delay" resolves to 0.25 s for a web-shaped app (§2) and 0.1 s otherwise.
- **On cua's path** the deferred settle is called with no delay, so sampling is 0.1 s for a native app and 0.25 s for a web-shaped one, whatever the action [F §8.1, §8.6]. F §8.1 also lists IPC-side sites for paste and the keyboard send at 0.1 s. F §8.6's conclusion, that cua's path defers, is the reading kept here.
- **Scroll** never settles and never sets the flag, so an observation after a scroll does not wait [F §8.1].
- **Observer.** A new observer on the application element, created for the settle call after the action, listens for ten notifications [F §8.2]: `titleChanged`, `layoutChanged`, `focusedWindowChanged`, `focusedUIElementChanged`, `elementBusyChanged`, `menuOpened`, `sheetCreated`, `windowCreated`, `created`, `uiElementDestroyed`.
  - `valueChanged` would be added only with scroll events included, which is never.
  - Each notification resets "last notification" to now, except a `titleChanged` whose `AXTitle` is unreadable, not a string, or equal to the title remembered for that element.
  - "Last notification" starts at the settle's start.
- **Loop** [F §8.3]. Each round:
  1. cancelled: return nothing;
  2. 5 s or more since the observer started: return nothing (a silent cap: no error, no tree);
  3. otherwise sleep for the sampling delay;
  4. if 0.25 s have passed since the last notification, take the window `focusedWindow ?? mainWindow ?? windows.last`. With no window, keep looping to the cap. With one, run the busy walk: not busy returns its tree; busy discards it and loops.
- **No floor.** With nothing posted, a native app returns at about 0.3 s (the third check) plus the walk, and a web-shaped one at about 0.25–0.5 s [F §8.3]. **F over A and E**: A §3.6 (the vendor's skill text, "about 1 second, with additional delays of up to 5 seconds") and E §7 described a floor that the code does not have. An observation after the last window closed waits the whole 5 s cap before `noWindowsAvailable` (§2) [F §8.3].
- **Busy walk** [F §8.4]. It installs an invalidation monitor, prefetches `[AXDOMClassList, AXElementBusy, AXLoaded]` and walks the window's tree. Busy means any of:
  - role `AXBusyIndicator`;
  - an `AXWebArea` with `AXLoaded` false;
  - `AXElementBusy` true;
  - an `AXDOMClassList` entry `macos-mac-parity-spinner`.
  
  `AXProgressIndicator` is not a sign. `com.apple.Music` runs an extra check first that is not read [undetermined: F §14.5].
- **The tree flows on.** The capture after a settle starts from the busy walk's tree, under its invalidation monitor [F §8.5].
- **Deferred.**
  - An action that returns no observation sets "needs settle" and returns. `get_app_state` reads and clears the flag: set means settle (no delay, 0.25 s quiet) and then capture from the settle's tree; clear means capture at once. Settle errors propagate [F §8.6].
  - On cua's IPC path, then, the settle happens at the next `get_app_state` on that app, not inside the action [F §8.6].
  - cua does the same, reusing the busy walk's tree [cua: Design, Settle].
- **The cap.** vendor: silent / cua: reported as `cua/settle: "capped"` [F §8.3; cua: Decision Log 9]. Where that meta belongs is §23.
- **Budget.** cua suspends the cell's time budget around the launch wait, the action and the settle (`withSuspendedTimeout`); the vendor JS wraps the action likewise [cua: Design, Settle; A §2.6].
- **Deadline.** vendor: a request whose `deadlineUnixMilliseconds` has already passed on receipt is rejected with −32001 `Request deadline exceeded`, before dispatch. No later check was found [F §8.9, inference: absence] / cua: §23.

## 18. User intervention

Vendor:

- **The tap.** A listen-only, auto-re-enabling event tap at `kCGAnnotatedSessionEventTap` on five event types: left mouse down (1), right mouse down (3), other mouse down (25), scroll wheel (22) and key down (10). Moves, drags, mouse ups, key up and flags-changed do not count [F §9.2].
- **Fields read.** Per event: source pid (field 41), target pid (field 40) and window id (private field 51) [F §9.2].
- **Own events.** The only exclusion of the helper's own events is `sourcePID == getpid()`. Fields 42 and 45 and the event-number counter are not consulted [F §9.2]. That events posted with `CGEventPostToPid` never reach a session tap is inference [undetermined: F §14.2].
- **Attribution, per event.** The app is the owner of the window with that id when the window exists, else the target pid's app. It counts only if that app has an instance whose controller is active. No frontmost test exists [F §9.3]. So (inference):
  - a click or scroll on the driven app's background window counts;
  - a keystroke counts only when the driven app is the event's target;
  - typing into the user's own window never counts.
- **Debounce.** Each counted event sets the app's entry to "user interrupted, re-query required", with a deadline of now + 5 s, and replaces the pending debounce task [F §9.1]. On expiry the deadline is dropped and the re-query requirement stays. *Debouncing* means a deadline exists and `ceil(deadline − now) > 0`.
- **Clearing.** Only a successful `get_app_state` with no blocked URL clears the entry, and only when it requires a re-query and is not debouncing [F §9.1]. An action's observation does not clear it. Ending the session, removing the instance, deactivating it or a terminated-app lookup also clear it.
- **Lifetime.** The tap runs while at least one controller is active: from the first observation until a deactivate or stop request. The JS never sends either, so in cua's use the tap runs between requests too [F §9.4; A §1.7].
- **The gate, at request start** (activate, perform-action and `get_app_state` requests) [F §9.5]:
  1. No entry: proceed.
  2. Debouncing: wait, polling every 250 ms for up to 100 s. If still debouncing at the cap, refuse with `The user is still interacting with '<app>'. Wait 5 seconds and retry.` The 5 is a literal, not the remaining time.
  3. Re-query required, for an action: refuse with `` The user changed '<app>'. Re-query the latest state with `get_app_state` before sending more actions. ``
  4. Otherwise proceed; `get_app_state` passes and then clears the entry.
  
  `<app>` is the request's own `app` string, which on this path is the bound app path (§3) [F §9.5; A §2.6].
- **No re-check.** Nothing re-checks after an action, so an intervention is reported by the **next** request [F §9.5].
- **F over A and E.** A §7 says "physical input during an action stops it", and E §6.3 inferred an immediate "still interacting" refusal during the debounce. The code does neither [F §9.5; A §7; E §6.3]. **F over E**: E §7 took the printed number to be the remaining time [F §9.5; E §7].
- **Codes.** Both sentences are `userIntervened` −10016. Stopped-by-user is `userStoppedSession` −10012 (inference), reachable only after a stop request that cua never sends [F §9.6; A §1.7].

cua:

- **Mechanism.** The same tap and per-event attribution, with no frontmost test. The callback reads only the event type, source pid, target pid and window id, never a key code, characters or a stored location. The tap is torn down when the last connection closes [cua: Design, User intervention].
- **Own events.** The engine's own events are excluded by source pid and by `CGEventPostToPid` delivery. Its own `super+n`, sheet clicks, window opens and closes, and route-4 activations are never interventions [cua: Design, User intervention].
- **Fallback.** If probe (d) finds the tap needs a grant the engine lacks, or the engine's own posts reach it, the fallback is private-source key events plus the HID idle time and a driven-app-frontmost test [cua: Decision Log 9].
- **In flight.** vendor: never stops an action in flight [F §9.5] / cua: an in-flight sequence stops at the first attributed event and fails `userIntervened` with the "user changed" sentence [cua: Decision Log 9].
- **Debounce live.** vendor: a request waits up to 100 s, then proceeds or refuses [F §9.5] / cua: every input request is refused at once with the "still interacting" sentence, and nothing is posted [cua: Decision Log 9]. What `get_app_state` does during the debounce is §23.
- **After an intervention,** actions on that app are refused with the "user changed" sentence until a fresh `get_app_state`, as the vendor does [cua: Design, User intervention].
- **Reporting.** `cua/hidIdleMs` is the time since the last user event attributed to the driven app (or the HID idle time under the fallback). It is reported on input results and refusals together with `cua/receivedAt` [cua: Design, Result meta].

## 19. Lock screen

- **vendor.** The lock state comes from distributed notifications (`com.apple.screenIsLocked`, `com.apple.sessionagent.screenIsLocked`, `com.apple.screenLockUIIsShown`, `com.apple.sessionagent.screenLockUIIsShown`, `com.apple.screenIsUnlocked`, `com.apple.sessionagent.screenIsUnlocked`). A guarded auto-unlock follows: a guardian process typing into `UserPasswordTextField`, with an overlay reading `ChatGPT is Using Your Mac` and `Press any key or click to unlock` [E §6.4]. Its physical-input monitor taps 16 event types at the session tap, skipping one ignored pid [F §9.6].
- **Sentences.** Three, all `screenLocked` −10020 [E §6.2]:
  - `The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.`
  - `The Mac is locked and automatic unlock is paused because physical input was detected. Ask the user to unlock the Mac manually before continuing.`
  - `The Mac is locked and this Computer Use request cannot be associated with a ChatGPT thread. Ask the user to unlock the Mac manually before continuing.`
- **cua.** When `CGSessionCopyCurrentDictionary`'s `CGSSessionScreenIsLocked` is true, every request fails `screenLocked` (−10020) with the first sentence. No auto-unlock and no guardian [cua: Design, Lock screen; Decision Log 12].

## 20. Approvals, risk and the forbidden list

- **Policy flow** on every app-scoped call [A §2.6]:
  1. Reset the response meta.
  2. Require `app` to be a non-empty plain data property, and freeze the input.
  3. Resolve the app and its policy: decision `allowed`, `denied` or `forbidden`; target `{appPath, bundleIdentifier, displayName, risk: low | high, warningSubtitle?}`; and `allowPersistentApproval`.
  4. Set `codex/toolSurface` (§1).
  5. Refuse a denial (below).
  6. Ask for approval.
  7. Check the answer.
  8. Replace `app` with `appPath` and run the action under `withSuspendedTimeout`.
  
  cua runs the same flow in `policy.mjs`, with resolution by the engine's `resolve_app` [cua: Design, Policy and approvals].
- **Elicitation**, on every call, with exactly this shape, which cua's harness matcher expects [A §2.6; cua: Design, Policy and approvals]:
  - message `Allow Computer Use to use "<displayName>"?`;
  - meta `codex_approval_kind: "mcp_tool_call"`, `connector_id: "computer-use"`, `connector_name: "Computer Use"`, `persist`, `riskLevel`, `subtitle?`, `tool_call_id?` (from the turn metadata's `call_id` or `item_id`), `tool_name`, `tool_params: {app: <bundle id>}`, `tool_params_display: [{name: "app", display_name: "App", value: <displayName>}]`;
  - the MCP request is `{message, requestedSchema: {type: "object", properties: {}}, mode: "form", _meta}`.
- **persist.** vendor: `["session", "always"]` when `allowPersistentApproval`, else `["session"]` [A §2.6] / cua: `["session"]` only. `CUA_SHIM_PERSIST=always` is refused at `cua serve` from M3, with a sentence naming the hook [cua: Decision Log 3].
- **Answer.** Anything but `action: "accept"` gives `Computer Use was not approved to use <displayName>` [A §2.6].
- **Memory.**
  - vendor: the Rust host answers a repeat `connector_id: computer-use` elicitation for the same app from stored state, allowed and denied alike, with `content.source: "computer-use-persisted-state"`, for the connection's life. It writes a session file that cua deletes at close [A §2.6].
  - cua: the supervisor's per-connection memory answers repeats, accepts and declines alike, with the same `content.source`. No session file [cua: Decision Log 3, 4].
- **Denied.** vendor: `Computer Use is blocked from using the app '<bundle id>' by your organization's policy.` (organization policy through the app server, which degrades to its default for a cua-launched helper) [A §2.6, §2.7] / cua: no organization policy, so never denied [cua: Design, Scope].
- **Forbidden.**
  - The JS refusal is `Computer Use is not allowed to use the app '<bundle id>' for safety reasons.` [A §2.6].
  - The helper's own refusal is `Computer use actions are not allowed for system security process: <bundle id>` (likely `appNotAllowed` −10006) [E §6.2].
  - cua: the policy refuses with the JS sentence. The engine also refuses the list on `resolve_app` and every app-scoped request, whoever the client is, with the helper's sentence [cua: Decision Log 2].
- **The forbidden list** (membership read from string order; inference) [E §6.1; undetermined: E §10.6]:
  - password managers and the keychain: `com.apple.keychainaccess`, `com.apple.Passwords`, `com.1password.1password`, `com.1password.safari`, `com.bitwarden.desktop`, `com.dashlane.dashlanephonefinal`, `com.lastpass.LastPass`, `com.nordsec.nordpass`, `me.proton.pass.electron`, `me.proton.pass.catalyst`;
  - system security processes: `com.apple.UserNotificationCenter`, `com.apple.LocalAuthenticationRemoteService`, `com.apple.SecurityAgent`.
  
  **E over A**: A §7 also counted iPhone Mirroring (`com.apple.ScreenContinuity`), which is its own constant in the binary. cua shares one copy of the list between `policy.mjs` and the engine (a generated Swift file) [cua: Design, Interfaces].
- **Override.** vendor: the user default `ComputerUseAllowForbiddenTargets` lifts the forbidden list [E §6.1] / cua: no override (the Design names none).
- **High risk,** with the subtitle `Allowing ChatGPT to use this app introduces new risks, including those related to prompt injection attacks, such as data theft or loss. Carefully monitor ChatGPT while it uses this app.` [E §6.1–6.2, inference on the lists]:
  - terminals: `com.apple.Terminal`, `com.googlecode.iterm2`, `dev.warp.Warp-Stable`, `net.kovidgoyal.kitty`, `com.github.wez.wezterm`, `com.mitchellh.ghostty`, `com.raphaelamorim.rio`, `dev.commandline.waveterm`, `org.alacritty`, `co.zeit.hyper`, `org.tabby`;
  - browsers: `com.apple.Safari`, `com.apple.SafariTechnologyPreview`, `com.openai.atlas`, `.alpha`, `.beta`, `ai.perplexity.comet`, `com.brave.Browser`, `com.microsoft.edgemac`, `com.operasoftware.Opera`, `com.vivaldi.Vivaldi`, `company.thebrowser.Browser`, `company.thebrowser.browser`, `company.thebrowser.dia`, `org.chromium.Chromium`, `org.mozilla.firefox`, `org.mozilla.nightly`, `com.duckduckgo.macos.browser`;
  - `com.google.Chrome` (its string is shared with other uses, so it is listed elsewhere in the binary).
  
  Chrome for Testing is in no list. cua: terminals and browsers are high risk, with the subtitle [cua: Design, Policy and approvals].
- **Private windows.** vendor: `isPrivateBrowserWindow(bundleIdentifier:title:)` matches localized "(Incognito)" / "(Private)" title fragments; what it changes is not read [E §6.1] / cua: not in the Design.
- **Blocked URLs and the kill switch.** vendor: `Computer Use stopped due to encountering a disallowed URL: <url>` (`blockedURL` −10015) and `Computer Use is disabled by your configuration.` both depend on the account, the app server or `CODEX_HOME` configuration [E §6.2, §6.5; A §2.7] / cua: neither exists [cua: Design, Scope].

## 21. Error codes and model-visible sentences

- **Only the message reaches the cell.** `code` and `errorName` stop at the worker, so the message text is the model-visible contract [A §1.1]. cua's wrapper classifies by `errorName` without reading values [A §1.5].
- **Server codes** (`ServerErrorCode`) [A §1.5]: senderProcessNotAuthenticated −10000, couldNotGetRequestData −10001, couldNotGetRequestTypeName −10002, couldNotResolveRequestType −10003, unhandledEvent −10004, unknownError −10005, appNotAllowed −10006, runningApplicationNotFound −10007, accessibilityError −10008, permissionsNotGranted −10009, invalidApp −10010, noActiveSession −10011, userStoppedSession −10012, incompatibleClientVersion −10013, permissionsPending −10014, blockedURL −10015, userIntervened −10016, couldNotGetSenderPID −10017, ambiguousApp −10018, couldNotGetBootstrapPort −10019, screenLocked −10020.
  - Other codes (`turnEnded`, `serverError`, the `messages*` family) surface as `errorName: "jsonRPCError"` [A §1.5; E §1.4].
  - Transport-level: an expired deadline gives −32001 `Request deadline exceeded` [F §8.9]; an unknown method gives `Method not found` [E §1.1].
  - cua uses the vendor's numbers for the conditions it maps, and −10005 with a bounded sentence otherwise [cua: Design, Protocol].
- **Envelope.** The observed form is `Computer Use server error <code>: <reason>`, for example `Computer Use server error -10005: timeoutReached` [A §1.5]. Whether the sentence-carrying errors (intervention, lock, ambiguity, element and paste errors) arrive bare or inside this envelope is not recorded [undetermined: E §10.7]. M0's vendor captures pin it (§23). cua's harnesses match substrings, so either form satisfies them [A §6.3].

Sentences the helper produces. The code is given where a source shows it [E §6.2 unless noted]:

| condition | code | sentence | cua |
|---|---|---|---|
| index not in the revision | not recovered | `<n> is an invalid element ID` | verbatim [cua: Design, The contract kept] |
| element gone; cua's lineage refusal | not recovered | `The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.` | verbatim |
| ambiguous before / after re-fetch | not recovered | the two `The element was invalidated, …` sentences (§8) | verbatim |
| no invalidation monitor | not recovered | `The skyshot is unexpectedly missing an invalidation monitor. This state shouldn't happen, likely programmer error.` | no such state |
| no stored tree (inference) | not recovered | `AX tree unexpectedly missing.` | the lineage refusal (§8) |
| capture failure | not recovered | `UI tree capture failed.` / `Failed to capture AX payload: <detail>` | bounded −10005 |
| text to select not found | not recovered | `Could not find the requested text to select in the element` | verbatim |
| selection not settable | not recovered | `Cannot select text for an element that does not support a settable selected text range` | verbatim |
| value not settable | not recovered | `Cannot set a value for an element that is not settable` | verbatim |
| unknown secondary action | not recovered | `<action> is not a valid secondary action for <element>` | same shape |
| scroll arguments | not recovered | `Missing scroll amount` / `Missing scroll direction` | unreachable behind the JS checks below |
| typeText without text | not recovered | `Missing text to type` | same |
| holdKey duration (dormant) | not recovered | `Invalid duration` | unreachable |
| paste write | not recovered | `Could not write generated content to the clipboard` | verbatim |
| paste read or effect timeout | not recovered | `Timed out waiting for the application to read the clipboard` | verbatim |
| paste conflict | not recovered | `The user may have conflicted with your paste operation. Check the app's state to ensure the user's content did not paste instead of your intended content before continuing.` | verbatim |
| menu click | not recovered | `Menu mouse action not supported` / `Failed to click menu item` | same |
| capture window | not recovered | `No capturable window found: <detail>` | bounded −10005 |
| app gone | −10007 | `Running application not found: <detail>` | same |
| no window | observed only as a substring | `noWindowsAvailable` [A §1.5, §6.3] | the substring kept |
| launch timeout | −10005 | `Computer Use server error -10005: timeoutReached` [A §1.5] | `timeoutReached` kept |
| ambiguous app | −10018 | `Ambiguous app identifier '<x>'. Multiple apps share this bundle identifier: <list>. Use an app name or full app path instead.` | §3 |
| user changed the app | −10016 | `` The user changed '<app>'. Re-query the latest state with `get_app_state` before sending more actions. `` [F §9.5] | verbatim |
| user still interacting | −10016 | `The user is still interacting with '<app>'. Wait 5 seconds and retry.` [F §9.5] | verbatim |
| screen locked | −10020 | the three sentences (§19) | the first only |
| system security process | −10006 (likely) | `Computer use actions are not allowed for system security process: <bundle id>` | the engine's refusal |
| blocked URL | −10015 | `Computer Use stopped due to encountering a disallowed URL: <url>` | never raised |
| disabled by configuration | not recovered | `Computer Use is disabled by your configuration.` | never raised |

The cua column follows the Design's kept list and its Paste paragraph [cua: Design, The contract kept; Design, Paste]. Where the Design is silent, "same" is this document's default, not a Design decision.

- **JS policy sentences** [A §2.6; E §6.2]: `Computer Use is not allowed to use the app '<bundle id>' for safety reasons.`; `Computer Use is blocked from using the app '<bundle id>' by your organization's policy.`; `Computer Use was not approved to use <displayName>`. cua keeps the first and third verbatim [cua: Design, The contract kept].
- **JS validation**, each a `TypeError` [A §1.4]: `app is required`; `elementIndex must be an integer`; `<from|to|coordinate> must include finite x and y coordinates`; `mouseButton must be left, right, middle, l, r, m, 0, 1, or 2`; `direction must be up, down, left, or right`; `pages must be a finite number > 0`; `key is required`. They are not on the Design's kept list; cua's service replaces the vendor client's validation and may keep them verbatim at no cost [cua: Design, The contract kept].
- **Transport.**
  - vendor: `Sky Computer Use native pipe is unavailable`, `Sky Computer Use native pipe is closed`, `… closed before response`, `… frame is too large: <n>`, `Sky Computer Use API version mismatch: client=<v> server=<v>`, `Sky Computer Use request timed out`, `Sky Computer Use returned an invalid JSON-RPC response`, `Sky Computer Use requires the trusted nodeRepl runtime`, `Sky Computer Use service startup request failed` and `Sky Computer Use native pipe startup failed`. They are raised as `SkyComputerUseTransportError` [A §2.1–2.2, §2.9].
  - cua: its own bounded sentences under the same error class. A version or build mismatch names `cua install --engine` [cua: Design, Client].
- **cua-only errors.**
  - `concealedInputUnavailable`: the wrapper renders its own fixed sentence, which says nothing was entered, names the active input source and names `setValue` as the alternative [cua: Decision Log 4].
  - `inputSourceChanged`: a bounded sentence with the count of UTF-16 units entered [cua: Decision Log 8].
  - `permissionsPending`, naming "cua Engine" (§3) [cua: Design, Permissions].
  
  For a concealed request, the wrapper's "may have been partly entered" sentence covers every other failure after substitution [cua: Decision Log 4].

## 22. Timing and budgets

| quantity | vendor | cua | sources |
|---|---|---|---|
| frame | 8 MiB each way | 8 MiB | [A §2.2; F §10.2; cua: Decision Log 2] |
| request deadline | client default 120 s, sent as `deadlineUnixMilliseconds`; checked on receipt only (−32001) | client default 120 s; engine enforcement §23 | [A §2.2; F §8.9; cua: Design, Client] |
| connect | 250 ms connect-and-ping loop (each ping ≤ 1 s, retry after 100 ms); reconnect for ≤ 5 s after a launch | reconnect for ≤ 5 s after a launch | [A §2.1; cua: Design, Client] |
| launch | `AXWindows` polled every 50 ms, no bound inside; `timeoutReached` observed at about 5.5 s | ≤ 5 s for a window, then `timeoutReached` | [F §8.8; A §7; cua: Design, App resolution and launch] |
| web-area wait | 100 ms, then ≤ 1 s polled every 50 ms | same | [F §1.9] |
| Spotify activation before enablement | ≤ 1 s polled every 50 ms | §23 | [F §1.9] |
| messaging timeout | none | 1 s per element | [F §1.6; cua: Decision Log 9] |
| traversal deadline | none | 10 s | [F §1.6; cua: Decision Log 9] |
| children | 100, then the visible subset; omitted above 499 | same | [F §1.5] |
| depth | 200 levels, silent | 200 levels, marked | [F §1.5; cua: Design, Observation] |
| nodes | no budget | 4,000 | [F §1.5; cua: Decision Log 9] |
| value length | the hierarchy call's own truncation | 10,000 characters, `[truncated]` | [F §1.1; cua: Decision Log 9] |
| observation size | the frame only | 6 MiB `Skyshot` | [cua: Decision Log 4] |
| Markdown value | every non-source-code text area, no cap | ≤ 2,000 characters | [F §2.3; cua: Design, Observation] |
| URL budget | 4,000 characters per tree; per-URL limit 120 → 20 in steps of 10 | same | [F §2.5] |
| long part | about 100 characters, or a `\n` | same | [F §2.4, §12] |
| diff | lines ≤ the full tree's node count; ≥ 1 line left for the removed summary | same | [F §4.3] |
| mouse events | no gap; a hold only when given (never from the JS) | same | [F §5.3; E §1.3] |
| `humanClickInterval` | 0.1 s, dead | none | [F §5.1] |
| pressKey events | no gap | same | [F §6.2] |
| typed text | 250 µs after each event (5 ms for iPhone Mirroring) | 250 µs | [F §6.2; cua: Design, Text] |
| Unicode-string chunk | none (dropped) | ≤ 20 UTF-16 units | [F §6.2; cua: Decision Log 9] |
| holdKey | 0–30 s, dormant | dormant | [F §6.3] |
| fake activation | poll every 10 ms for ≤ 1 s; frontmost wait 0.25 s | same | [F §5.5, §12] |
| paste read | ≤ 2 s | same | [F §7.4] |
| paste effect | ≤ 2 s polled every 25 ms; 100 ms sleep without observer or baseline | same | [F §7.5] |
| settle quiet period | 250 ms | same | [F §8.1] |
| settle sampling | 0.1 s native, 0.25 s web-shaped | same | [F §8.1] |
| settle cap | 5 s, silent | 5 s, reported | [F §8.3; cua: Decision Log 9] |
| intervention debounce | 5 s, renewed per event | 5 s | [F §9.1; cua: Design, User intervention] |
| debounce at request start | poll every 250 ms for ≤ 100 s, then refuse | refuse at once | [F §9.5; cua: Decision Log 9] |
| "Wait 5 seconds and retry." | a literal 5 | same | [F §9.5] |
| list_apps recency | 14 days (Spotlight) | the engine's usage store | [E §7; cua: Design, App resolution and launch] |
| screenshot | JPEG at 0.8 by the server config (PNG possible); the window's bounds × its screen's backing scale, rounded up, uncapped (a legacy 2048/768 fit is off server-side); 1172 × 976 at about 50 KB on the mini's 2026-10-14 baseline | JPEG 0.8, at the display's pixel size | [E §4.2; A §3.7; cua: Design, Screenshot; Decision Log, 2026-10-19 screenshot-size ruling] |

## 23. Open points for M1a and M2a

Each point is either a place where the Design is silent while the vendor's rule is known, or one where this reading finds the Design inconsistent. Each is pinned here so that the decision is taken once.

1. **Transformations versus numbering.** The vendor numbers the nodes that survive its transformations, contiguously (§5, §8). The Design numbers in the engine and transforms in the service, so its engine cannot know which nodes survive. Transformation (5) also needs the rendered line. Recommendation: the engine issues a per-lineage handle token for each node, equal exactly when the handles are `CFEqual`, and keeps the token-to-handle table. The service then runs the transformations, the numbering (inheritance, never-reuse), the line grammar and the diff as pure, golden-tested code, and sends tokens back with actions. Handles stay in the engine, as the Design requires. The alternatives are transformations in Swift (the grammar split across two languages), or numbering the raw nodes (the printed indexes gain visible gaps the vendor never shows).
2. **What a `Skyshot` node must carry.** The Interfaces' `Node` lacks fields that §5–§7 read:
   - placeholder, help, value description and URL;
   - the row and column index ranges and the serves-as-title target;
   - Catalyst traits, disclosable and disclosing, selectable and focusable;
   - the value's type, the DOM class list, the partial-array descriptor (count and available ranges) and the value's truncation;
   - and, on the observation, the selected elements beside `selectedText`.
   
   It also carries a `checked` flag the grammar never prints. How the vendor derives focusable, selectable, settable and disclosable is not read. The proposal is `AXUIElementIsAttributeSettable` on `AXFocused`, `AXSelected` and `AXValue`, and the presence of `AXDisclosing`; the goldens confirm it.
3. **`cua/settle` placement.** The settle runs at the next observation (§17), so `cua/settle` belongs on the `get_app_state` result's meta, not on input results as the Interfaces block puts it.
4. **`get_app_state` during the debounce.** The vendor waits the debounce out, then clears the re-query flag. cua refuses inputs at once, and the Design says nothing about observations. Recommendation: observe at once and clear the flag on success, since every later attributed event sets it again. Otherwise a model that re-queries during the debounce is still refused with "user changed" afterwards.
5. **Paste across connections.** The pasteboard is machine-wide, and the vendor serializes every paste process-wide (§15). cua's one-request-in-flight rule is per connection, so the engine should serialize pastes across connections.
6. **Error message forms.** Envelope or bare sentence (§21). The proposal is the envelope for case-name reasons (`noWindowsAvailable`, `timeoutReached`) and bare vendor sentences for the rest, then checked against M0's recorded vendor errors.
7. **Ambiguity wording.** The vendor's sentence names bundle identifiers. A name or path that is ambiguous needs either the same sentence or a cua sentence of the same shape (§3).
8. **Element-targeted middle click.** The vendor's element click takes left or right only; its middle behaviour is not read [undetermined: E §10.5].
9. **Drag shape.** The vendor posts exactly three dragged events (start, midpoint, end); the Design says "interpolated moves" (§11).
10. **Vendor rules the Design does not mention:**
    - the Spotify activation before enablement (§4);
    - `domClassList` for Jack and its `sent by me` flag (§4, §6);
    - the 5 ms typing gap for iPhone Mirroring (§14);
    - `_SetApplicationDesiresAttention` at set-up (§3);
    - set-value's search-field auto-submit (§16);
    - the `SAIExpand`/`SAICollapse` pseudo-actions (§16);
    - scroll never arming the settle (§17).
11. **select_text over Markdown.** Offsets found in the Markdown value must map back to the element's text (§16). The vendor's mapping is not read.
12. **Secondary-action matching.** Whether `action` is matched against the description or the AX name (§16).
13. **Out-of-process pid.** The public `AXUIElementGetPid` versus the vendor's `_AXUIElementGetActualPid` for view services (§10). The Open panel scene shows which one is needed.
14. **The engine's deadline.** The vendor checks `deadlineUnixMilliseconds` on receipt only. Whether cua's engine checks it, and when, is not stated.
15. **Header app name.** Localized or bundle name (§6). The Korean mini's capture settles it.
16. **Value rendering.** Numbers, booleans, dates and newlines (§6), settled by the goldens.
17. **Chromium web-area wait.** Every observation, or only until the app is recorded (§4). M0's Chrome timings settle it.
18. **Fake-activation lifetime.** The vendor keeps the believed-active state between actions; the Design posts the deactivation "when done" (§12). M0's route-3 probe should measure both.
19. **`clickingMayCauseSelection`.** F uses it in the click and activation decisions without defining it (§10). Until it is read or measured, cua's route 3 cannot reproduce that branch.

## 24. F §13's divergences, resolved

| F §13 | subject | resolution | here |
|---|---|---|---|
| 1 | third window fallback | adopted | §2 |
| 2 | the 20-attribute prefetch; no position, size, actions or pid | attributes adopted; route priced by M0; position, size and target pids added by cua | §4 |
| 3 | messaging timeout, traversal deadline | cua's departure | §4 |
| 4 | one enablement attribute, never both | adopted | §4 |
| 5 | VoiceOver preference | cua's departure (never touched) | §4 |
| 6 | depth, node budget, width | width and 200 levels adopted; the depth marker and node budget are cua's | §4 |
| 7 | matching against the previous revision only | adopted | §8 |
| 8 | index reuse above the maximum | vendor defect, not copied | §8 |
| 9 | re-fetch only after invalidation, eleven attributes | adopted | §8 |
| 10 | lineage check; `disableDiff` resets the lineage | the check is cua's; the reset is adopted | §8 |
| 11 | HID-system source for keys, scroll, modifiers; no source for mice | adopted | §11, §13, §14 |
| 12 | global location, window location, fields 91/92 | adopted | §11 |
| 13 | ⌘-flagged background clicks; fake activation reserved | adopted | §10, §12 |
| 14 | `AXPick` first, no `AXShowMenu` | adopted | §10 |
| 15 | exact names, fixed ANSI codes | adopted; `equal` corrected | §13 |
| 16 | unkeyable characters dropped | vendor defect, not copied (Unicode-string events) | §14 |
| 17 | `public.rtf`, rendered plain text, no markers, the effect poll | adopted; the markers are cua's | §15 |
| 18 | ten settle notifications | adopted | §17 |
| 19 | 250 ms quiet, no floor, silent cap, deferred | adopted; the cap is reported | §17 |
| 20 | busy signs | adopted | §17 |
| 21 | no `App=` line | adopted | §6 |
| 22 | one live diff header; the baseline on every observation | adopted | §9 |
| 23 | the tap rather than HID idle | adopted; HID idle is cua's fallback | §18 |
| 24 | no stop in flight | cua's departure (stops) | §18 |
| 25 | waiting out the debounce | cua's departure (refuses at once) | §18 |
| 26 | no frontmost test | adopted | §18 |
| 27 | 5 s debounce, literal 5 | adopted | §18 |
