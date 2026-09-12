import AppKit
import Foundation
import Darwin

@main
struct NativeHost {
    static func readExactly(_ count: Int) throws -> Data {
        var result = Data()
        while result.count < count {
            guard let next = try FileHandle.standardInput.read(upToCount: count - result.count), !next.isEmpty else { throw ClipboardFailure.invalid }
            result.append(next)
        }
        return result
    }

    static func main() {
        umask(0o077)
        do {
            let binary = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
            let config = try JSONDecoder().decode(HostConfig.self, from: Data(contentsOf: binary.deletingLastPathComponent().appendingPathComponent("bridge-config.json")))
            guard CommandLine.arguments.count > 1, config.allowedOrigins.contains(CommandLine.arguments[1]) else { return }
            let prefix = try readExactly(4)
            let size = prefix.enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << ($1.offset * 8) }
            guard size > 0, size <= 1048576 else { throw ClipboardFailure.invalid }
            let request = try JSONDecoder().decode(BridgeRequest.self, from: readExactly(Int(size)))
            var root = KeyCache.root
            var board = NSPasteboard.general
            #if TESTING
            if let testRoot = ProcessInfo.processInfo.environment["KEYDROP_TEST_ROOT"] { root = URL(fileURLWithPath: testRoot) }
            if let boardName = ProcessInfo.processInfo.environment["KEYDROP_TEST_PASTEBOARD"] { board = NSPasteboard(name: NSPasteboard.Name(boardName)) }
            #endif
            let core = ClipboardCore(root: root, pasteboard: board)
            let response = try core.perform(request)
            try send(response)
        } catch {
            // Never echo request data, a decoded key, or Foundation's file error into logs/stdout.
            try? send(BridgeResponse(ok: false, error: "本机文件复制失败，请检查助手安装、文件是否存在及缓存目录权限。"))
        }
    }

    static func send(_ response: BridgeResponse) throws {
        let data = try JSONEncoder().encode(response)
        var size = UInt32(data.count).littleEndian
        FileHandle.standardOutput.write(Data(bytes: &size, count: 4))
        FileHandle.standardOutput.write(data)
    }

    struct HostConfig: Decodable { let allowedOrigins: [String] }
}
