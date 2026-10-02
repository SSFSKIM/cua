// Secret labels: [A-Za-z0-9][A-Za-z0-9._-]{0,127}. A label names a Keychain item (service "cua.secrets", account =
// label); it is metadata, never a value. The same rule is enforced in src/secrets/label.mjs.
public enum Label {
  public static let maxLength = 128

  public static func isValid(_ label: String) -> Bool {
    let bytes = Array(label.utf8)
    guard !bytes.isEmpty, bytes.count <= maxLength, isAlphanumeric(bytes[0]) else { return false }
    return bytes.allSatisfy { isAlphanumeric($0) || $0 == UInt8(ascii: ".") || $0 == UInt8(ascii: "_") || $0 == UInt8(ascii: "-") }
  }

  private static func isAlphanumeric(_ b: UInt8) -> Bool {
    (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a)
  }
}
