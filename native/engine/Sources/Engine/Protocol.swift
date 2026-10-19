import Foundation

// EngineProtocol (the spec's Interfaces): JSON-RPC 2.0 over a Unix socket, each frame a 4-byte little-endian length
// then UTF-8 JSON, 8 MiB at most each way, one request in flight per connection (the vendor's transport,
// R/A-contract.md §2.2). Methods: ping, status, execute, approve, shutdown.

let maxFrameSize = 8 * 1024 * 1024

/// The vendor's server error codes (R/A-contract.md §1.5), used for the conditions cua maps; `errorName` is the case
/// name, which `src/services/sky.mjs` classifies by. Everything else is `unknownError` (-10005) with its own name.
enum VendorCode: Int {
  case senderProcessNotAuthenticated = -10000
  case unknownError = -10005
  case appNotAllowed = -10006
  case runningApplicationNotFound = -10007
  case accessibilityError = -10008
  case invalidApp = -10010
  case incompatibleClientVersion = -10013
  case permissionsPending = -10014
  case userIntervened = -10016
  case ambiguousApp = -10018
  case screenLocked = -10020
}

/// JSON-RPC's own codes, for faults of the envelope rather than of a method.
enum RPCCode: Int {
  case parseError = -32700
  case invalidRequest = -32600
  case methodNotFound = -32601
  case invalidParams = -32602
}

/// A failed request: `{code, message, errorName}` on the wire, plus `extra` members (shutdown's `connections`, an input
/// error's `meta`). `message` is a bounded sentence and never carries a value the client sent.
struct EngineError: Error, @unchecked Sendable {
  let code: Int
  let errorName: String
  let message: String
  var extra: [String: Any] = [:]

  init(_ vendor: VendorCode, _ message: String, extra: [String: Any] = [:]) {
    self.code = vendor.rawValue
    self.errorName = "\(vendor)"
    self.message = message
    self.extra = extra
  }

  /// A condition the vendor has no code for: -10005 with cua's own name.
  init(name: String, _ message: String, extra: [String: Any] = [:]) {
    self.code = VendorCode.unknownError.rawValue
    self.errorName = name
    self.message = message
    self.extra = extra
  }

  init(rpc: RPCCode, _ message: String) {
    self.code = rpc.rawValue
    self.errorName = "\(rpc)"
    self.message = message
  }

  var wire: [String: Any] {
    var object = extra
    object["code"] = code
    object["message"] = message
    object["errorName"] = errorName
    return object
  }

  static func invalidArguments(_ message: String) -> EngineError { EngineError(name: "invalidArguments", message) }
}

// MARK: Framing

enum FrameRead {
  case frame(Data)
  case closed
  case tooLarge(Int)
}

/// Reads one frame from a blocking socket.
func readFrame(_ fd: Int32) -> FrameRead {
  guard let header = readExactly(fd, 4) else { return .closed }
  let length = header.withUnsafeBytes { Int(UInt32(littleEndian: $0.loadUnaligned(as: UInt32.self))) }
  if length > maxFrameSize { return .tooLarge(length) }
  guard let body = readExactly(fd, length) else { return .closed }
  return .frame(body)
}

private func readExactly(_ fd: Int32, _ count: Int) -> Data? {
  var data = Data(count: count)
  var done = 0
  while done < count {
    let n = data.withUnsafeMutableBytes { read(fd, $0.baseAddress! + done, count - done) }
    if n > 0 { done += n; continue }
    if n < 0 && errno == EINTR { continue }
    return nil
  }
  return data
}

/// Writes one frame; false when the peer is gone.
@discardableResult
func writeFrame(_ fd: Int32, _ body: Data) -> Bool {
  var header = UInt32(body.count).littleEndian
  var bytes = Data(bytes: &header, count: 4)
  bytes.append(body)
  var done = 0
  while done < bytes.count {
    let n = bytes.withUnsafeBytes { write(fd, $0.baseAddress! + done, bytes.count - done) }
    if n > 0 { done += n; continue }
    if n < 0 && errno == EINTR { continue }
    return false
  }
  return true
}

// MARK: Envelopes

func encodeJSON(_ object: Any) -> Data? {
  guard JSONSerialization.isValidJSONObject(object) else { return nil }
  return try? JSONSerialization.data(withJSONObject: object, options: [.withoutEscapingSlashes])
}

/// The response frame's body for `id`: the result, or the error; a result too large for a frame, or one that cannot
/// be encoded, becomes an error for the same id, so the client never waits on a frame it would reject.
func responseBody(id: Any, outcome: Result<Any, EngineError>) -> Data {
  switch outcome {
  case .success(let result):
    if let body = encodeJSON(["jsonrpc": "2.0", "id": id, "result": result]) {
      if body.count <= maxFrameSize { return body }
      return responseBody(id: id, outcome: .failure(EngineError(name: "responseTooLarge", "Response exceeds maximum frame size")))
    }
    return responseBody(id: id, outcome: .failure(EngineError(name: "encodingFailed", "The result could not be encoded as JSON")))
  case .failure(let error):
    return encodeJSON(["jsonrpc": "2.0", "id": id, "error": error.wire])
      ?? encodeJSON(["jsonrpc": "2.0", "id": id, "error": EngineError(name: "encodingFailed", "The error could not be encoded as JSON").wire])!
  }
}

/// A request as the dispatcher sees it.
struct Request {
  let id: Any
  let method: String
  let params: [String: Any]
}

/// Parses a frame's body into a request, or the error to answer with (id null when none could be read).
struct RequestFailure: Error, @unchecked Sendable {
  let id: Any
  let error: EngineError
  init(_ id: Any, _ error: EngineError) { self.id = id; self.error = error }
}

func parseRequest(_ body: Data) -> Result<Request, RequestFailure> {
  guard let object = try? JSONSerialization.jsonObject(with: body, options: [.fragmentsAllowed]) else {
    return .failure(RequestFailure(NSNull(), EngineError(rpc: .parseError, "Parse error: the frame is not valid JSON")))
  }
  guard let request = object as? [String: Any] else {
    return .failure(RequestFailure(NSNull(), EngineError(rpc: .invalidRequest, "Invalid request: not a JSON object")))
  }
  let id: Any = request["id"].flatMap { $0 is String || $0 is NSNumber ? $0 : nil } ?? NSNull()
  guard request["jsonrpc"] as? String == "2.0", request["id"] != nil, !(id is NSNull) else {
    return .failure(RequestFailure(id, EngineError(rpc: .invalidRequest, "Invalid request: a JSON-RPC 2.0 request with an id is required")))
  }
  guard let method = request["method"] as? String else {
    return .failure(RequestFailure(id, EngineError(rpc: .invalidRequest, "Invalid request: method is required")))
  }
  let params: [String: Any]
  switch request["params"] {
  case nil, is NSNull: params = [:]
  case let object as [String: Any]: params = object
  default: return .failure(RequestFailure(id, EngineError(rpc: .invalidParams, "Invalid params: params must be an object")))
  }
  return .success(Request(id: id, method: method, params: params))
}
