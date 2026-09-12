import AppKit
import Foundation

struct BridgeRequest: Decodable {
    let op: String
    var text: String?
    var filename: String?
    var id: String?
}

struct BridgeResponse: Encodable {
    var ok: Bool
    var version: String = "0.2.0"
    var id: String?
    var filename: String?
    var count: Int?
    var error: String?
}

enum ClipboardFailure: Error { case invalid, unavailable }

struct ClipboardCore {
    let root: URL
    let pasteboard: NSPasteboard
    private let names = Set(["api-key.txt", "api-key.json", "api-key.yaml"])

    func perform(_ request: BridgeRequest) throws -> BridgeResponse {
        switch request.op {
        case "ping": return BridgeResponse(ok: true)
        case "create":
            guard let text = request.text, !text.isEmpty, text.utf8.count <= 262144,
                  let filename = request.filename, names.contains(filename) else { throw ClipboardFailure.invalid }
            let fm = FileManager.default
            try fm.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            guard try root.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw ClipboardFailure.invalid }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyyMMdd-HHmmss-SSS"
            let id = formatter.string(from: Date()) + "-" + UUID().uuidString.prefix(8)
            let folder = root.appendingPathComponent(id, isDirectory: true)
            try fm.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
            let file = folder.appendingPathComponent(filename)
            // Host sets umask(0077) before any writes; never create a world-readable temporary file.
            try Data(text.utf8).write(to: file, options: .withoutOverwriting)
            try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            try copy(file)
            return BridgeResponse(ok: true, id: id, filename: filename)
        case "copy":
            let file = try ownedFile(request)
            try copy(file)
            return BridgeResponse(ok: true, id: request.id, filename: request.filename)
        case "cleanup":
            return BridgeResponse(ok: true, count: try KeyCache.clean(root: root))
        default: throw ClipboardFailure.invalid
        }
    }

    private func ownedFile(_ request: BridgeRequest) throws -> URL {
        guard let id = request.id, id.range(of: #"^\d{8}-\d{6}-\d{3}-[A-Fa-f0-9]{8}$"#, options: .regularExpression) != nil,
              let filename = request.filename, names.contains(filename) else { throw ClipboardFailure.invalid }
        let folder = root.appendingPathComponent(id, isDirectory: true)
        let file = folder.appendingPathComponent(filename)
        for directory in [root, folder] {
            let info = try directory.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey])
            guard info.isSymbolicLink != true, info.isDirectory == true else { throw ClipboardFailure.invalid }
        }
        let info = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey])
        guard info.isSymbolicLink != true, info.isRegularFile == true else { throw ClipboardFailure.invalid }
        return file
    }

    private func copy(_ file: URL) throws {
        pasteboard.clearContents()
        guard pasteboard.writeObjects([file as NSURL]),
              pasteboard.string(forType: .fileURL) == file.absoluteString else { throw ClipboardFailure.unavailable }
    }
}
