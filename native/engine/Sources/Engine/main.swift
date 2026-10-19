import AppKit
import Foundation

// cua-engine: the server (default) or a probe (`--probe …`).
let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "--probe" { exit(Probe.run(Array(arguments.dropFirst()))) }

let server = Server(paths: ServerPaths.resolve())
server.start()
let application = NSApplication.shared
// Inside cua Engine.app, LSUIElement keeps the engine out of the Dock; an unbundled run (a test's debug build) is
// kept from ever becoming a UI app.
if !isBundled { application.setActivationPolicy(.prohibited) }
application.run()
