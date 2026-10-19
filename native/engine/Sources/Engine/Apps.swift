import AppKit
import Foundation

// App resolution, list_apps and launch (the spec's Design, "App resolution and launch"). The one `app` string the facade
// binds is a bundle id, a display name or a path; running regular apps match first, then LaunchServices (a bundle id)
// and the standard application folders (a name). More than one match is `ambiguousApp`, never a silent pick; none is
// `invalidApp`. resolve_app never launches; get_app_state launches a resolved app that is not running, without
// activating it.

struct ResolvedApp {
  let appPath: String
  let bundleIdentifier: String?
  let displayName: String
  let running: NSRunningApplication?

  var pid: pid_t? { running?.processIdentifier }
  var isRunning: Bool { running != nil }

  /// The lineage key: the bound path plus the process, so a relaunched app starts a new lineage.
  var key: String { "\(appPath)#\(pid ?? 0)" }

  var wire: [String: Any] {
    [
      "appPath": appPath,
      "bundleIdentifier": bundleIdentifier ?? NSNull(),
      "displayName": displayName,
      "isRunning": isRunning,
      "pid": pid.map { Int($0) } ?? NSNull(),
    ]
  }

  var appWire: [String: Any] {
    ["bundleIdentifier": bundleIdentifier ?? NSNull(), "displayName": displayName, "appPath": appPath, "pid": pid.map { Int($0) } ?? NSNull()]
  }
}

/// Resolutions by the request's own string (or `pid:<n>`), served until any app launches or terminates (NSWorkspace's
/// notifications clear it) or the cached process has ended. Only successes are kept, so an ambiguous or unknown app is
/// resolved afresh every time, and the forbidden list is checked on every hit.
final class ResolutionCache: @unchecked Sendable {
  private let lock = NSLock()
  private var entries: [String: ResolvedApp] = [:]

  /// Whether the cached process still exists (`kill(pid, 0)`, no signal sent); an app resolved while not running has
  /// no process to outlive. A relaunch that reuses the pid is caught by the launch notification.
  static func alive(_ app: ResolvedApp) -> Bool {
    guard let pid = app.pid else { return true }
    return kill(pid, 0) == 0 || errno == EPERM
  }

  func lookup(_ key: String, isAlive: (ResolvedApp) -> Bool = ResolutionCache.alive) -> ResolvedApp? {
    lock.lock()
    defer { lock.unlock() }
    guard let app = entries[key] else { return nil }
    guard isAlive(app) else {
      entries[key] = nil
      return nil
    }
    return app
  }

  func store(_ key: String, _ app: ResolvedApp) {
    lock.lock()
    defer { lock.unlock() }
    entries[key] = app
  }

  func invalidate() {
    lock.lock()
    defer { lock.unlock() }
    entries = [:]
  }
}

final class AppDirectory: @unchecked Sendable {
  private let usage: UsageStore
  let cache = ResolutionCache()
  private var observers: [NSObjectProtocol] = []

  init(usagePath: String) {
    usage = UsageStore(path: usagePath)
    // Any launch or termination can change what a string names (a second instance makes it ambiguous, a relaunch gives
    // a new process); the notifications arrive on the main run loop, which NSApplication.run keeps turning.
    let center = NSWorkspace.shared.notificationCenter
    for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
      observers.append(center.addObserver(forName: name, object: nil, queue: nil) { [cache] _ in cache.invalidate() })
    }
  }

  /// The folders a name is looked up in when no running app carries it.
  private static let folders: [String] = [
    "/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities",
    NSHomeDirectory() + "/Applications", "/System/Library/CoreServices",
  ]

  private func runningRegularApps() -> [NSRunningApplication] {
    NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular && !$0.isTerminated && $0.bundleURL != nil }
  }

  private static func standardPath(_ url: URL) -> String { url.standardizedFileURL.path }

  private static func resolved(_ app: NSRunningApplication) -> ResolvedApp {
    let path = standardPath(app.bundleURL!)
    return ResolvedApp(appPath: path, bundleIdentifier: app.bundleIdentifier,
                       displayName: app.localizedName ?? displayName(ofBundleAt: path), running: app)
  }

  private static func displayName(ofBundleAt path: String) -> String {
    let name = FileManager.default.displayName(atPath: path)
    return name.hasSuffix(".app") ? String(name.dropLast(4)) : name
  }

  private static func notRunning(_ path: String) -> ResolvedApp {
    ResolvedApp(appPath: path, bundleIdentifier: Bundle(path: path)?.bundleIdentifier, displayName: displayName(ofBundleAt: path), running: nil)
  }

  private static func ambiguous(_ app: String, _ paths: [String], kind: String) -> EngineError {
    let instead = kind == "bundle identifier" ? "an app name or full app path" : "a bundle identifier or full app path"
    return EngineError(.ambiguousApp, "Ambiguous app identifier '\(app)'. Multiple apps share this \(kind): \(paths.joined(separator: ", ")). Use \(instead) instead.")
  }

  private static func invalid(_ app: String) -> EngineError {
    EngineError(.invalidApp, "No app matches '\(app)' by bundle identifier, name or path.")
  }

  /// `resolve_app {app}` and the resolution in front of every app-scoped method; forbidden apps are refused.
  func resolve(_ app: String) throws -> ResolvedApp {
    let app = app.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !app.isEmpty else { throw EngineError.invalidArguments("app is required") }
    try Policy.check(app)
    if let cached = cache.lookup(app) {
      try Policy.check(cached.bundleIdentifier)
      return cached
    }
    let resolved = try find(app)
    try Policy.check(resolved.bundleIdentifier)
    cache.store(app, resolved)
    return resolved
  }

  /// `resolve_app {pid}`: the running app with that process id.
  func resolve(pid: pid_t) throws -> ResolvedApp {
    if let cached = cache.lookup("pid:\(pid)") {
      try Policy.check(cached.bundleIdentifier)
      return cached
    }
    guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated, app.bundleURL != nil else {
      throw EngineError(.runningApplicationNotFound, "Running application not found: \(pid)")
    }
    let resolved = Self.resolved(app)
    try Policy.check(resolved.bundleIdentifier)
    cache.store("pid:\(pid)", resolved)
    return resolved
  }

  private func find(_ app: String) throws -> ResolvedApp {
    let running = runningRegularApps()
    if app.hasPrefix("/") {
      let path = Self.standardPath(URL(fileURLWithPath: app))
      let matches = running.filter { Self.standardPath($0.bundleURL!) == path }
      if matches.count > 1 { throw Self.ambiguous(app, matches.map { "pid \($0.processIdentifier)" }, kind: "path") }
      if let only = matches.first { return Self.resolved(only) }
      var isDirectory: ObjCBool = false
      guard path.hasSuffix(".app"), FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory), isDirectory.boolValue
      else { throw Self.invalid(app) }
      return Self.notRunning(path)
    }

    let byId = running.filter { $0.bundleIdentifier?.caseInsensitiveCompare(app) == .orderedSame }
    if byId.count > 1 { throw Self.ambiguous(app, byId.map { Self.standardPath($0.bundleURL!) }, kind: "bundle identifier") }
    if let only = byId.first { return Self.resolved(only) }

    let byName = running.filter { candidate in
      candidate.localizedName?.caseInsensitiveCompare(app) == .orderedSame
        || candidate.bundleURL!.deletingPathExtension().lastPathComponent.caseInsensitiveCompare(app) == .orderedSame
    }
    if byName.count > 1 { throw Self.ambiguous(app, byName.map { Self.standardPath($0.bundleURL!) }, kind: "name") }
    if let only = byName.first { return Self.resolved(only) }

    let registered = Self.unique(NSWorkspace.shared.urlsForApplications(withBundleIdentifier: app).map { $0.path })
    if registered.count > 1 { throw Self.ambiguous(app, registered, kind: "bundle identifier") }
    if let only = registered.first { return Self.notRunning(only) }

    let named = Self.unique(Self.bundles(named: app))
    if named.count > 1 { throw Self.ambiguous(app, named, kind: "name") }
    if let only = named.first { return Self.notRunning(only) }
    throw Self.invalid(app)
  }

  /// Paths deduplicated by their real path, in first-seen order.
  private static func unique(_ paths: [String]) -> [String] {
    var seen = Set<String>()
    return paths.filter { seen.insert(URL(fileURLWithPath: $0).resolvingSymlinksInPath().path).inserted }
  }

  /// The `.app` bundles in the standard folders whose file name, or else whose localized name, is `name`.
  private static func bundles(named name: String) -> [String] {
    let bundles = folders.flatMap { folder in
      ((try? FileManager.default.contentsOfDirectory(atPath: folder)) ?? []).filter { $0.hasSuffix(".app") }.map { folder + "/" + $0 }
    }
    let byFile = bundles.filter { (($0 as NSString).lastPathComponent as NSString).deletingPathExtension.caseInsensitiveCompare(name) == .orderedSame }
    if !byFile.isEmpty { return byFile }
    return bundles.filter { displayName(ofBundleAt: $0).caseInsensitiveCompare(name) == .orderedSame }
  }

  /// Records a resolution in the usage store, which list_apps reads.
  func recordUse(_ app: ResolvedApp) { usage.record(app) }

  /// `list_apps`: every running regular app, then the apps this engine resolved before, in the facade's row shape
  /// (`{id, displayName, isRunning, lastUsedDate?, useCount?}`, R/A-contract.md §1.4).
  func list() -> [[String: Any]] {
    let used = usage.snapshot()
    var listed = Set<String>()
    var rows: [[String: Any]] = []
    for app in runningRegularApps() {
      let resolved = Self.resolved(app)
      let key = UsageStore.key(resolved.bundleIdentifier, resolved.appPath)
      listed.insert(key)
      var row: [String: Any] = ["id": resolved.bundleIdentifier ?? resolved.displayName, "displayName": resolved.displayName, "isRunning": true]
      if let entry = used[key] { row["lastUsedDate"] = entry.lastUsedDate; row["useCount"] = entry.useCount }
      rows.append(row)
    }
    for (key, entry) in used.sorted(by: { $0.value.lastUsedDate > $1.value.lastUsedDate }) where !listed.contains(key) {
      rows.append(["id": entry.bundleIdentifier ?? entry.displayName, "displayName": entry.displayName, "isRunning": false,
                   "lastUsedDate": entry.lastUsedDate, "useCount": entry.useCount])
    }
    return rows
  }

  /// Launches a resolved app that is not running, without activating it, and returns its process; a launch that does
  /// not finish by `deadline` (Unix ms) is `timeoutReached`, as the vendor's.
  func launch(_ app: ResolvedApp, deadline: Int64) throws -> NSRunningApplication {
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    configuration.addsToRecentItems = false
    configuration.promptsUserIfNeeded = false
    let box = Box<Result<NSRunningApplication, Error>>()
    let done = DispatchSemaphore(value: 0)
    NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: app.appPath), configuration: configuration) { running, error in
      box.value = running.map { .success($0) } ?? .failure(error ?? EngineError(name: "launchFailed", "The app did not launch"))
      done.signal()
    }
    guard done.wait(timeout: .now() + .milliseconds(Int(max(0, deadline - unixMilliseconds())))) == .success, let outcome = box.value else {
      throw EngineError(name: "timeoutReached", "timeoutReached")
    }
    switch outcome {
    case .success(let running): return running
    case .failure(let error as EngineError): throw error
    case .failure(let error): throw EngineError(name: "launchFailed", "The app could not be launched: \(error.localizedDescription)")
    }
  }
}

/// A value handed across a completion handler.
final class Box<T>: @unchecked Sendable {
  var value: T?
  init() {}
}

/// `usage.json` beside the socket: per app, its last resolution and how many times this engine resolved it, which
/// gives list_apps' `lastUsedDate` and `useCount` cua's meaning.
final class UsageStore: @unchecked Sendable {
  struct Entry {
    var appPath: String
    var bundleIdentifier: String?
    var displayName: String
    var lastUsedDate: String
    var useCount: Int
  }

  private let path: String
  private let lock = NSLock()
  private var entries: [String: Entry]?

  init(path: String) { self.path = path }

  static func key(_ bundleIdentifier: String?, _ appPath: String) -> String { bundleIdentifier?.lowercased() ?? appPath }

  func snapshot() -> [String: Entry] {
    lock.lock()
    defer { lock.unlock() }
    return loaded()
  }

  func record(_ app: ResolvedApp) {
    lock.lock()
    defer { lock.unlock() }
    var all = loaded()
    let key = Self.key(app.bundleIdentifier, app.appPath)
    var entry = all[key] ?? Entry(appPath: app.appPath, bundleIdentifier: app.bundleIdentifier, displayName: app.displayName, lastUsedDate: "", useCount: 0)
    entry.appPath = app.appPath
    entry.displayName = app.displayName
    entry.lastUsedDate = ISO8601DateFormatter().string(from: Date())
    entry.useCount += 1
    all[key] = entry
    entries = all
    save(all)
  }

  private func loaded() -> [String: Entry] {
    if let entries { return entries }
    var read: [String: Entry] = [:]
    if let data = FileManager.default.contents(atPath: path),
       let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let apps = object["apps"] as? [String: [String: Any]] {
      for (key, value) in apps {
        guard let appPath = value["appPath"] as? String, let displayName = value["displayName"] as? String,
              let last = value["lastUsedDate"] as? String, let count = value["useCount"] as? Int else { continue }
        read[key] = Entry(appPath: appPath, bundleIdentifier: value["bundleIdentifier"] as? String, displayName: displayName,
                          lastUsedDate: last, useCount: count)
      }
    }
    entries = read
    return read
  }

  private func save(_ all: [String: Entry]) {
    var apps: [String: Any] = [:]
    for (key, entry) in all {
      apps[key] = ["appPath": entry.appPath, "bundleIdentifier": entry.bundleIdentifier as Any? ?? NSNull(), "displayName": entry.displayName,
                   "lastUsedDate": entry.lastUsedDate, "useCount": entry.useCount]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: ["apps": apps], options: [.sortedKeys]) else { return }
    let temporary = path + ".tmp"
    if FileManager.default.createFile(atPath: temporary, contents: data, attributes: [.posixPermissions: 0o600]) {
      _ = rename(temporary, path)
    }
  }
}
