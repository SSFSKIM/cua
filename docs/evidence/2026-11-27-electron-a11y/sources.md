# #228 pre-flight: the source lines cited

Written by `probes/sources.py` from the copies fetched on 2026-11-27. Each excerpt names its file, its lines and the file's SHA-256.

## Chromium 152.0.7977.167 (the fixture's Electron 44.9.0 embeds it): https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.167/<path>?format=TEXT

**`ui/accessibility/platform/atk_util_auralinux.cc` lines 30 to 35** (SHA-256 `ae73afdecec2f4f443a260d1b7ce01805735a3c89de6c417822185c088264f95`). The three environment variables.

```
   30  constexpr auto kAccessibilityEnabledVariables =
   31      std::to_array<base::cstring_view>({
   32          "ACCESSIBILITY_ENABLED",
   33          "GNOME_ACCESSIBILITY",
   34          "QT_ACCESSIBILITY",
   35      });
```

**`ui/accessibility/platform/atk_util_auralinux.cc` lines 109 to 111** (SHA-256 `ae73afdecec2f4f443a260d1b7ce01805735a3c89de6c417822185c088264f95`). The toolkit name and version every Chromium application reports.

```
  109    atk_class->get_root = AtkUtilAuraLinuxGetRoot;
  110    atk_class->get_toolkit_name = []() { return "Chromium"; };
  111    atk_class->get_toolkit_version = []() { return "1.0"; };
```

**`ui/accessibility/platform/atk_util_auralinux.cc` lines 125 to 191** (SHA-256 `ae73afdecec2f4f443a260d1b7ce01805735a3c89de6c417822185c088264f95`). Whether the ATK bridge starts: the variables (1 on, 0 off), CHROME_HEADLESS, then `org.a11y.Status` `IsEnabled` on the session bus, then GSettings `toolkit-accessibility` only when that call got no reply; `InitializeAsync` stays uninitialized after a no, so a later call asks again.

```
  125  bool AtkUtilAuraLinux::ShouldEnableAccessibility() {
  126    // Check enabled/disabled accessibility based on env variable
  127    std::unique_ptr<base::Environment> env(base::Environment::Create());
  128    for (base::cstring_view variable : kAccessibilityEnabledVariables) {
  129      std::string enable_accessibility =
  130          env->GetVar(variable).value_or(std::string());
  131      if (enable_accessibility == "1")
  132        return true;
  133      if (enable_accessibility == "0") {
  134        return false;
  135      }
  136    }
  137  
  138  #if defined(USE_GIO)
  139    // Do not run additional checks when Chrome runs in headless mode, which means
  140    // we are in a test environment
  141    std::string chrome_headless =
  142        env->GetVar("CHROME_HEADLESS").value_or(std::string());
  143    if (chrome_headless == "1") {
  144      return false;
  145    }
  146  
  147    // Check enabled accessibility based on a11y DBus interface
  148    GDBusConnection* connection =
  149        g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, nullptr);
  150  
  151    if (connection) {
  152      GVariant* result = g_dbus_connection_call_sync(
  153          connection, "org.a11y.Bus", "/org/a11y/bus",
  154          "org.freedesktop.DBus.Properties", "Get",
  155          g_variant_new("(ss)", "org.a11y.Status", "IsEnabled"), nullptr,
  156          G_DBUS_CALL_FLAGS_NONE, -1, nullptr, nullptr);
  157      g_object_unref(connection);
  158  
  159      if (result) {
  160        GVariant* property;
  161        g_variant_get(result, "(v)", &property);
  162        const bool accessibilityEnabled = g_variant_get_boolean(property);
  163        g_variant_unref(result);
  164        g_variant_unref(property);
  165        return accessibilityEnabled;
  166      }
  167    }
  168  
  169    // Check enabled accessibility based on GSettings
  170    auto settings = ui::GSettingsNew("org.gnome.desktop.interface");
  171    if (settings) {
  172      return g_settings_get_boolean(settings, "toolkit-accessibility");
  173    }
  174  #endif
  175  
  176    return false;
  177  }
  178  
  179  void AtkUtilAuraLinux::InitializeAsync() {
  180    static bool initialized = false;
  181  
  182    if (initialized || !ShouldEnableAccessibility())
  183      return;
  184  
  185    initialized = true;
  186  
  187    // Register our util class.
  188    g_type_class_unref(g_type_class_ref(atk_util_auralinux_get_type()));
  189  
  190    PlatformInitializeAsync();
  191  }
```

**`ui/accessibility/platform/atk_util_auralinux.cc` lines 201 to 211** (SHA-256 `ae73afdecec2f4f443a260d1b7ce01805735a3c89de6c417822185c088264f95`). The only later call: a key event, and only while the mode has kNativeAPIs.

```
  201  // Disable CFI-icall since the key snooping function could be in another DSO.
  202  __attribute__((no_sanitize("cfi-icall")))
  203  DiscardAtkKeyEvent AtkUtilAuraLinux::HandleAtkKeyEvent(
  204      AtkKeyEventStruct* key_event) {
  205    DCHECK(key_event);
  206  
  207    if (!AXPlatform::GetInstance().GetMode().has_mode(AXMode::kNativeAPIs)) {
  208      return DiscardAtkKeyEvent::Retain;
  209    }
  210  
  211    GetInstance()->InitializeAsync();
```

**`ui/accessibility/platform/atk_util_auralinux_gtk.cc` lines 12 to 18** (SHA-256 `af8198d1e4a2755f5f2751cb48cb2095fe0ac551511ef84fec541c7083495d7d`). Starting the bridge is `atk_bridge_adaptor_init`.

```
   12  void AtkUtilAuraLinux::PlatformInitializeAsync() {
   13    // AT bridge enabling was disabled before loading GTK to avoid
   14    // getting GTK implementation ATK root.
   15    std::unique_ptr<base::Environment> env(base::Environment::Create());
   16    env->UnSetVar("NO_AT_BRIDGE");
   17    atk_bridge_adaptor_init(nullptr, nullptr);
   18  }
```

**`ui/views/accessibility/view_ax_platform_node_delegate_auralinux.cc` lines 184 to 192** (SHA-256 `709320c3c3277e0566e5854ef85d186e521714b7f5339011e0214bedb81f1504`). The first call: the application object, made once with the first widget.

```
  184    AuraLinuxApplication() {
  185      data_.id = unique_id_.Get();
  186      data_.role = ax::mojom::Role::kApplication;
  187      data_.AddState(ax::mojom::State::kFocusable);
  188      ax_platform_node_ = ui::AXPlatformNode::Create(*this);
  189      DCHECK(ax_platform_node_);
  190      ui::AXPlatformNodeAuraLinux::SetApplication(ax_platform_node_.get());
  191      ui::AXPlatformNodeAuraLinux::StaticInitialize();
  192    }
```

**`ui/views/widget/desktop_aura/desktop_window_tree_host_linux.cc` lines 437 to 445** (SHA-256 `12834233c71ec79d46577750e91907139c0b9d51056e2925d3f7feeeb502de0f`). Where key events reach `HandleAtkKeyEvent`.

```
  437  #if BUILDFLAG(USE_ATK)
  438  bool DesktopWindowTreeHostLinux::OnAtkKeyEvent(AtkKeyEventStruct* atk_event,
  439                                                 bool transient) {
  440    if (!transient && !IsActive() && !HasCapture()) {
  441      return false;
  442    }
  443    return ui::AtkUtilAuraLinux::HandleAtkKeyEvent(atk_event) ==
  444           ui::DiscardAtkKeyEvent::Discard;
  445  }
```

**`ui/accessibility/platform/ax_platform_node_auralinux.cc` lines 2185 to 2212** (SHA-256 `ea0eca6d0ec6ce18299e3d6f06783eb798ac4cae43e3069ef4bbedfa14414b14`). `Accessible.GetRelationSet` and `Accessible.GetAttributes` (ATK `ref_relation_set`, `get_attributes`) turn the mode on.

```
 2185  AtkRelationSet* AtkRefRelationSet(AtkObject* atk_object) {
 2186    RecordAccessibilityAtkApi(UmaAtkApi::kRefRelationSet);
 2187    // Enables AX mode. Most AT does not call AtkRefRelationSet, but Orca does,
 2188    // which is why it's a good signal to enable accessibility for Orca users
 2189    // without too many false positives.
 2190    AXPlatform::GetInstance().OnExtendedPropertiesUsedInWebContent();
 2191    return RefRelationSet(atk_object);
 2192  }
 2193  
 2194  AtkAttributeSet* GetAttributes(AtkObject* atk_object) {
 2195    g_return_val_if_fail(ATK_IS_OBJECT(atk_object), nullptr);
 2196  
 2197    AXPlatformNodeAuraLinux* obj =
 2198        AXPlatformNodeAuraLinux::FromAtkObject(atk_object);
 2199    if (!obj)
 2200      return nullptr;
 2201  
 2202    return obj->GetAtkAttributes();
 2203  }
 2204  
 2205  AtkAttributeSet* AtkGetAttributes(AtkObject* atk_object) {
 2206    RecordAccessibilityAtkApi(UmaAtkApi::kGetAttributes);
 2207    // Enables AX mode. Most AT does not call AtkGetAttributes, but Orca does,
 2208    // which is why it's a good signal to enable accessibility for Orca users
 2209    // without too many false positives.
 2210    AXPlatform::GetInstance().OnExtendedPropertiesUsedInWebContent();
 2211    return GetAttributes(atk_object);
 2212  }
```

**`ui/accessibility/platform/ax_platform_node_auralinux.cc` lines 2278 to 2282** (SHA-256 `ea0eca6d0ec6ce18299e3d6f06783eb798ac4cae43e3069ef4bbedfa14414b14`). They are the class functions of every Chromium ATK object.

```
 2278    atk_object_class->ref_state_set = AtkRefStateSet;
 2279    atk_object_class->get_index_in_parent = AtkGetIndexInParent;
 2280    atk_object_class->ref_relation_set = AtkRefRelationSet;
 2281    atk_object_class->get_attributes = AtkGetAttributes;
 2282  }
```

**`content/browser/accessibility/browser_accessibility_state_impl.cc` lines 330 to 375** (SHA-256 `6f6ef3c881adf77cf91b0132563cf034dacd91bc66801d04fef505105a0c7e03`). The command-line switches: `--disable-platform-accessibility-integration`, `--disable-renderer-accessibility`, `--force-renderer-accessibility[=bundle]`.

```
  330    bool disallow_changes = false;
  331    ui::AXMode initial_mode;
  332    auto& command_line = *base::CommandLine::ForCurrentProcess();
  333  
  334    if (command_line.HasSwitch(
  335            switches::kDisablePlatformAccessibilityIntegration)) {
  336      SetActivationFromPlatformEnabled(/*enabled=*/false);
  337    }
  338  
  339    if (command_line.HasSwitch(switches::kDisableRendererAccessibility)) {
  340      disallow_changes = true;
  341    } else if (command_line.HasSwitch(switches::kForceRendererAccessibility)) {
  342  #if BUILDFLAG(IS_WIN)
  343      std::string ax_mode_bundle =
  344          base::WideToUTF8(command_line.GetSwitchValueNative(
  345              switches::kForceRendererAccessibility));
  346  #else
  347      std::string ax_mode_bundle = command_line.GetSwitchValueNative(
  348          switches::kForceRendererAccessibility);
  349  #endif
  350  
  351      if (ax_mode_bundle.empty()) {
  352        // For backwards compatibility, when --force-renderer-accessibility has no
  353        // parameter, use the screen reader bundle but allow changes.
  354        // This is the best general choice in development and testing scenarios.
  355        initial_mode = ui::kAXModeComplete | ui::AXMode::kScreenReader;
  356      } else {
  357        // Support
  358        // --force-renderer-accessibility=[basic|form-controls|complete|
  359        //                                 screen-reader|on-screen]
  360        if (ax_mode_bundle.compare(kAXModeBundleBasic) == 0) {
  361          initial_mode = ui::kAXModeBasic;
  362        } else if (ax_mode_bundle.compare(kAXModeBundleFormControls) == 0) {
  363          initial_mode = ui::kAXModeFormControls;
  364        } else if (ax_mode_bundle.compare(kAXModeBundleComplete) == 0) {
  365          initial_mode = ui::kAXModeComplete;
  366        } else if (ax_mode_bundle.compare(kAXModeBundleOnScreen) == 0) {
  367          initial_mode = ui::kAXModeOnScreen;
  368        } else {
  369          // If 'screen-reader', or invalid, default to screen reader bundle,
  370          // which is the most useful in development and testing scenarios.
  371          initial_mode = ui::kAXModeComplete | ui::AXMode::kScreenReader;
  372        }
  373        disallow_changes = true;
  374      }
  375    }
```

**`content/browser/accessibility/browser_accessibility_state_impl.cc` lines 561 to 569** (SHA-256 `6f6ef3c881adf77cf91b0132563cf034dacd91bc66801d04fef505105a0c7e03`). `EnableAXModeFromPlatform`: the only writer of the platform mode, and it only adds.

```
  561  void BrowserAccessibilityStateImpl::EnableAXModeFromPlatform(
  562      ui::AXMode modes_to_add) {
  563    ui::AXMode old_mode = platform_ax_mode_->mode();
  564    ui::AXMode new_mode = old_mode | modes_to_add;
  565    if (old_mode != new_mode) {
  566      platform_ax_mode_ =
  567          CreateScopedModeForProcess(new_mode | ui::AXMode::kFromPlatform);
  568    }
  569  }
```

**`content/browser/accessibility/browser_accessibility_state_impl.cc` lines 594 to 596** (SHA-256 `6f6ef3c881adf77cf91b0132563cf034dacd91bc66801d04fef505105a0c7e03`). What the two requests add: kAXModeBasic and kExtendedProperties.

```
  594  void BrowserAccessibilityStateImpl::OnExtendedPropertiesUsedInWebContent() {
  595    EnableAXModeFromPlatform(ui::kAXModeBasic | ui::AXMode::kExtendedProperties);
  596  }
```

**`content/browser/accessibility/browser_accessibility_state_impl.cc` lines 602 to 626** (SHA-256 `6f6ef3c881adf77cf91b0132563cf034dacd91bc66801d04fef505105a0c7e03`). The other recheck for a screen reader, on an action from one: only when the mode is already complete.

```
  602  void BrowserAccessibilityStateImpl::OnActionFromAssistiveTech() {
  603    if (has_recently_checked_for_screen_reader_) {
  604      return;
  605    }
  606    has_recently_checked_for_screen_reader_ = true;
  607  
  608    // Some platforms might not perfectly signal when an assistive technology (AT)
  609    // is active, and may re-check for ATs after the AXMode
  610    // changes. If the AXMode is already configured with `kAXModeComplete`
  611    // (meaning all accessibility features are enabled), a new AT trying to access
  612    // APIs won't cause a mode change because those flags are already present.
  613    // This check allows for an AT to be detected and computed when a page loads
  614    // and the AT requests an action, specifically in the rare scenario where the
  615    // current mode is `ui::kAXModeComplete` but no AT has been identified yet.
  616    // This ensures the algorithm is complete.
  617    const bool has_ax_mode_complete =
  618        (GetAccessibilityMode() & ui::kAXModeComplete) == ui::kAXModeComplete;
  619    if (has_ax_mode_complete && !ax_platform_.IsScreenReaderActive()) {
  620      if (discover_at_callback_for_testing_) {
  621        discover_at_callback_for_testing_.Run();
  622        return;
  623      }
  624      RefreshAssistiveTechIfNecessary(GetAccessibilityMode());
  625    }
  626  }
```

**`content/browser/accessibility/browser_accessibility_state_impl.cc` lines 638 to 660** (SHA-256 `6f6ef3c881adf77cf91b0132563cf034dacd91bc66801d04fef505105a0c7e03`). A web contents created later takes the process mode.

```
  638  void BrowserAccessibilityStateImpl::OnWebContentsInitialized(
  639      WebContentsImpl* web_contents) {
  640    const ui::AXMode effective_mode = FilterAccessibilityModeInvariants(
  641        GetAccessibilityMode() |
  642        ModeCollectionForTarget::GetAccessibilityMode(
  643            web_contents->GetBrowserContext()) |
  644        ui::AXMode());
  645  
  646    // Return early to avoid activating the field trial when accessibility is not
  647    // enabled.
  648    if (effective_mode.is_mode_off()) {
  649      return;
  650    }
  651  
  652    // Do not set any initial accessibility mode if the WebContents is initially
  653    // hidden.
  654    if (web_contents->GetVisibility() == Visibility::HIDDEN) {
  655      return;
  656    }
  657  
  658    web_contents->SetAccessibilityMode(effective_mode);
  659  }
  660  
```

**`content/browser/accessibility/browser_accessibility_state_impl.cc` lines 821 to 835** (SHA-256 `6f6ef3c881adf77cf91b0132563cf034dacd91bc66801d04fef505105a0c7e03`). A mode change goes to every web contents (a hidden one when it is shown).

```
  821    // Combine the new mode for the process with the effective mode for each
  822    // WebContents and its associated BrowserContext.
  823    std::ranges::for_each(
  824        WebContentsImpl::GetAllWebContents(),
  825        [this, new_mode](WebContentsImpl* web_contents) {
  826          if (!web_contents->IsBeingDestroyed() &&
  827              !web_contents->IsNeverComposited()) {
  828            ApplyAccessibilityModeToWebContents(
  829                web_contents, new_mode,
  830                ModeCollectionForTarget::GetAccessibilityMode(
  831                    web_contents->GetBrowserContext()),
  832                ModeCollectionForTarget::GetAccessibilityMode(web_contents));
  833          }
  834        });
  835  
```

**`content/browser/accessibility/browser_accessibility_state_impl.cc` lines 846 to 854** (SHA-256 `6f6ef3c881adf77cf91b0132563cf034dacd91bc66801d04fef505105a0c7e03`). What the two disabling switches do to a platform request.

```
  846  ui::AXMode BrowserAccessibilityStateImpl::FilterModeFlags(ui::AXMode mode) {
  847    if (activation_from_platform_enabled_ && allow_ax_mode_changes_) {
  848      // Allow mode changes with kFromPlatform, but filter out that one bit.
  849      // It need not be sent to renderers.
  850      return mode & ~ui::AXMode(ui::AXMode::kFromPlatform);
  851    }
  852    // Otherwise, ignore any mode change with `kFromPlatform`.
  853    return mode.has_mode(ui::AXMode::kFromPlatform) ? ui::AXMode() : mode;
  854  }
```

**`content/browser/accessibility/browser_accessibility_state_impl_auralinux.cc` lines 39 to 52** (SHA-256 `56221d5669446d7dc37244bc5afae462e2de45723c1b0442e1f13d9ff22ac8d9`). What counts as Orca: an argument `orca`, or the process name `orca`.

```
   39  bool IsOrcaProcess(std::string_view cmdline_all, std::string_view comm) {
   40    std::string cmdline;
   41    std::stringstream ss{std::string(cmdline_all)};
   42    while (std::getline(ss, cmdline, '\0')) {
   43      if (cmdline == "orca") {
   44        return true;  // Orca was found
   45      }
   46    }
   47  
   48    // When python-setproctitle is unavailable, Orca uses ctypes to call prctl()
   49    // with PR_SET_NAME (defined as 15 in <sys/prctl.h>). PR_SET_NAME updates
   50    // /proc/<pid>/comm, but not /proc/<pid>/cmdline.
   51    return comm == "orca";
   52  }
```

**`content/browser/accessibility/browser_accessibility_state_impl_auralinux.cc` lines 145 to 169** (SHA-256 `56221d5669446d7dc37244bc5afae462e2de45723c1b0442e1f13d9ff22ac8d9`). When the scan for Orca runs: when kExtendedProperties is added to or removed from the mode.

```
  145  void BrowserAccessibilityStateImplAuralinux::RefreshAssistiveTechIfNecessary(
  146      ui::AXMode new_mode) {
  147    bool was_screen_reader_active = ax_platform().IsScreenReaderActive();
  148    bool has_screen_reader_mode = new_mode.has_mode(ui::AXMode::kScreenReader);
  149    if (was_screen_reader_active != has_screen_reader_mode) {
  150      OnAssistiveTechFound(has_screen_reader_mode
  151                               ? ui::AssistiveTech::kGenericScreenReader
  152                               : ui::AssistiveTech::kNone);
  153      return;
  154    }
  155  
  156    // An expensive check is required to determine which type of assistive tech is
  157    // in use. Make this check only when `kExtendedProperties` is added or removed
  158    // from the process-wide mode flags and no previous assistive tech has been
  159    // discovered (in the former case) or one had been discovered (in the latter
  160    // case). `kScreenReader` will be added/removed from the process-wide mode
  161    // flags on completion and `OnAssistiveTechFound()` will be called with the
  162    // results of the check.
  163    bool has_extended_properties =
  164        new_mode.has_mode(ui::AXMode::kExtendedProperties);
  165    if (was_screen_reader_active != has_extended_properties) {
  166      // Perform expensive assistive tech detection.
  167      RefreshAssistiveTech();
  168    }
  169  }
```

**`content/browser/accessibility/browser_accessibility_state_impl_auralinux.cc` lines 186 to 198** (SHA-256 `56221d5669446d7dc37244bc5afae462e2de45723c1b0442e1f13d9ff22ac8d9`). What finding Orca adds: kAXModeComplete and kScreenReader.

```
  186    if (is_orca_active) {
  187      base::debug::SetCrashKeyString(ax_orca_crash_key, "true");
  188      OnAssistiveTechFound(ui::AssistiveTech::kOrca);
  189      if (!screen_reader_mode_) {
  190        screen_reader_mode_ = CreateScopedModeForProcess(
  191            ui::kAXModeComplete | ui::AXMode::kScreenReader |
  192            ui::AXMode::kFromPlatform);
  193      }
  194    } else {
  195      base::debug::ClearCrashKeyString(ax_orca_crash_key);
  196      OnAssistiveTechFound(ui::AssistiveTech::kNone);
  197      screen_reader_mode_.reset();
  198    }
```

**`ui/accessibility/ax_mode.h` lines 236 to 252** (SHA-256 `29661cc76a2d7141bad6796f9b8cedf22d3bea5878e68cff81bab47e67759a16`). The bundles: kAXModeBasic, kAXModeComplete.

```
  236  // Used when an AT that only require basic accessibility information, such as
  237  // a dictation tool, is present.
  238  inline constexpr AXMode kAXModeBasic(AXMode::kNativeAPIs |
  239                                       AXMode::kWebContents);
  240  
  241  // Used when complete accessibility access is desired but a third-party AT is
  242  // not present.
  243  inline constexpr AXMode kAXModeWebContentsOnly(AXMode::kWebContents |
  244                                                 AXMode::kInlineTextBoxes |
  245                                                 AXMode::kExtendedProperties);
  246  
  247  // Used when an AT that requires full accessibility access, such as a screen
  248  // reader, is present.
  249  inline constexpr AXMode kAXModeComplete(AXMode::kNativeAPIs |
  250                                          AXMode::kWebContents |
  251                                          AXMode::kInlineTextBoxes |
  252                                          AXMode::kExtendedProperties);
```

**`ui/accessibility/ax_mode.h` lines 261 to 264** (SHA-256 `29661cc76a2d7141bad6796f9b8cedf22d3bea5878e68cff81bab47e67759a16`). What a mode without the screen-reader flag may leave out.

```
  261  // The default for tests is to include kScreenReader mode, ensuring that the
  262  // entire tree is built, rather than the default for API consumers, which
  263  // assumes there is no screen reader present, enabling optimizations such as
  264  // removal of AXNodes that are not currently relevant.
```

## Electron v44.9.0 (git clone --depth 1 --branch v44.9.0 https://github.com/electron/electron, fd148b9)

**`shell/browser/native_window_views.cc` lines 324 to 327** (SHA-256 `b3764069c03484707ff4d5f64c7a879bd8e6167137b3a0edb14b523604bb0c43`). The window role Electron gives its windows.

```
  324    const std::string name = app_id.value_or(Browser::Get()->GetName());
  325    // Set WM_WINDOW_ROLE.
  326    params.wm_role_name = "browser-window";
  327    // Set WM_CLASS.
```

**`shell/browser/api/electron_api_app.cc` lines 1205 to 1209** (SHA-256 `938406b8513eb7b8cd796c5e6854ffac19112f80eaa63bf1e026ea041d814c40`). `app.isAccessibilitySupportEnabled()` is true only with all of kAXModeComplete.

```
 1205  bool App::IsAccessibilitySupportEnabled() {
 1206    auto* ax_state = content::BrowserAccessibilityState::GetInstance();
 1207    auto mode = ax_state->GetAccessibilityMode();
 1208    return mode.has_mode(ui::kAXModeComplete.flags());
 1209  }
```

**`shell/browser/api/electron_api_app.cc` lines 1292 to 1309** (SHA-256 `938406b8513eb7b8cd796c5e6854ffac19112f80eaa63bf1e026ea041d814c40`). `app.setAccessibilitySupportEnabled` is not limited to macOS and Windows in the code (docs/api/app.md marks it so).

```
 1292  void App::SetAccessibilitySupportEnabled(gin_helper::ErrorThrower thrower,
 1293                                           bool enabled) {
 1294    if (!Browser::Get()->is_ready()) {
 1295      thrower.ThrowError(
 1296          "app.setAccessibilitySupportEnabled() can only be called "
 1297          "after app is ready");
 1298      return;
 1299    }
 1300  
 1301    if (!enabled) {
 1302      scoped_accessibility_mode_.reset();
 1303    } else if (!scoped_accessibility_mode_) {
 1304      scoped_accessibility_mode_ =
 1305          content::BrowserAccessibilityState::GetInstance()
 1306              ->CreateScopedModeForProcess(ui::kAXModeComplete);
 1307    }
 1308    Browser::Get()->OnAccessibilitySupportChanged();
 1309  }
```

## at-spi2-core 2.52.0, this host's (https://gitlab.gnome.org/GNOME/at-spi2-core/-/raw/AT_SPI2_CORE_2_52_0/bus/at-spi-bus-launcher.c)

**`at-spi-bus-launcher.c` lines 654 to 669** (SHA-256 `08583d7655298336c667bd85bed6dd336d75c89df147844940d6476cc7dafc5e`). `IsEnabled` is GSettings `org.gnome.desktop.interface` `toolkit-accessibility`: a set writes the key.

```
  654  static void
  655  handle_a11y_enabled_change (A11yBusLauncher *app, gboolean enabled, gboolean notify_gsettings)
  656  {
  657    GVariantBuilder builder;
  658    GVariantBuilder invalidated_builder;
  659  
  660    if (enabled == app->a11y_enabled)
  661      return;
  662  
  663    app->a11y_enabled = enabled;
  664  
  665    if (notify_gsettings && app->interface_schema)
  666      {
  667        g_settings_set_boolean (app->interface_schema, "toolkit-accessibility",
  668                                enabled);
  669        g_settings_sync ();
```

**`at-spi-bus-launcher.c` lines 689 to 711** (SHA-256 `08583d7655298336c667bd85bed6dd336d75c89df147844940d6476cc7dafc5e`). Setting `ScreenReaderEnabled` sets `IsEnabled` too, and writes `org.gnome.desktop.a11y.applications` `screen-reader-enabled`.

```
  689  static void
  690  handle_screen_reader_enabled_change (A11yBusLauncher *app, gboolean enabled, gboolean notify_gsettings)
  691  {
  692    GVariantBuilder builder;
  693    GVariantBuilder invalidated_builder;
  694  
  695    if (enabled == app->screen_reader_enabled)
  696      return;
  697  
  698    /* If the screen reader is being enabled, we should enable accessibility
  699     * if it isn't enabled already */
  700    if (enabled)
  701      handle_a11y_enabled_change (app, enabled, notify_gsettings);
  702  
  703    app->screen_reader_enabled = enabled;
  704  
  705    if (notify_gsettings && app->a11y_schema)
  706      {
  707        g_settings_set_boolean (app->a11y_schema, "screen-reader-enabled",
  708                                enabled);
  709        g_settings_sync ();
  710      }
  711  
```

**`at-spi-bus-launcher.c` lines 961 to 973** (SHA-256 `08583d7655298336c667bd85bed6dd336d75c89df147844940d6476cc7dafc5e`). Both start from the keys.

```
  961    if (!a11y_set)
  962      {
  963        _global_app->a11y_enabled = _global_app->interface_schema
  964                                        ? g_settings_get_boolean (_global_app->interface_schema, "toolkit-accessibility")
  965                                        : _global_app->launch_immediately;
  966      }
  967  
  968    if (!screen_reader_set)
  969      {
  970        _global_app->screen_reader_enabled = _global_app->a11y_schema
  971                                                 ? g_settings_get_boolean (_global_app->a11y_schema, "screen-reader-enabled")
  972                                                 : FALSE;
  973      }
```

## Orca, main as fetched 2026-11-27 (https://gitlab.gnome.org/GNOME/orca/-/raw/main/orca-autostart.desktop.in)

**`orca-autostart.desktop.in` lines 1 to 10** (SHA-256 `16f4c14cc061140430e9e7c527577f8980720769a9dab2ca7a16674a32d44649`). A GNOME, MATE, Unity or Cinnamon session starts Orca when `screen-reader-enabled` turns true.

```
    1  [Desktop Entry]
    2  Type=Application
    3  Name=Orca Screen Reader
    4  Exec=orca --replace
    5  NoDisplay=true
    6  AutostartCondition=GSettings org.gnome.desktop.a11y.applications screen-reader-enabled
    7  X-GNOME-AutoRestart=true
    8  #X-GNOME-Autostart-Phase=Initialization
    9  OnlyShowIn=GNOME;MATE;Unity;Cinnamon;
   10  X-systemd-skip=true
```

## The same two things at other Chromium releases

What `AtkGetAttributes` (and `AtkRefRelationSet`, the same line in each) adds to the mode, and what the bridge's start checks, read from
`ui/accessibility/platform/ax_platform_node_auralinux.cc` and `atk_util_auralinux.cc` at each tag (the two files' SHA-256, first 12 digits).
Electron embeds Chromium 108 in 22.3.27, 128 in 32.3.0, 136 in 36.0.0, 138 in 37.0.0 and 152 in 44.9.0 (`out/versions.jsonl`); 87 in Electron 11 and 112 in
Electron 24 are from Electron's release notes, not probed.

| Chromium | the two requests add | the bridge's start checks | files |
|---|---|---|---|
| 80.0.3987.87 | none | the variables | `83f4960e8aeb`, `12e568c1aa69` |
| 86.0.4240.75 | kAXModeComplete (`EnableAXMode`) | the variables | `c1875a32742b`, `237611d0e7c8` |
| 90.0.4430.72 | kAXModeComplete (`EnableAXMode`) | the variables | `806c04493fec`, `7180c676bea8` |
| 100.0.4896.60 | kAXModeComplete (`EnableAXMode`) | the variables | `d9ee0abc0ae2`, `7180c676bea8` |
| 110.0.5481.77 | kAXModeComplete (`EnableAXMode`) | the variables | `f5ff39c33296`, `6d02fb6314e6` |
| 112.0.5615.49 | kAXModeComplete (`EnableAXMode`) | the variables, `IsEnabled`, GSettings | `d383a0c68f4e`, `dc569375f8fa` |
| 114.0.5735.90 | kAXModeComplete (`EnableAXMode`) | the variables, `IsEnabled`, GSettings | `2f8b4cb63b02`, `dc569375f8fa` |
| 120.0.6099.71 | kAXModeComplete (`EnableAXMode`) | the variables, `IsEnabled`, GSettings | `396822c892c9`, `dc569375f8fa` |
| 128.0.6613.84 | kAXModeComplete (`EnableAXMode`) | the variables, `IsEnabled`, GSettings | `90546de74a8a`, `aff7e94d443f` |
| 134.0.6998.35 | kAXModeComplete (`EnableAXMode`) | the variables, `IsEnabled`, GSettings | `a3d3d9e05e7b`, `9844f2664aab` |
| 136.0.7103.59 | kAXModeComplete (`EnableAXMode`) | the variables, `IsEnabled`, GSettings | `7306ec09a5e7`, `9844f2664aab` |
| 138.0.7204.49 | kAXModeBasic and kExtendedProperties (`OnExtendedPropertiesUsedInWebContent`) | the variables, `IsEnabled`, GSettings | `20531d2a4dd0`, `ae73afdecec2` |
| 142.0.7444.59 | kAXModeBasic and kExtendedProperties (`OnExtendedPropertiesUsedInWebContent`) | the variables, `IsEnabled`, GSettings | `3499a7c1eb1f`, `ae73afdecec2` |
| 146.0.7680.65 | kAXModeBasic and kExtendedProperties (`OnExtendedPropertiesUsedInWebContent`) | the variables, `IsEnabled`, GSettings | `2de73d3aae7a`, `ae73afdecec2` |
| 150.0.7871.46 | kAXModeBasic and kExtendedProperties (`OnExtendedPropertiesUsedInWebContent`) | the variables, `IsEnabled`, GSettings | `1d50dc6645c0`, `ae73afdecec2` |
| 152.0.7977.167 | kAXModeBasic and kExtendedProperties (`OnExtendedPropertiesUsedInWebContent`) | the variables, `IsEnabled`, GSettings | `ea0eca6d0ec6`, `ae73afdecec2` |
