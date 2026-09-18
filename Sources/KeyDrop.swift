import SwiftUI
import AppKit
import Darwin

@MainActor
final class KeyDropModel: ObservableObject {
    @Published var entries = [KeyEntry()]
    @Published var format: KeyFormat = .txt
    @Published var status = ""
    @Published var statusIsError = false
    var hasNames: Bool { entries.contains { !$0.name.isEmpty } }

    var filename: String {
        "api-key.\(format.rawValue.lowercased())"
    }

    private let outputRootURL = KeyCache.root

    func cleanHistory() {
        do {
            let count = try KeyCache.clean()
            setStatus(count == 0 ? "没有需要清理的历史文件" : "已清理 \(count) 个历史文件")
        } catch {
            setStatus("清理未完成，请重试：\(error.localizedDescription)", error: true)
        }
    }

    func readClipboard(into id: UUID?) {
        guard let value = NSPasteboard.general.string(forType: .string), !value.isEmpty else {
            setStatus("剪贴板里没有文本", error: true)
            return
        }

        let index = entries.firstIndex { $0.id == id } ?? 0
        entries[index].value = value
        setStatus("已从剪贴板读取")
    }

    func createAndCopyFile() {
        do {
            let data = try KeyPayload.encode(entries, format: format)
            if FileManager.default.fileExists(atPath: outputRootURL.path),
               try outputRootURL.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink == true {
                throw KeyPayload.Failure(message: "缓存目录是符号链接，已停止生成")
            }
            // 每次生成使用独立目录，确保已经粘贴出去的旧文件引用不会被改写。
            let timestamp = DateFormatter.keyDropTimestamp.string(from: Date())
            let uniqueFolderName = "\(timestamp)-\(String(UUID().uuidString.prefix(8)))"
            let folder = outputRootURL.appendingPathComponent(uniqueFolderName, isDirectory: true)
            let outputURL = folder.appendingPathComponent(filename, isDirectory: false)

            try FileManager.default.createDirectory(
                at: folder,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )

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
    @FocusState private var focusedRow: UUID?
    @State private var activeRow: UUID?
    @State private var pendingRemoval: UUID?
    @State private var showingRemoval = false
    @State private var showingCleanup = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                if let image = NSImage(named: "KeyDropMark") {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 52, height: 52)
                } else {
                    Image(systemName: "rectangle.portrait.on.rectangle.portrait")
                        .font(.system(size: 38))
                        .frame(width: 52, height: 52)
                }
                Text("KeyDrop")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Spacer()
            }

            HStack {
                Spacer()
                Picker("文件格式", selection: $model.format) {
                    ForEach(KeyFormat.allCases, id: \.self) { format in
                        Text(format.rawValue).tag(format)
                    }
                }
                .labelsHidden()
                .pickerStyle(.segmented)
                .frame(width: 240)
            }

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach($model.entries) { $entry in
                            entryRow($entry).id(entry.id)
                        }
                    }
                    .padding(1)
                }
                .frame(height: CGFloat(min(model.entries.count, 5)) * 80)
                .onChange(of: model.entries.count) { _ in
                    if let id = focusedRow { proxy.scrollTo(id) }
                }
            }

            HStack(spacing: 10) {
                Button {
                    model.readClipboard(into: activeRow)
                    focusedRow = activeRow ?? model.entries.first?.id
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

            if !model.status.isEmpty {
                HStack(spacing: 7) {
                    Image(systemName: model.statusIsError ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                        .foregroundStyle(model.statusIsError ? Color.orange : Color.green)
                    Text(model.status)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                    Text(model.filename)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
            }
            HStack {
                Button {
                    showingCleanup = true
                } label: {
                    Label("文件清理", systemImage: "trash")
                }
                .buttonStyle(.bordered)
                .alert("清理所有历史密钥文件？", isPresented: $showingCleanup) {
                    Button("取消", role: .cancel) {}
                    Button("确认清理", role: .destructive) { model.cleanHistory() }
                } message: {
                    Text("将永久删除 KeyDrop 缓存目录中各时间段生成的密钥文件，无法撤销。已复制的本地文件引用将失效；当前输入和其他应用中的副本不受影响。")
                }
                Spacer()
            }
        }
        .padding(24)
        .frame(width: 550)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            focusedRow = model.entries.first?.id
            activeRow = focusedRow
        }
        .onChange(of: focusedRow) { id in
            if let id { activeRow = id }
        }
        .alert("移除这一行？", isPresented: $showingRemoval) {
            Button("取消", role: .cancel) { pendingRemoval = nil }
            Button("移除", role: .destructive) {
                if let id = pendingRemoval { removeRow(id) }
                pendingRemoval = nil
            }
        } message: {
            Text("这一行已填写的名称和 API Key 将被移除。")
        }
    }

    private func removeRow(_ id: UUID) {
        model.entries.removeAll { $0.id == id }
        activeRow = model.entries.first?.id
        focusedRow = activeRow
    }

    private func entryRow(_ binding: Binding<KeyEntry>) -> some View {
        let entry = binding.wrappedValue
        return HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: .leading, spacing: 6) {
                Text("名称").fieldLabel()
                TextField("", text: binding.name)
                    .textFieldStyle(.plain)
                    .frame(height: 36)
                    .padding(.horizontal, 12)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color.primary.opacity(0.16), lineWidth: 1))
                    .help("可选；留空时生成纯文本")
                    .accessibilityLabel("可选名称")
            }
            .frame(width: 112)
            Text(":")
                .foregroundStyle(.secondary)
                .padding(.bottom, 10)
            VStack(alignment: .leading, spacing: 6) {
                Text("API Key").fieldLabel()
                Group {
                    if entry.isVisible {
                        TextField("粘贴你的 Key", text: binding.value)
                    } else {
                        SecureField("粘贴你的 Key", text: binding.value)
                    }
                }
                .focused($focusedRow, equals: entry.id)
                .textFieldStyle(.plain)
                .font(.system(size: 13, design: .monospaced))
                .frame(height: 36)
                .padding(.horizontal, 12)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(focusedRow == entry.id ? Color.primary.opacity(0.75) : Color.primary.opacity(0.16), lineWidth: focusedRow == entry.id ? 2 : 1))
                .accessibilityLabel("API Key")
            }
            .frame(maxWidth: .infinity)
            iconButton(systemName: entry.isVisible ? "eye.slash" : "eye", label: entry.isVisible ? "隐藏 API Key" : "显示 API Key") {
                binding.isVisible.wrappedValue.toggle()
                focusedRow = entry.id
            }
            if model.entries.count > 1 {
                iconButton(systemName: "minus", label: "移除这一行") {
                    if entry.name.isEmpty && entry.value.isEmpty { removeRow(entry.id) }
                    else {
                        pendingRemoval = entry.id
                        showingRemoval = true
                    }
                }
            }
            iconButton(systemName: "plus", label: "添加 API Key", emphasized: true) {
                let newEntry = KeyEntry()
                let index = model.entries.firstIndex { $0.id == entry.id } ?? 0
                model.entries.insert(newEntry, at: index + 1)
                focusedRow = newEntry.id
                activeRow = newEntry.id
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(focusedRow == entry.id ? Color.primary.opacity(0.75) : Color.primary.opacity(0.2), lineWidth: focusedRow == entry.id ? 2 : 1)
        }
    }

    private func iconButton(systemName: String, label: String, emphasized: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
        .background(emphasized ? Color(nsColor: .controlBackgroundColor) : .clear)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.primary.opacity(emphasized ? 0.16 : 0), lineWidth: 1))
        .help(label)
        .accessibilityLabel(label)
    }
}

private extension View {
    func fieldLabel() -> some View {
        self.font(.system(size: 12, weight: .regular)).foregroundStyle(.secondary)
    }
}

@main
struct KeyDropApp: App {
    init() {
        // Protect even the temporary file used by Foundation's atomic write.
        umask(0o077)
    }

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
