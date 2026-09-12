import Foundation

@main
struct KeyCacheTests {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("keydrop-test-\(UUID())")
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }
        let cache = root.appendingPathComponent("cache")
        let folder = cache.appendingPathComponent("20260911-114549-364-A9A878D9")
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        for name in ["api-key.txt", "api-key.json", "api-key.yaml", "keep.txt"] {
            try Data("fake-test-value".utf8).write(to: folder.appendingPathComponent(name))
        }
        let outside = root.appendingPathComponent("outside.txt")
        try Data("fake".utf8).write(to: outside)
        try fm.createSymbolicLink(at: cache.appendingPathComponent("api-key.txt"), withDestinationURL: outside)
        let count = try KeyCache.clean(root: cache)
        precondition(count == 3)
        precondition(fm.fileExists(atPath: folder.appendingPathComponent("keep.txt").path))
        precondition(fm.fileExists(atPath: outside.path))
        let again = try KeyCache.clean(root: cache)
        precondition(again == 0)
        let emptyFolder = cache.appendingPathComponent("20260911-114549-364-00000000")
        try fm.createDirectory(at: emptyFolder, withIntermediateDirectories: true)
        try Data("fake".utf8).write(to: emptyFolder.appendingPathComponent("api-key.txt"))
        let last = try KeyCache.clean(root: cache)
        precondition(last == 1 && !fm.fileExists(atPath: emptyFolder.path))
        print("PASS: clean all formats, preserve unrelated files and symlink targets, repeat cleanup, remove empty generated folders")
    }
}
