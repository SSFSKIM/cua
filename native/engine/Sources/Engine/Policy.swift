import Foundation

// The engine's copy of the forbidden list (the spec's Design, "Socket and peer check" and "The service", Policy): the
// engine refuses these on resolve_app and every app-scoped request, whoever the client is. The ids are the vendor's
// (R/E-helper-catalogue.md §6.1; R/A-contract.md §7). For the M0 spike the list is written here by hand; from M1a it is
// generated from src/services/engine/policy.mjs into Policy.generated.swift, which replaces this file.
enum Policy {
  /// System security processes: the vendor's own sentence names them as such.
  static let systemSecurity: Set<String> = [
    "com.apple.usernotificationcenter",
    "com.apple.localauthenticationremoteservice",
    "com.apple.securityagent",
  ]

  /// Password managers and the keychain, and iPhone Mirroring.
  static let forbidden: Set<String> = [
    "com.apple.keychainaccess",
    "com.apple.passwords",
    "com.1password.1password",
    "com.1password.safari",
    "com.bitwarden.desktop",
    "com.dashlane.dashlanephonefinal",
    "com.lastpass.lastpass",
    "com.nordsec.nordpass",
    "me.proton.pass.electron",
    "me.proton.pass.catalyst",
    "com.apple.screencontinuity",
  ]

  /// Throws `appNotAllowed` when `bundleIdentifier` is on either list (bundle ids compare case-insensitively).
  static func check(_ bundleIdentifier: String?) throws {
    guard let id = bundleIdentifier?.lowercased() else { return }
    if systemSecurity.contains(id) {
      throw EngineError(.appNotAllowed, "Computer use actions are not allowed for system security process: \(bundleIdentifier!)")
    }
    if forbidden.contains(id) {
      throw EngineError(.appNotAllowed, "Computer Use is not allowed to use the app '\(bundleIdentifier!)' for safety reasons.")
    }
  }
}
