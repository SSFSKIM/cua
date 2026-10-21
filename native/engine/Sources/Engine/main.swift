import AppKit
import Foundation

// cua-engine: the server (default) or a probe (`--probe …`).
let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "--probe" { exit(Probe.run(Array(arguments.dropFirst()))) }

Lifecycle.install()
// The settings first: an engine that cannot run under them never touches the lock or the socket.
let settings: EngineSettings
do { settings = try EngineSettings.load() } catch { fail(ServerPaths.configExit, (error as? EngineSettings.Invalid)?.message ?? "\(error)") }
let application = NSApplication.shared
// The screens a capture is sized by, read here on the main thread before any request can arrive (Screenshot.swift).
screenScales.start()
let server = Server(paths: ServerPaths.resolve(), settings: settings)
server.start()
// Inside cua Engine.app, LSUIElement keeps the engine out of the Dock; an unbundled run (a test's debug build) is
// kept from ever becoming a UI app.
if !isBundled { application.setActivationPolicy(.prohibited) }
application.run()
Lifecycle.exit("the run loop ended", status: 0)
