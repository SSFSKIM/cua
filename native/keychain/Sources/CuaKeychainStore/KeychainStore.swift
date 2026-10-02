// Production storage: generic-password items in the user's Keychain, service "cua.secrets", account = label, through
// the Security SecItem API. Items are created by this helper, so the Keychain's access list trusts this helper's code
// identity: an ad-hoc signed development build is trusted only as that exact build (a rebuild may prompt for access),
// a stable signing identity keeps the trust across rebuilds. The helper never falls back to any other storage.
import Foundation
import Security
import CuaKeychainCore

public final class KeychainStore: SecretStore {
  public static let service = "cua.secrets"

  public init() {}

  private func item(_ label: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service, kSecAttrAccount as String: label]
  }

  public func labels() throws -> [String] {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service,
      kSecMatchLimit as String: kSecMatchLimitAll, kSecReturnAttributes as String: true,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return [] }
    try check(status)
    let items = result as? [[String: Any]] ?? []
    return Array(Set(items.compactMap { $0[kSecAttrAccount as String] as? String }))
  }

  public func read(_ label: String) throws -> [UInt8] {
    var query = item(label)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    try check(SecItemCopyMatching(query as CFDictionary, &result))
    guard let data = result as? Data else { throw StoreError.unavailable(errSecInternalError) }
    return Array(data)
  }

  public func write(_ label: String, _ value: [UInt8]) throws -> WriteOutcome {
    let data = Data(value)
    let updated = SecItemUpdate(item(label) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if updated == errSecSuccess { return .replaced }
    guard updated == errSecItemNotFound else { try check(updated); return .replaced }
    var add = item(label)
    add[kSecValueData as String] = data
    add[kSecAttrLabel as String] = "cua secret: \(label)"
    add[kSecAttrDescription as String] = "cua computer-use secret"
    try check(SecItemAdd(add as CFDictionary, nil))
    return .created
  }

  public func exists(_ label: String) throws -> Bool {
    var query = item(label)
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return false }
    try check(status)
    return true
  }

  public func delete(_ label: String) throws {
    try check(SecItemDelete(item(label) as CFDictionary))
  }

  private func check(_ status: OSStatus) throws {
    switch status {
    case errSecSuccess: return
    case errSecItemNotFound: throw StoreError.notFound
    case errSecUserCanceled, errSecAuthFailed: throw StoreError.denied
    case errSecInteractionNotAllowed: throw StoreError.locked
    default: throw StoreError.unavailable(status)
    }
  }
}
