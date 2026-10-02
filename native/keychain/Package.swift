// swift-tools-version:6.0
// The cua Keychain helper. `npm run build:helper` builds only the production product, `cua-keychain` (Keychain
// storage, hidden terminal input, the per-connection secret broker). Everything named *TestSupport/testhost/pty is
// test-owned: in-memory storage and pseudo-terminal driving for `npm run test:helper` and the opt-in live Keychain
// fixture. The production product does not link it, so test storage can never serve a production request.
import PackageDescription

let package = Package(
  name: "CuaKeychain",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "cua-keychain", targets: ["cua-keychain"]),
    .executable(name: "cua-keychain-testhost", targets: ["cua-keychain-testhost"]),
    .executable(name: "cua-keychain-pty", targets: ["cua-keychain-pty"]),
  ],
  targets: [
    .target(name: "CuaKeychainCore"),
    .target(name: "CuaKeychainStore", dependencies: ["CuaKeychainCore"], linkerSettings: [.linkedFramework("Security")]),
    .executableTarget(name: "cua-keychain", dependencies: ["CuaKeychainCore", "CuaKeychainStore"]),
    .target(name: "CuaKeychainTestSupport", dependencies: ["CuaKeychainCore"]),
    .executableTarget(name: "cua-keychain-testhost", dependencies: ["CuaKeychainCore", "CuaKeychainTestSupport"]),
    .executableTarget(name: "cua-keychain-pty", dependencies: ["CuaKeychainTestSupport"]),
    .testTarget(name: "CuaKeychainTests", dependencies: ["CuaKeychainCore", "CuaKeychainTestSupport"]),
  ],
  swiftLanguageModes: [.v5]
)
