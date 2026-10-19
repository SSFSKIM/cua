# B. Static analysis of the vendor helper "Codex Computer Use.app" (for SSFSKIM/cua #117)

Subject: `~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app` (package `@oai/sky` 0.7.5; bundle `CFBundleShortVersionString` 26.924.1001281, build 1001281).

Method: static only. Nothing from the bundle or runtime was executed, opened, signalled or attached to; the TCC database was not read. Tools: `plutil`, `codesign -d`, `security cms -D`, `otool -L`, `nm` / `nm -u`, `strings -a -n 4`, `xcrun swift-demangle`, `dyld_info -exports` (against the system's own HIServices/SkyLight, to check that SPI names exist). Intermediate dumps are kept in `/Users/new/.claude/jobs/1ea561bc/tmp/117/work/`: `S.strings` / `C.strings` / `G.strings` (service / client / guardian `strings`), `S.undef` (imports), `S.nm` + `S.dmfull` (161,617 symbols, demangled), `S.types` (2,091 Swift nominal types). "S.strings:N" below means line N of that file.

**Headline finding: the service binary is not stripped.** `nm` lists 161,617 symbols, including local Swift and ObjC symbols (`nm SkyComputerUseService | wc -l` gives 161617; the first lines are `t +[SAIRunningProcess executablePathForProcessIdentifier:]`, `t +[SAIVirtualKeyPress keyPressesForString:]`). So the module, type and method names recovered below are the original source names, not guesses. Lineage: the copyright strings say "Software Applications Incorporated" (the company behind the Sky Mac app), and the ObjC classes use the `SAI` prefix.

Labels: **[fact]** is shown by a cited command or output. **[inference]** is my reading of facts and is marked as such.

---

## 1. Structure and identity

### 1.1 Bundle tree [fact]
`find … -type f -perm -u+x` plus `file`:

| executable | role (from names/strings) |
|---|---|
| `Contents/MacOS/SkyComputerUseService` (23,793,568 B, arm64) | the engine: AX, input, capture, IPC servers |
| `SharedSupport/SkyComputerUseClient.app/.../SkyComputerUseClient` (14.8 MB) | MCP stdio servers plus the XPC relay to the service |
| `SharedSupport/CUALockScreenGuardian.app/.../CUALockScreenGuardian` (23.4 MB) | lock-screen guard process (see §3.10) |
| `SharedSupport/Codex Computer Use Installer.app/.../Codex Computer Use Installer` (90 KB) | admin installer for the authorization plug-in |
| `…Installer.app/Contents/Resources/CodexComputerUseAuthorizationPluginInstallerTool` (110 KB) | edits the authorizationdb |
| `…Installer.app/Contents/Resources/CodexComputerUseAuthorizationPlugin.bundle` (68 KB, MH_BUNDLE) | SecurityAgent authorization plug-in |

Resources: `Package_ComputerUse.bundle` holds `AppInstructions/{Slack,Notion,Spotify,iPhone Mirroring,AppleMusic,Numbers,Clock}.md` (per-app guidance for the model), `SkysightSummarizer.md` and `SkysightMemoryInstructions.md` (prompts for a passive activity-recording feature), and `LensSequence/Lens_frame_00..44.png` (animation frames). `Package_Appshot.bundle` holds `Appshot.wav`. There are also two `BUILD.bazel` files and `*_Parent.coderequirement` plists. No `.mlmodelc`, no Frameworks directory and no Sparkle.framework.

`Contents/Resources/BUILD.bazel` [fact] names the Bazel dependency graph: `@cua_package//:CodexAnalytics, :ComputerUse, :ComputerUseClient, :Fog, :GraphicsSupport, :Logging, :SlimCore`, `@swiftpkg_oaiprotobuf//:OAIProtobuf`, `@swiftpkg_oaistatsig//:OAIStatsig`, `@swiftpkg_sparkle//:Sparkle`, `@swiftpkg_swift_protobuf//:SwiftProtobuf`. It also defines `APP_GROUP_IDENTIFIER=2DC432GLL2.com.openai.sky.CUAService`, `SERVICE_AGENT_LABEL=com.openai.sky.CUAService.agent` and `SENTRY_DSN=` (empty).

### 1.2 Info.plists [fact] (`plutil -convert xml1 -o - …/Info.plist`)

| bundle | CFBundleIdentifier | LSUIElement | LSMinimumSystemVersion | usage descriptions |
|---|---|---|---|---|
| service | `com.openai.sky.CUAService` (display name "ChatGPT Computer Use", name "Codex Computer Use") | true | 14.4 | `NSAppleEventsUsageDescription` ("By default, ChatGPT sends messages only after you approve…"), `NSContactsUsageDescription` |
| client | `com.openai.sky.CUAService.cli` | true | 14.4 | none |
| guardian | `com.openai.sky.CUAService.guardian` | true | 14.4 | none |
| installer | `com.openai.sky.CUAService.AuthorizationPluginInstaller` | (absent) | 14.4 | none |
| auth plug-in | `com.openai.sky.CUAService.AuthorizationPlugin` (BNDL) | n/a | 14.4 | none |
| resource bundles | `package.{ComputerUse,Appshot,SlimCore}.resources` | n/a | 14.0 | n/a |

Build: SDK `macosx26.1`, Xcode 2611 / 17B100, BuildMachineOSBuild 25D2128. The service plist also carries Sparkle keys: `SUFeedURL=https://oaisidekickupdates.blob.core.windows.net/mac/cua/alpha/appcast.xml`, `SUPublicEDKey` (present, not reproduced), `SUAutomaticallyUpdate=true`. **Sparkle code is not in the binary**: `grep -cE 'SPUUpdater|SUUpdater|SPUStandardUpdaterController' S.strings` gives 0, there are no `_OBJC_CLASS_$_SPU*`/`SU*` symbols, and there is no Sparkle in `otool -L`. [inference] The SU* keys are inert here; the helper is updated by replacing the npm package inside the Codex/cua runtime.

### 1.3 Code signatures [fact] (`codesign -dvvv`, `codesign -d -r-`)
- Every executable has `Authority=Developer ID Application: OpenAI OpCo, LLC (2DC432GLL2)`, `TeamIdentifier=2DC432GLL2` and `flags=0x10000(runtime)` (hardened runtime). All were timestamped Sep 24, 2026, with Runtime Version 26.1.0.
- Designated requirement (the same shape for every bundle, only the identifier changes):
  `designated => identifier "com.openai.sky.CUAService" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = "2DC432GLL2"`
  (`…CUAService.cli`, `…CUAService.guardian`, `…AuthorizationPluginInstaller`, `…AuthorizationPlugin`. The installer tool's identifier is `CodexComputerUseAuthorizationPluginInstallerTool-55554944bfc1…`.)
- No launch constraints are embedded. `codesign -d --verbose=6` on the guardian lists special slots −1..−3 only, and the CodeDirectories report `hashes=N+7`/`+3`, so slots 8–11 (launch-constraint blobs) are absent. The `SkyComputerUseClient_Parent.coderequirement` and `CUALockScreenGuardian_Parent.coderequirement` files are plain plists `{team-identifier: 2DC432GLL2}`, and nothing in the binaries references them (`grep coderequirement` finds nothing). [inference] They are build leftovers or parent-constraint intents that this build does not enforce.

### 1.4 Entitlements [fact] (`codesign -d --entitlements - --xml`)
- Service: `com.apple.application-identifier=2DC432GLL2.com.openai.sky.CUAService`, `com.apple.developer.team-identifier`, `com.apple.security.application-groups=[2DC432GLL2.com.openai.sky.CUAService]`, `com.apple.security.automation.apple-events=true`, `com.apple.security.personal-information.addressbook=true`, `keychain-access-groups=[2DC432GLL2.*]`.
- Client: application-identifier `…CUAService.cli`, the same app group and the same keychain group. It has **no** apple-events entitlement.
- Guardian and auth plug-in: no entitlements blob. Installer: `<dict/>`. Installer tool: application-identifier only.
- Absent everywhere: `com.apple.security.app-sandbox`, every `com.apple.security.cs.*` exception, and **`com.apple.developer.persistent-content-capture`**.

### 1.5 Provisioning profiles [fact] (`security cms -D -i …/embedded.provisionprofile`, certificates stripped)
- Service: "CUA Service", Developer ID profile (`ProvisionsAllDevices=true`, expires 2044). Entitlements: application-identifier, team-identifier, `application-groups=[group.com.openai.sky.CUAService, 2DC432GLL2.*]`, `keychain-access-groups=[2DC432GLL2.*]`.
- Client: "CUA Service CLI", the same plus `group.com.openai.sky.Service`.
- Neither profile grants `persistent-content-capture` or any other