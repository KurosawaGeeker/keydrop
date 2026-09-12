import AppKit
import Foundation
let board = CommandLine.arguments[1] == "__general__" ? NSPasteboard.general : NSPasteboard(name: NSPasteboard.Name(CommandLine.arguments[1]))
if let value = board.string(forType: .fileURL), let url = URL(string: value) {
    // Test-only probe. The caller supplies the isolated board used only for fake credentials.
    print(url.path)
} else { print("NO_FILE") }
