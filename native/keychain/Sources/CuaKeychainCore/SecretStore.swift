// Storage behind the helper. Production uses the Keychain (CuaKeychainStore); tests inject in-memory storage from the
// test-owned CuaKeychainTestSupport target, which the production executable does not link. There is deliberately no
// file or plaintext implementation.
public enum StoreError: Error, Equatable, Sendable {
  case notFound
  /// The user or the system refused access (a declined prompt, an ACL that does not trust this helper).
  case denied
  /// The vault is locked and could not be unlocked without interaction.
  case locked
  /// Any other storage failure, with its OSStatus for diagnostics (never a value).
  case unavailable(Int32)

  public var code: String {
    switch self {
    case .notFound: return "not_found"
    case .denied: return "denied"
    case .locked: return "locked"
    case .unavailable: return "unavailable"
    }
  }
}

public enum WriteOutcome: Equatable, Sendable { case created, replaced }

public protocol SecretStore: AnyObject {
  /// Every stored label, never values.
  func labels() throws -> [String]
  func read(_ label: String) throws -> [UInt8]
  /// Creates or replaces the value.
  func write(_ label: String, _ value: [UInt8]) throws -> WriteOutcome
  func exists(_ label: String) throws -> Bool
  /// Deletes exactly this label's item; `notFound` if there is none.
  func delete(_ label: String) throws
}
