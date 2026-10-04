// Test-owned: the production command router and broker over in-memory storage, for `npm run test:helper`. Never
// located or started by cua itself. CUA_KEYCHAIN_TESTHOST_SEED ({label: value}) and CUA_KEYCHAIN_TESTHOST_FAIL
// ({label: "denied"|"locked"|"unavailable"}) set up the in-memory state; nothing persists past the process.
import Foundation
import CuaKeychainCore
import CuaKeychainTestSupport

let environment = ProcessInfo.processInfo.environment
func object(_ name: String) -> [String: String] {
  guard let text = environment[name], let data = text.data(using: .utf8),
        let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] else { return [:] }
  return parsed
}
let store = MemoryStore(object("CUA_KEYCHAIN_TESTHOST_SEED"))
for (label, failure) in object("CUA_KEYCHAIN_TESTHOST_FAIL") {
  switch failure {
  case "denied": store.failures[label] = .denied
  case "locked": store.failures[label] = .locked
  default: store.failures[label] = .unavailable(-25291)
  }
}
exit(helperMain(Array(CommandLine.arguments.dropFirst()), store: store))
