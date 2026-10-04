// The production helper: Keychain storage only. See CuaKeychainCore/Commands.swift for the command surface.
import Darwin
import CuaKeychainCore
import CuaKeychainStore

exit(helperMain(Array(CommandLine.arguments.dropFirst()), store: KeychainStore()))
