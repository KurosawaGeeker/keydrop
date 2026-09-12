import Foundation

@main
struct KeyPayloadTests {
    static func main() throws {
        func encode(_ rows: [KeyEntry], _ format: KeyFormat = .yaml) throws -> String {
            String(decoding: try KeyPayload.encode(rows, format: format), as: UTF8.self)
        }
        func rejects(_ rows: [KeyEntry]) {
            do {
                _ = try KeyPayload.encode(rows, format: .json)
                fatalError("Expected validation failure")
            } catch is KeyPayload.Failure {
                // Expected user-facing validation error.
            } catch { fatalError("Unexpected error type") }
        }
        let raw = "demo-key-with-spaces \n"
        let single = try encode([KeyEntry(value: raw)])
        let multiple = try encode([KeyEntry(value: "demo-a"), KeyEntry(value: "demo-b")])
        precondition(single == raw)
        precondition(multiple == "demo-a\ndemo-b")
        let rows = [KeyEntry(name: "OPENAI_API_KEY", value: "demo-\"quoted\"\\value\nnext"), KeyEntry(name: "中文", value: "true")]
        let json = try KeyPayload.encode(rows, format: .json)
        let decoded = try JSONDecoder().decode([String: String].self, from: json)
        precondition(decoded[rows[0].name] == rows[0].value)
        precondition(decoded["中文"] == "true")
        let yaml = try encode([KeyEntry(name: "a:b", value: "true")])
        precondition(yaml == "\"a:b\": \"true\"")
        let lineBreaks = try encode([KeyEntry(name: "breaks", value: "\u{0085}\u{2028}\u{2029}")])
        precondition(lineBreaks == "\"breaks\": \"\\u0085\\u2028\\u2029\"")
        rejects([])
        rejects([KeyEntry()])
        rejects([KeyEntry(value: "demo"), KeyEntry()])
        rejects([KeyEntry(name: "named", value: "demo"), KeyEntry(value: "demo")])
        rejects([KeyEntry(name: "same", value: "a"), KeyEntry(name: "same", value: "b")])
        rejects([KeyEntry(name: "  ", value: "demo")])
        print("PASS: raw byte preservation, multiline, JSON round-trip, YAML quoting and validation")
    }
}
