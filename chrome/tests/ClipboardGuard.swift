import AppKit
import Foundation

// Preserve existing clipboard ONLY in local process memory. Never print or save its contents.
let board = NSPasteboard.general
let saved: [NSPasteboardItem] = (board.pasteboardItems ?? []).map { original in
    let item = NSPasteboardItem()
    for type in original.types { if let data = original.data(forType: type) { item.setData(data, forType: type) } }
    return item
}
print("READY")
fflush(stdout)
if readLine() == "restore" {
    let prefix = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true).absoluteString
    let ownFile = board.string(forType: .fileURL)?.hasPrefix(prefix) == true
    let fakeValues = ["sk-keydrop_FAKE_deepseek_0123456789", "sk-proj-KEYDROP_FAKE_abcdefghijklmnopqrstuvwxyz", "KEYDROP_LOCAL_QA_ONLY"]
    let ownText = board.string(forType: .string).map { fakeValues.contains($0) } == true
    if ownFile || ownText {
        board.clearContents()
        if !saved.isEmpty { _ = board.writeObjects(saved) }
        print("RESTORED")
    } else {
        // A concurrent user/application change must win, even if the test failed midway.
        print("LEFT_UNCHANGED")
    }
}
