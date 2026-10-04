// `cua-keychain broker` as a process: configuration in on stdin, one ready line out on stdout, served until stdin
// closes or a stop signal arrives. The configuration is the only place the capability token enters the helper.
import Foundation
import Darwin

private let configMaxBytes = 4096
nonisolated(unsafe) private var runningBroker: Broker?

/// `cua-keychain broker`: reads {"socket","token"} as one JSON line on `input`, serves, answers one JSON line on
/// `output` ({"protocol":1,"ready":true} or {"error":"<code>","ready":false}), and stops when `input` reaches EOF.
public func runBrokerMode(input: Int32, output: Int32, store: SecretStore, limits: BrokerLimits = .standard) -> Int32 {
  func answer(_ object: [String: Any]) {
    let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data()
    writeAll(output, Array(data) + [0x0a])
  }
  guard let config = readConfig(input) else {
    answer(["ready": false, "error": "invalid_config"])
    return 1
  }
  let broker = Broker(config: config, store: store, limits: limits)
  do { try broker.start() } catch {
    answer(["ready": false, "error": (error as? BrokerStartError)?.code ?? "endpoint_failed"])
    return 1
  }
  runningBroker = broker
  answer(["ready": true, "protocol": brokerProtocolVersion])
  var sink = [UInt8](repeating: 0, count: 256)
  while true {
    let n = Darwin.read(input, &sink, sink.count)
    if n > 0 { continue }
    if n < 0 && errno == EINTR { continue }
    break
  }
  broker.stop()
  runningBroker = nil
  return 0
}

private func readConfig(_ fd: Int32) -> BrokerConfig? {
  var line: [UInt8] = []
  var byte: UInt8 = 0
  while line.count <= configMaxBytes {
    let n = Darwin.read(fd, &byte, 1)
    if n < 0 && errno == EINTR { continue }
    if n <= 0 || byte == 0x0a { break }
    line.append(byte)
  }
  defer { for i in line.indices { line[i] = 0 } }
  guard line.count <= configMaxBytes,
        let object = (try? JSONSerialization.jsonObject(with: Data(line))) as? [String: Any],
        Set(object.keys) == ["socket", "token"],
        let socket = object["socket"] as? String, socket.hasPrefix("/"),
        let token = object["token"] as? String, (32...256).contains(token.utf8.count),
        token.utf8.allSatisfy({ $0 == 0x2d || $0 == 0x5f || ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x41 && $0 <= 0x5a) || ($0 >= 0x61 && $0 <= 0x7a) })
  else { return nil }
  return BrokerConfig(socketPath: socket, token: token)
}

/// Process entry for `broker`: SIGTERM, SIGINT and SIGHUP stop the broker (removing its endpoint) and exit 0, like
/// the end of stdin does. SIGPIPE is ignored so a vanished client cannot kill the broker.
func runBrokerProcess(store: SecretStore) -> Int32 {
  signal(SIGPIPE, SIG_IGN)
  var stopSignals = sigset_t()
  sigemptyset(&stopSignals)
  for sig in [SIGTERM, SIGINT, SIGHUP] { sigaddset(&stopSignals, sig) }
  pthread_sigmask(SIG_UNBLOCK, &stopSignals, nil)
  var sources: [DispatchSourceSignal] = []
  for sig in [SIGTERM, SIGINT, SIGHUP] {
    signal(sig, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .global())
    source.setEventHandler {
      runningBroker?.stop()
      exit(0)
    }
    source.resume()
    sources.append(source)
  }
  let code = runBrokerMode(input: STDIN_FILENO, output: STDOUT_FILENO, store: store)
  sources.forEach { $0.cancel() }
  return code
}
