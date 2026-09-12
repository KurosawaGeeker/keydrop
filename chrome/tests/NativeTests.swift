import AppKit
import Foundation
import Darwin

@main struct NativeTests {
    static func main() throws {
        umask(0o077)
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("keydrop-native-tests-" + UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }
        let board = NSPasteboard.withUniqueName()
        defer { board.releaseGlobally() }
        let core = ClipboardCore(root: root, pasteboard: board)
        let value = "KEYDROP_FAKE_ONLY\n第二行"
        let created = try core.perform(BridgeRequest(op: "create", text: value, filename: "api-key.txt"))
        let file = root.appendingPathComponent(created.id!).appendingPathComponent("api-key.txt")
        let contents = try String(contentsOf: file, encoding: .utf8)
        precondition(contents == value)
        precondition(board.string(forType: .fileURL) == file.absoluteString)
        let fileMode = try fm.attributesOfItem(atPath: file.path)[.posixPermissions] as? Int
        let folderMode = try fm.attributesOfItem(atPath: file.deletingLastPathComponent().path)[.posixPermissions] as? Int
        precondition(fileMode == 0o600 && folderMode == 0o700)
        _ = try core.perform(BridgeRequest(op: "copy", filename: "api-key.txt", id: created.id))
        let entries = try fm.contentsOfDirectory(atPath: root.path)
        precondition(entries.count == 1)
        for request in [BridgeRequest(op: "create", text: value, filename: "../secret"), BridgeRequest(op: "copy", filename: "api-key.txt", id: "../elsewhere"), BridgeRequest(op: "create", text: "", filename: "api-key.txt")] {
            do { _ = try core.perform(request); fatalError("Invalid request accepted") } catch {}
        }
        let unrelated = root.appendingPathComponent("keep.txt")
        try Data("not a credential".utf8).write(to: unrelated)
        let removed = try core.perform(BridgeRequest(op: "cleanup"))
        precondition(removed.count == 1 && fm.fileExists(atPath: unrelated.path))
        print("PASS: native file clipboard, exact bytes, 0600/0700, recopy, validation, scoped cleanup")
    }
}
