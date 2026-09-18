# KeyDrop for Chrome / EgoLite · 0.3.4

0.3.4 将“本网站快捷入口”权限状态放回主弹窗：从具体网站打开时可查看并手动允许或关闭；预览页不连接浏览器权限。

0.3.3 将输入框改为胶囊形、加号改为圆形。离线预览与插件共用增删行和明文切换逻辑；预览输入仍为只读，不连接剪贴板或文件操作。

<img src="extension/assets/icon-128.png" width="64" height="64" alt="KeyDrop：剪贴板上的三把黑色钥匙">

**把 Key 交给你的 Agent。** Drop 指拖入和交接，不是水滴。复制、生成、粘贴或拖拽，让密钥以文件的形式交给你正在使用的工具。

在本机将 API Key 生成 TXT、JSON 或 YAML 文件，自动将**文件本身**放进 macOS 系统剪贴板。不是复制路径字符串，也不是只提供下载链接。目标应用需要支持粘贴文件；将文件粘贴到网络服务并提交后，该服务仍然可能收到明文。

## 安装

1. 在浏览器扩展管理中加载 `KeyDrop-Chrome` 目录。旧版用户保持原目录不变，更新后重新加载扩展；浏览器若要求确认新增“与本机应用通信”权限，需要确认后才能使用。
2. macOS 需要安装本机文件助手。在源码仓库根目录执行 `bash chrome/native/build.sh`，再运行 `node chrome/native/install.mjs 扩展ID`。扩展 ID 在扩展管理中查看。
3. 安装脚本只安装 KeyDrop 本机助手及 Chrome、EgoLite 的 Native Messaging 注册，不修改浏览器偏好、不关闭安全机制、不启动网络服务。EgoLite 注册位置需要以实际安装版验证为准。
4. 打开工具栏 KeyDrop，看到“本机助手已连接”后即可手动粘贴、生成并复制文件。助手未连接时不会冒充复制成功。
5. 网站权限管理位于浏览器的 KeyDrop 扩展设置页：输入网站地址，点击“开启快捷入口”，授权后刷新目标网页。主弹窗不再显示网站设置区。默认不开启任何网站；手动读剪贴板权限单独申请。

安装路径：本机助手位于 `~/Library/Application Support/KeyDrop/BrowserBridge/`。生成文件位于 `~/Library/Caches/KeyDrop/时间戳-随机ID/api-key.txt`（或 json/yaml），与原生 KeyDrop 共享缓存清理规则。目录权限 0700，文件权限 0600。

## 使用

- 初始只有一行、名称为空、默认 TXT。不自动添加行，不自动推测名称。
- 点击 `+` 手动添加；`−` 移除当前行，已填行需要确认，至少保留一行。
- 眼睛图标切换明文/隐藏；默认隐藏。
- TXT 保留单个值原文，多行用换行分隔。JSON/YAML 始终可选；有名称时必须每行命名且不重复，无名称时输出字符串或列表。填写名称后需要手动选择 JSON/YAML，不会静默丢弃名称。
- “生成并复制文件”等待本机助手创建文件并写入系统剪贴板，确认成功后才能显示成功。
- 成功后点击“复制 api-key.txt / json / yaml”可重新复制同一文件，不生成重复副本；也可下载副本或拖拽文件。
- 网页 KeyDrop 图标：在可信网站的 API Key 复制按钮旁显示。点击直接生成 TXT 并复制；不需要先点击网站 Copy。
- 网页原 Copy：真实点击即打开独立编辑窗口；对应字段可以确定时自动填入。不会依赖 Copied 状态、浏览器窗口焦点或剪贴板轮询。若已有编辑窗口，保留草稿不覆盖。

## 清理

点击“文件清理”按钮并确认，可永久删除原生应用与浏览器助手在 KeyDrop 缓存内生成的 TXT/JSON/YAML，覆盖各时间段。按共享的文件名、时间戳目录和非符号链接规则清理；不扫描用户目录，不删除其他文件。

确认框中的“同时清理下载副本”默认不勾选；勾选后只删除插件记录且核验下载 ID、扩展归属和 Blob 来源的下载文件。移动、复制、备份、已上传附件不在清理范围。文件删除不是安全擦除，不清理第三方剪贴板历史。关闭窗口丢弃输入，不删除已生成文件。

## 技术方案与隐私边界

检测器运行在获授权网页的隔离脚本环境。扫描时只读短 UI 标签与标题，不读取密钥字段。仅在用户真实点击 Copy 或 KeyDrop 图标后，读取邻近的唯一输入框、代码块或完整 `sk-` 文本；不确定时不猜测，不读取陈旧剪贴板，不劫持网站 `writeText`，不调用 API 创建真实密钥。

密钥从内容脚本经浏览器内部消息传给后台，再经 Native Messaging 的标准输入/输出传给本机助手。自动弹窗填充值只在后台内存短暂保留 15 秒，领取后删除；不会放进 URL、扩展存储或日志。编辑窗口保留当前草稿直至关闭。文件路径不返回网页。

扩展和本机助手没有 HTTP、WebSocket、遥测、远程脚本或云端调用；扩展页 CSP 禁止网络连接。没有 localhost 密钥服务、监听端口或 bash 密钥参数。本机处理明文是必要行为，不能等同于“内存从未接触明文”。同一用户的恶意程序、剪贴板工具、备份和手动上传不受此机制保护。

Native host 校验调用扩展来源、请求大小、文件名白名单、文件 ID 和符号链接；清理复用原生 KeyDrop 的范围限制。权限仅授权这个扩展 ID。本版本要求 macOS；Windows/Linux 尚无本机文件助手。

| 权限                  | 用途                            |
| --------------------- | ------------------------------- |
| activeTab / scripting | 配置当前网站和注入获授权网站    |
| nativeMessaging       | 与本机文件剪贴板助手通信        |
| storage / downloads   | 仅保存下载 ID，管理可选下载副本 |
| clipboardRead（可选） | 用户点击“读取剪贴板”时申请      |
| 网站权限（可选）      | 逐站开启，可关闭                |

## 网站调研与验证边界

2026-09-12 无登录、无 Cookie 请求 DeepSeek 公开入口及其静态 JS，检查到 `ds-modal-content` 的 div 标题、`ds-copyable-text-line` 的 span 密钥、独立 action 容器与 `navigator.clipboard.writeText` / `execCommand('copy')` 回退。仿制页面按这些结构覆盖测试，未运行网站打包代码或调用其 API。

OpenAI 未登录公开入口返回 403；不绕过验证、不读取登录页面、不使用用户密钥。OpenAI 部分使用通用弹窗结构的假值测试，不能宣称已在真实账号弹窗验收。图标无标签按钮、跨域 iframe、封闭 Shadow DOM、纯快捷键复制等仍有识别边界。不存在所有平台通用的复制组件。

参考：[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)、[Apple NSPasteboard](<https://developer.apple.com/documentation/appkit/nspasteboard/writeobjects(_:)>)、[DeepSeek 公开入口](https://platform.deepseek.com/)、[此次检查的公开静态脚本](https://fe-static.deepseek.com/platform/static/main.413c8ad5bb.js)。

## 本机测试

首次运行：在 `chrome` 目录执行 `npm ci` 和 `npx playwright install chromium`。开发工具的安装需要联网，密钥测试本身只使用本机假数据。`npm run build:assets` 从 `brand/keydrop-mark.svg` 和 Tabler Icons 生成全部离线图标；构建资产已随源码提交，加载插件无需安装 Node.js。

0.3.2 精简主弹窗：删除营销标题、常驻说明、计数与底部设置区；TXT/JSON/YAML 改为三个平铺单选项，“名称”只保留字段名。文件清理改成一个按钮，确认后执行；操作错误仍会显示。网站权限管理移入扩展设置，初始窗口高度缩为 430px。

0.3.1 将工具栏、编辑窗口和网页入口替换为三把黑色钥匙的剪贴板标志，保留圆环和环内模型图标。全部尺寸从同一份 SVG 生成，附带 Lobe Icons 的 MIT 许可；网页入口改用中性色。没有新增权限或更改密钥处理流程。

0.3.0 更新了浅色/深色编辑窗口、操作文案和文件卡片，并将工具栏、窗口及网页入口统一为新的移交标志。网页图标通过 Canvas 绘制内置像素，即使页面设置 `img-src 'none'` 也无需请求图片。无新增运行时权限；沿用 0.2.0 的本机助手协议。

可访问性测试覆盖浅色/深色、360/550px 窗口和 WCAG A/AA 自动规则。`KEYDROP_SYSTEM_CLIPBOARD_QA=1 npm run test:browser` 额外验证真实 macOS 文件剪贴板及 ⌘V；只写假值，原剪贴板暂存本机进程内存，并在仍属于测试时恢复。

运行 `npm test` 测试序列化、图标资产和编辑器 DOM 交互（仅假数据，模拟本机接口，不访问系统剪贴板）；运行 `bash tests/run.sh` 编译并运行原生和 Chromium 集成测试。测试只用假密钥、隔离浏览器配置、临时目录和独立命名剪贴板，不访问用户缓存或真实平台页面。

运行 `node tests/serve.mjs`，打开 `http://127.0.0.1:18743` 可进行手动真实文件粘贴测试。服务只绑定本机地址，静态假值页面禁止外部资源和连接。它是测试页面，不是生产密钥传输通道。
