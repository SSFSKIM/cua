import Testing
@testable import CuaKeychainCore

@Suite struct LabelTests {
  @Test(arguments: ["a", "Z", "0", "work-password", "a.b_c-d", "x" + String(repeating: "y", count: 127)])
  func accepts(label: String) { #expect(Label.isValid(label)) }

  @Test(arguments: ["", "-lead", ".lead", "_lead", "has space", "slash/no", "colon:no", "{{secret:x}}", "é", "x" + String(repeating: "y", count: 128), "nl\n", "nul\u{0}"])
  func rejects(label: String) { #expect(!Label.isValid(label)) }
}
