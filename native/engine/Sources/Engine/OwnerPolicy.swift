import AppKit
import Darwin
import Foundation

// The forbidden list on the process input reaches (the spec's Design, "Input": "the engine checks that owning pid
// against the forbidden list before posting anything, so a panel served by a forbidden process (a password manager's
// autofill) is refused with the forbidden-app sentence even when the bound app is allowed"). A process is named by its
// own bundle id and by every bundle its executable lives in, so a helper or XPC service inside a forbidden app (an
// autofill helper under its password manager's .app) is refused by the app's id. The list itself is Policy's.

/// The bundles enclosing an executable, innermost first: every ancestor directory that is an app, app extension, XPC
/// service or loadable bundle. Frameworks are passed over; they are code a process loads, not what it is.
func enclosingBundlePaths(ofExecutable path: String) -> [String] {
  var paths: [String] = []
  var directory = (path as NSString).deletingLastPathComponent
  while directory != "/" && !directory.isEmpty {
    if ["app", "appex", "xpc", "bundle"].contains((directory as NSString).pathExtension) { paths.append(directory) }
    directory = (directory as NSString).deletingLastPathComponent
  }
  return paths
}

/// A process's executable path (`proc_pidpath`); nil when it cannot be read.
func executablePath(of pid: pid_t) -> String? {
  var buffer = [UInt8](repeating: 0, count: 4 * Int(MAXPATHLEN))
  let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
  guard length > 0 else { return nil }
  return String(decoding: buffer.prefix(Int(length)), as: UTF8.self)
}

/// Every bundle id a process answers to, deduplicated, innermost first: its running application's, then those of the
/// bundles its executable lives in.
func owningBundleIdentifiers(_ pid: pid_t,
                             runningIdentifier: (pid_t) -> String? = { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier },
                             executablePath: (pid_t) -> String? = executablePath(of:),
                             bundleIdentifier: (String) -> String? = { Bundle(path: $0)?.bundleIdentifier }) -> [String] {
  var identifiers: [String] = []
  for id in [runningIdentifier(pid)] + (executablePath(pid).map(enclosingBundlePaths(ofExecutable:)) ?? []).map(bundleIdentifier) {
    if let id, !identifiers.contains(id) { identifiers.append(id) }
  }
  return identifiers
}

/// Refuses input whose target is served by a process on the forbidden list, with Policy's sentence for the first id
/// that matches; nothing is posted before this runs.
func refuseForbiddenOwner(_ pid: pid_t, identifiers: (pid_t) -> [String] = { owningBundleIdentifiers($0) }) throws {
  for id in identifiers(pid) { try Policy.check(id) }
}
