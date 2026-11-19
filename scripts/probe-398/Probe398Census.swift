import ApplicationServices
import Foundation

// #398 census instrumentation (scripts/probe-398/patch-census.mjs copies this file into a disposable worktree of main;
// never a product build). On every committed observation, when PROBE398_CENSUS=1, one stderr line
// {"probe398Census": {...}} says, for the text fields of the observed window, which pairs the engine's own identity match
// (`ElementIdentity.matches`, patched with `ignoringPlaceholder`) separates only by their placeholder, and which it cannot
// separate at all. Only roles, subroles and the shape of each attribute (absent, empty or set) leave the engine: never an
// attribute's text.

private let probe398Enabled = ProcessInfo.processInfo.environment["PROBE398_CENSUS"] == "1"
let probe398TextRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXSecureTextField"]
private let probe398PairCap = 200

/// An attribute's shape: absent, empty (or whitespace only) or set.
private func probe398Shape(_ s: String?) -> String {
  guard let s else { return "nil" }
  return s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "empty" : "set"
}

/// A value's shape as the identity holds it ("s:" is the empty string; `identityValue`).
private func probe398ValueShape(_ v: String?) -> String {
  guard let v else { return "nil" }
  return v == "s:" ? "empty" : "set"
}

private func probe398Field(_ i: ElementIdentity) -> [String: Any] {
  [
    "role": i.role, "subrole": i.subrole ?? NSNull(),
    "roleDescription": probe398Shape(i.roleDescription), "title": probe398Shape(i.title), "value": probe398ValueShape(i.value),
    "valueDescription": probe398Shape(i.valueDescription), "description": probe398Shape(i.description),
    "placeholder": probe398Shape(i.placeholder), "help": probe398Shape(i.help), "identifier": probe398Shape(i.identifier),
    "url": probe398Shape(i.url), "secure": i.secure, "valueUnread": i.valueUnread,
  ]
}

func probe398Census(_ revision: Revision, number: Int) {
  guard probe398Enabled else { return }
  var parent: [Int: Int] = [:]
  for (p, kids) in revision.children { for k in kids { parent[k] = p } }
  let menu = Set(revision.menu)
  func chain(_ n: Int) -> [Int] {
    var out: [Int] = []
    var at = parent[n]
    while let p = at, out.count < 128 { out.append(p); at = parent[p] }
    return out
  }
  let fields = revision.entries.filter { !menu.contains($0.key) && probe398TextRoles.contains($0.value.identity.role) }
    .sorted { $0.key < $1.key }
  var roles: [String: Int] = [:]
  var withPlaceholder = 0
  for (_, e) in fields {
    roles[e.identity.role, default: 0] += 1
    if probe398Shape(e.identity.placeholder) == "set" { withPlaceholder += 1 }
  }
  var counts: [String: Int] = ["pairs": 0, "placeholderOnly": 0, "identical": 0, "placeholderOnlyIgnoringValue": 0,
                               "identicalIgnoringValue": 0, "placeholderOnlyAncestryAlike": 0, "identicalAncestryAlike": 0,
                               "placeholderOnlyIgnoringValueAncestryAlike": 0, "identicalIgnoringValueAncestryAlike": 0]
  var pairs: [[String: Any]] = []
  for i in 0..<fields.count {
    for j in (i + 1)..<fields.count {
      let (na, a) = fields[i], (nb, b) = fields[j]
      counts["pairs", default: 0] += 1
      let strict = a.identity.matches(b.identity)
      let noPlaceholder = a.identity.matches(b.identity, ignoringPlaceholder: true)
      let strictIV = a.identity.matches(b.identity, ignoringValue: true)
      let noPlaceholderIV = a.identity.matches(b.identity, ignoringValue: true, ignoringPlaceholder: true)
      guard noPlaceholder || noPlaceholderIV else { continue }
      // Their lineage of parents: alike when every ancestor, level by level, matches its counterpart (value left out).
      let ca = chain(na), cb = chain(nb)
      let ancestryAlike = ca.count == cb.count && zip(ca, cb).allSatisfy { x, y in
        guard let ex = revision.entries[x], let ey = revision.entries[y] else { return false }
        return x == y || ex.identity.matches(ey.identity, ignoringValue: true)
      }
      let common = Set(ca).intersection(cb)
      let distanceA = ca.firstIndex { common.contains($0) }.map { $0 + 1 } ?? -1
      let distanceB = cb.firstIndex { common.contains($0) }.map { $0 + 1 } ?? -1
      func tally(_ key: String, _ on: Bool) {
        guard on else { return }
        counts[key, default: 0] += 1
        if ancestryAlike { counts[key + "AncestryAlike", default: 0] += 1 }
      }
      tally("placeholderOnly", noPlaceholder && !strict)
      tally("identical", strict)
      tally("placeholderOnlyIgnoringValue", noPlaceholderIV && !strictIV)
      tally("identicalIgnoringValue", strictIV)
      if pairs.count < probe398PairCap {
        pairs.append(["a": probe398Field(a.identity), "b": probe398Field(b.identity), "strict": strict, "noPlaceholder": noPlaceholder,
                      "strictIgnoringValue": strictIV, "noPlaceholderIgnoringValue": noPlaceholderIV,
                      "sameParent": parent[na] != nil && parent[na] == parent[nb], "ancestryAlike": ancestryAlike,
                      "commonAncestorDistance": [distanceA, distanceB]])
      }
    }
  }
  let record: [String: Any] = ["probe398Census": [
    "revision": number, "entries": revision.entries.count, "fields": fields.count, "fieldsWithPlaceholder": withPlaceholder,
    "roles": roles, "counts": counts, "pairs": pairs, "pairsTruncated": pairs.count >= probe398PairCap,
  ]]
  guard let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) else { return }
  FileHandle.standardError.write(data + Data("\n".utf8))
}
