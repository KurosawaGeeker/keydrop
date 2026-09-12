import Foundation

enum KeyCache {
    static let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("KeyDrop", isDirectory: true)

    // Only known generated files, never recursively delete arbitrary user content.
    static func clean(root: URL = root) throws -> Int {
        let fm = FileManager.default
        guard fm.fileExists(atPath: root.path) else { return 0 }
        guard try root.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else {
            throw KeyPayload.Failure(message: "缓存目录是符号链接，已停止清理")
        }
        let names = Set(["api-key.txt", "api-key.json", "api-key.yaml"])
        var count = 0
        func removeKeys(in folder: URL) throws {
            for file in try fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey]) where names.contains(file.lastPathComponent) {
                let info = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
                if info.isRegularFile == true && info.isSymbolicLink != true {
                    try fm.removeItem(at: file)
                    count += 1
                }
            }
        }
        try removeKeys(in: root)
        for folder in try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey]) {
            guard folder.lastPathComponent.range(of: #"^\d{8}-\d{6}-\d{3}-[A-Fa-f0-9]{8}$"#, options: .regularExpression) != nil else { continue }
            let info = try folder.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard info.isDirectory == true, info.isSymbolicLink != true else { continue }
            try removeKeys(in: folder)
            if try fm.contentsOfDirectory(atPath: folder.path).isEmpty { try fm.removeItem(at: folder) }
        }
        return count
    }
}
