import SwiftUI
import AppKit

@MainActor
final class KeyDropModel: ObservableObject {
    @Published var apiKey = ""
    @Published var status = "等待输入 API Key"
    @Published var statusIsError = false
    @Published var isShowingKey = false

    private let outputRootURL: URL = {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KeyDrop", isDirectory: true)
    }()

    func readClipboard() {
        guard let value = NSPasteboard.general.string(forType: .string), !value.isEmpty else {
            setStatus("剪贴板里没有文本", error: true)
            return
        }

        apiKey = value
        setStatus("已从剪贴板读取")
    }

    func createAndCopyFile() {
        guard !apiKey.isEmpty else {
            setStatus("请先输入或读取 API Key", error: true)
            return
        }

        do {
            // 每次生成使用独立目录，确保已经粘贴出去的旧文件引用不会被改写。
            let timestamp = DateFormatter.keyDropTimestamp.string(from: Date())
            let uniqueFolderName = "\(timestamp)-\(String(UUID().uuidString.prefix(8)))"
            let folder = outputRootURL.appendingPathComponent(uniqueFolderName, isDirectory: true)
            let outputURL = folder.appendingPathComponent("api-key.txt", isDirectory: false)

            try FileManager.default.createDirectory(
                at: folder,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )

            guard let data = apiKey.data(using: .utf8) else {
                setStatus("API Key 无法编码为 UTF-8", error: true)
                return
            }

            try data.write(to: outputURL, options: .atomic)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o600],
                ofItemAtPath: outputURL.path
            )

            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            guard pasteboard.writeObjects([outputURL as NSURL]) else {
                setStatus("文件已生成，但复制失败", error: true)
                return
            }

            setStatus("文件已复制，去目标输入框按 ⌘V")
        } catch {
            setStatus("生成失败：\(error.localizedDescription)", error: true)
        }
    }

    private func setStatus(_ message: String, error: Bool = false) {
        status = message
        statusIsError = error
    }
}

private extension DateFormatter {
    static let keyDropTimestamp: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss-SSS"
        return formatter
    }()
}

struct KeyDropView: View {
    @StateObject private var model = KeyDropModel()
    @FocusState private var fieldIsFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.48, green: 0.32, blue: 1.0),
                                    Color(red: 0.25, green: 0.58, blue: 1.0)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Image(systemName: "key.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text("KeyDrop")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                    Text("把 API Key 变成可粘贴的文件")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("API KEY")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .tracking(0.7)

                HStack(spacing: 8) {
                    Group {
                        if model.isShowingKey {
                            TextField("粘贴或输入 API Key", text: $model.apiKey)
                        } else {
                            SecureField("粘贴或输入 API Key", text: $model.apiKey)
                        }
                    }
                    .textFieldStyle(.plain)
                    .focused($fieldIsFocused)
                    .font(.system(size: 14, design: .monospaced))

                    Button {
                        model.isShowingKey.toggle()
                        fieldIsFocused = true
                    } label: {
                        Image(systemName: model.isShowingKey ? "eye.slash" : "eye")
                            .foregroundStyle(.secondary)
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .help(model.isShowingKey ? "隐藏 API Key" : "显示 API Key")
                }
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(fieldIsFocused ? Color.accentColor.opacity(0.8) : Color.primary.opacity(0.1), lineWidth: 1)
                }
            }

            HStack(spacing: 10) {
                Button {
                    model.readClipboard()
                    fieldIsFocused = true
                } label: {
                    Label("从剪贴板读取", systemImage: "doc.on.clipboard")
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                }

                Button {
                    model.createAndCopyFile()
                } label: {
                    Label("生成并复制文件", systemImage: "doc.on.doc.fill")
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.return, modifiers: [.command])
            }
            .controlSize(.large)

            HStack(spacing: 7) {
                Image(systemName: model.statusIsError ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(model.statusIsError ? Color.orange : Color.green)
                Text(model.status)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                Text("api-key.txt")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(26)
        .frame(width: 470, height: 285)
        .background(
            LinearGradient(
                colors: [
                    Color(nsColor: .windowBackgroundColor),
                    Color.accentColor.opacity(0.035)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .onAppear {
            fieldIsFocused = true
        }
    }
}

@main
struct KeyDropApp: App {
    var body: some Scene {
        WindowGroup {
            KeyDropView()
        }
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
