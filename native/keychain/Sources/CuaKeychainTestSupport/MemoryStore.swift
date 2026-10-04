// Test-owned in-memory storage. Linked only by the test host, the pty driver's tests and the Swift tests; the
// production helper cannot reach it.
import Foundation
import CuaKeychainCore

public final class MemoryStore: SecretStore, @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String: [UInt8]]
  private var _failures: [String: StoreError] = [:]
  private var _failAll: StoreError?
  private var _operations: [String] = []

  public init(_ initial: [String: String] = [:]) {
    values = initial.mapValues { Array($0.utf8) }
  }

  private func locked<T>(_ body: () throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try body() }

  /// Failure injected for one label's operations.
  public var failures: [String: StoreError] {
    get { locked { _failures } }
    set { locked { _failures = newValue } }
  }
  /// Failure injected for every operation.
  public var failAll: StoreError? {
    get { locked { _failAll } }
    set { locked { _failAll = newValue } }
  }
  /// The storage operations performed, in order ("labels", "read:<label>", ...).
  public var operations: [String] { locked { _operations } }

  /// Test inspection and setup; not recorded as operations.
  public func value(_ label: String) -> [UInt8]? { locked { values[label] } }
  public func put(_ label: String, _ bytes: [UInt8]) { locked { values[label] = bytes } }

  private func record(_ op: String, _ label: String?) throws {
    _operations.append(label.map { "\(op):\($0)" } ?? op)
    if let failure = _failAll { throw failure }
    if let label, let failure = _failures[label] { throw failure }
  }

  public func labels() throws -> [String] {
    try locked { try record("labels", nil); return Array(values.keys) }
  }

  public func read(_ label: String) throws -> [UInt8] {
    try locked {
      try record("read", label)
      guard let value = values[label] else { throw StoreError.notFound }
      return value
    }
  }

  public func write(_ label: String, _ value: [UInt8]) throws -> WriteOutcome {
    try locked {
      try record("write", label)
      let outcome: WriteOutcome = values[label] == nil ? .created : .replaced
      values[label] = value
      return outcome
    }
  }

  public func exists(_ label: String) throws -> Bool {
    try locked { try record("exists", label); return values[label] != nil }
  }

  public func delete(_ label: String) throws {
    try locked {
      try record("delete", label)
      guard values.removeValue(forKey: label) != nil else { throw StoreError.notFound }
    }
  }
}
