import AppKit
import Foundation

// cua-engine: the server (default) or a probe (`--probe …`).
let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "--probe" { exit(Probe.run(Array(arguments.dropFirst()))) }

Lifecycle.install()
// The settings first: an engine that cannot run under them never touches the lock or the socket.
let settings: EngineSettings
do { settings = try EngineSettings.load() } catch { fail(ServerPaths.configExit, (error as? EngineSettings.Invalid)?.message ?? "\(error)") }
let server = Server(paths: ServerPaths.resolve(), peerPolicy: settings.peerPolicy)
server.start()
let application = NSApplication.shared
// Inside cua Engine.app, LSUIElement keeps the engine out of the Dock; an unbundled run (a test's debug build) is
// kept from ever becoming a UI app.
if !isBundled { application.setActivationPolicy(.prohibited) }
application.run()
Lifecycle.exit("the run loop ended", status: 0)
