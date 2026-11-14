import Foundation

/// The wire's version: a client whose `ping` names another is refused (`incompatibleClientVersion`).
let serverApiVersion = "cua-engine-1"

/// The package's version. The assembler (`src/runtime/engine-bundle.mjs`, `cua engine build`) reads it from this line
/// for the bundle's CFBundleShortVersionString, so the two can never disagree.
let engineVersion = "0.1.0"

/// The Info.plist key the assembler embeds `build` under: the hash of the native/engine source tree plus the assembler,
/// so two bundles with the same `build` are the same program.
let buildInfoKey = "CUAEngineBuild"

/// `build` as the running executable knows it: the bundle's embedded hash, or "unbundled" for an executable run
/// outside `cua Engine.app` (a test's debug build), which has none.
let engineBuild: String = {
  guard isBundled, let build = Bundle.main.object(forInfoDictionaryKey: buildInfoKey) as? String, !build.isEmpty
  else { return "unbundled" }
  return build
}()

/// What a non-shipping build is, named in the ping's identity (`variant`); nil, and absent there, for every release.
/// The control build (`CUA_CONTROL_NO_INERT_CLICK`, `activationClickPlan`) is defined only in the #187 kit's copied
/// Package.swift, so a sitting attests the running engine's half from the engine itself.
#if CUA_CONTROL_NO_INERT_CLICK
let engineVariant: String? = "control-no-inert-click"
#else
let engineVariant: String? = nil
#endif

/// Whether this executable runs from inside an app bundle (`…/cua Engine.app/Contents/MacOS/cua-engine`).
let isBundled: Bool = Bundle.main.bundleURL.pathExtension == "app"
