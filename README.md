<img src="chrome/extension/assets/icon-128.png" width="72" height="72" alt="KeyDrop：把密钥交给 Agent">

# KeyDrop

**把 Key 交给你的 Agent。**

将 API Key 生成为文件，直接复制或拖入支持附件的工具。不用再打开编辑器、新建文件、保存，再去找它。

KeyDrop 的 Drop 是 drag-and-drop：拖入、粘贴、交接。支持原生 macOS 应用，以及 Chrome / EgoLite 浏览器扩展。

[浏览器扩展安装说明](chrome/README.md) · [macOS 下载](https://github.com/KurosawaGeeker/keydrop/releases)

## 一次复制，交接一个文件

1. 粘贴 API Key，或手动读取剪贴板。
2. 点击“生成并复制文件”。文件本身会进入系统剪贴板，不是文件路径文本。
3. 在支持文件的 Agent 输入框按 `⌘V`。浏览器版也提供拖拽与下载副本。

默认只有一个输入行、名称留空，生成 `api-key.txt`，保留原始内容且不追加换行。点击 `+` 才增加一行，多个无名称的 Key 按行写入同一个文件。`−` 移除当前行，已有内容时先确认。

需要结构化文件时，可以手动填写名称并选择 JSON 或 YAML。名称必须齐全且不重复，不自动识别名称或拆分密钥。浏览器版始终提供 TXT / JSON / YAML 选择；原生应用在填写名称后显示结构化格式选项。

## 浏览器里的快捷入口

为可信网站开启“网站快捷入口”后，KeyDrop 会尝试在 API Key 的复制按钮旁显示自己的标志。

- 点击 KeyDrop 标志：直接生成并复制 `api-key.txt`。
- 点击网站原来的复制按钮：打开编辑窗口，能确定对应字段时自动填入。
- 编辑窗口支持眼睛图标切换明文、多行、可选名称、格式选择、再次复制与清理。
- 所有网站默认关闭，按站点申请权限；不后台轮询剪贴板。

浏览器版的文件剪贴板功能依赖本机 macOS 助手。当前未提供 Windows / Linux 助手。不同网站组件可能无法识别，此时可以打开 KeyDrop 手动粘贴；没有访问真实账号来验证所有平台的兼容性。

详见[安装、权限与本机测试](chrome/README.md)。

## 隐私边界，说清楚

KeyDrop 本身没有密钥上传、遥测、远程脚本或云端处理。密钥只在本机浏览器、助手进程、剪贴板与生成文件之间流转。

**文件不等于加密。** 本机处理需要接触明文；把文件提交到在线 Agent 或其他服务后，对方仍可能读取明文。KeyDrop 不保证第三方服务不上传、不入库，也无法阻止同一用户的恶意程序、剪贴板历史或备份读取文件。

生成文件保存在：

```text
~/Library/Caches/KeyDrop/<timestamp>-<id>/api-key.txt
```

目录权限为 `0700`，文件权限为 `0600`。每次生成使用独立路径，避免改写之前复制出去的文件引用。浏览器版“再次复制”复用同一文件，不生成额外副本。

## 用完后清理

原生应用的“清理历史文件”，或浏览器版“文件清理 → 清理临时文件”，会先要求确认，再删除 KeyDrop 缓存内各时间段的已生成文件。不会扫描整个用户目录，也不会删除不属于 KeyDrop 的文件或符号链接。

下载副本需单独清理。移动过的文件、备份、已上传附件和第三方剪贴板历史不在清理范围内。删除不可撤销，但不是安全擦除。关闭编辑窗口只丢弃当前输入，不删除已生成文件。

## 从源码构建

原生应用需要 macOS 13+ 和 Xcode Command Line Tools，支持 Apple Silicon 与 Intel：

```sh
git clone https://github.com/KurosawaGeeker/keydrop.git
cd keydrop
./scripts/build.sh
open build/KeyDrop.app
```

产物为 `dist/KeyDrop-macOS.zip`。浏览器版的构建和助手安装见 [chrome/README.md](chrome/README.md)。

原生格式回归测试只使用虚构密钥：

```sh
xcrun swiftc Sources/KeyPayload.swift Tests/KeyPayloadTests.swift -o /tmp/keydrop-payload-tests
/tmp/keydrop-payload-tests
```

## 品牌与开源

标志将钥匙和移交箭头组合为一个形状，代表“把 Key 交给 Agent”。[品牌资产与构建说明](brand/README.md)。

KeyDrop 以 [MIT License](LICENSE) 发布。感谢 [LINUX DO 社区](https://linux.do) 的交流与支持。
