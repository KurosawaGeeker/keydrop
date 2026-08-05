# KeyDrop

一个只做一件事的 macOS 小工具：把 API Key 变成可以直接粘贴到 LLM 对话框里的文件。

KeyDrop 适合需要在 Codex、ChatGPT、Claude、Cursor 或其他支持文件粘贴的 LLM 输入框中反复切换 API Key 的场景。每次生成都会创建一个独立的时间戳目录，并把新的 `api-key.txt` 文件引用放进系统剪贴板，因此不会因为复用同一个文件路径而覆盖之前的 Key。

## 为什么用 KeyDrop

- 只有一个 API Key 输入框，界面简单、无需配置。
- 可以直接从系统剪贴板读取 API Key。
- 一键生成 `api-key.txt` 并复制文件到系统剪贴板。
- 每次生成使用独立文件路径，旧的 API Key 不会被新 Key 覆盖。
- API Key 文件只包含原始字符串，不追加换行或其他内容。
- 原生 macOS 应用，无账号、无网络请求、无第三方服务。

## 使用步骤

1. 从 [Releases](https://github.com/KurosawaGeeker/keydrop/releases) 下载最新的 `KeyDrop-macOS.zip`。
2. 解压并打开 `KeyDrop.app`。
3. 把 API Key 贴到输入框中；也可以先复制 API Key，再点击“从剪贴板读取”。
4. 点击“生成并复制文件”。
5. 打开 Codex 或其他 LLM 对话框，在目标输入框中按 `⌘V`，即可粘贴这个 API Key 文件。

每次点击“生成并复制文件”都会新建一个独立目录，目录中固定使用 `api-key.txt`。这样旧的文件引用不会被改写，切换 API Key 时不会再出现“粘贴进去的还是上一个 Key”的问题。

> 目标应用需要支持粘贴文件或附件。普通文本输入框通常不会把文件引用当作文本插入；此时请使用目标应用的文件上传/附件入口。

## 文件位置与隐私

生成的文件保存在当前用户的缓存目录：

    ~/Library/Caches/KeyDrop/<timestamp>-<id>/api-key.txt

KeyDrop 不联网，也不会把 API Key 发送到任何服务器。文件权限设置为当前用户可读写（`0600`）。如果不再需要历史 Key，请手动删除 `~/Library/Caches/KeyDrop/` 下对应的目录。

## 系统要求

- macOS 13 Ventura 或更高版本
- Apple Silicon 或 Intel Mac

## 从源码构建

需要安装 Xcode Command Line Tools 或完整 Xcode：

    git clone https://github.com/KurosawaGeeker/keydrop.git
    cd keydrop
    ./scripts/build.sh
    open build/KeyDrop.app

构建脚本会编译 arm64 和 x86_64 两个架构，合并为 Universal macOS 应用，并生成：

    dist/KeyDrop-macOS.zip

## 设计说明

系统剪贴板中的文件是一个文件引用，而不是一份独立的文本快照。如果每次都复用同一个路径，新的 API Key 会改写旧文件，导致之前复制出去的引用内容发生变化。KeyDrop 通过“时间戳目录 + 随机短 ID”保证每次生成都是不同路径，同时保持文件名始终为 `api-key.txt`。

## 开源协议

本项目以 [MIT License](LICENSE) 发布。
