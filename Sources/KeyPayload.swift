import Foundation

struct KeyEntry: Identifiable, Equatable {
    let id = UUID()
    var name = ""
    var value = ""
    var isVisible = false
}

enum KeyFormat: String, CaseIterable {
    case yaml = "YAML"
    case json = "JSON"
}

enum KeyPayload {
    static func encode(_ entries: [KeyEntry], format: KeyFormat) throws -> Data {
        guard !entries.isEmpty, entries.allSatisfy({ !$0.value.isEmpty }) else {
            throw Failure(message: "请填写每一行的 API Key，或移除空行")
        }
        let named = entries.contains { !$0.name.isEmpty }
        if !named {
            return Data(entries.map(\.value).joined(separator: "\n").utf8)
        }
        guard entries.allSatisfy({ !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            throw Failure(message: "使用名称时，请为每一行填写名称")
        }
        guard Set(entries.map(\.name)).count == entries.count else {
            throw Failure(message: "名称不能重复，请修改后再生成")
        }
        // JSON string quoting is also valid for YAML double-quoted scalars.
        func quote(_ value: String) throws -> String {
            let data = try JSONEncoder().encode(value)
            return String(decoding: data, as: UTF8.self)
                .replacingOccurrences(of: "\u{0085}", with: "\\u0085")
                .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
                .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        }
        let lines = try entries.map { try "\(quote($0.name)): \(quote($0.value))" }
        let output = format == .json
            ? "{\n  " + lines.joined(separator: ",\n  ") + "\n}"
            : lines.joined(separator: "\n")
        return Data(output.utf8)
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
}
