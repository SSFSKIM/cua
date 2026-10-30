// swift-tools-version:6.0
// cua's own macOS native engine, `cua-engine` inside `cua Engine.app` (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Design "The engine"). Apple frameworks only: no package dependencies, by the owner's ruling against unvetted third-party
// code; Apple SPI, where input needs it, is resolved at run time with dlsym and feature-detected, never linked.
import PackageDescription

let package = Package(
  name: "cua-engine",
  platforms: [.macOS(.v14)],
  products: [.executable(name: "cua-engine", targets: ["Engine"])],
  targets: [
    .executableTarget(
      name: "Engine",
      path: "Sources/Engine",
      linkerSettings: [
        .linkedFramework("ApplicationServices"),
        .linkedFramework("AppKit"),
        .linkedFramework("Carbon"),
        .linkedFramework("CoreGraphics"),
        .linkedFramework("ScreenCaptureKit"),
      ]
    ),
    // Fixtures (the cursor motion's reference vectors and the script that made them) are read by path, not built.
    .testTarget(name: "EngineTests", dependencies: ["Engine"], path: "Tests/EngineTests", exclude: ["Fixtures"]),
  ],
  swiftLanguageModes: [.v6]
)
