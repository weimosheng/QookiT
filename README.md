# QookiT

> 一个基于 Tauri 2 + Rust（russh）打造的现代化、可扩展 SSH 客户端。

QookiT 使用 Rust 侧的 `russh` 实现完整的 SSH 协议栈，前端通过 Tauri 命令与事件通道与之交互，
提供主机管理、多标签终端与 SFTP 文件管理能力。

## 特性

- **主机管理** — 保存主机地址、端口、用户名、分组与初始目录，支持密码 / 私钥两种认证方式。
- **凭据加密存储** — 密码与私钥口令使用 AES-256-GCM 加密后写入本地 `hosts.json`，主密钥单独存放于 `.masterkey`。
- **多标签终端** — 基于 xterm.js 的完整交互式终端，支持多会话标签、可拖拽分割布局与尺寸自适应。
- **SFTP 文件管理** — 远程目录浏览、新建 / 重命名 / 删除、路径跳转与文件读写。
- **连通性检测** — 连接前可对主机做 ping 探测，快速定位网络问题。
- **无边框界面** — 自定义标题栏与主题切换，桌面端原生观感。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · HeroUI · Zustand · xterm.js · framer-motion · react-resizable-panels |
| 后端 | Tauri 2 · Rust 2021 · russh · russh-sftp · tokio · aes-gcm · serde |

## 环境要求

- Node.js ≥ 20 与 [pnpm](https://pnpm.io/)
- Rust 稳定版工具链（建议通过 [rustup](https://rustup.rs/) 安装）
- 平台依赖：
  - **Windows** — WebView2 运行时（Win10/11 通常已内置）、MSVC 生成工具
  - **macOS** — `xcode-select --install`
  - **Linux** — `webkit2gtk-4.1`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`build-essential`

## 开发

```bash
# 安装前端依赖
pnpm install

# 启动桌面应用（会同时拉起 Vite 与 Rust 侧），首次编译耗时较长
pnpm tauri dev
```

若只想调试前端界面：

```bash
pnpm dev
```

> 注意：直接使用 Vite 开发服务器时，Tauri 的 `invoke` 命令与事件均不可用，界面会停留在未连接状态。

## 构建安装包

```bash
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/`。

## 目录结构

```text
QookiT/
├── src/                        # 前端
│   ├── components/             # 通用 UI（标题栏、连接中心、对话框等）
│   ├── features/               # 业务模块：connection / terminal / sftp
│   ├── services/               # Tauri 命令封装
│   ├── stores/                 # Zustand 状态
│   └── types/                  # 类型与事件定义
└── src-tauri/                  # Rust 后端
    ├── src/commands/           # 暴露给前端的命令
    ├── src/hosts/              # 主机模型与加密存储
    ├── src/ssh/                # SSH 连接、认证、终端、SFTP
    └── capabilities/           # Tauri 权限声明
```

## 本地数据

| 平台 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\QookiT\` |
| macOS | `~/Library/Application Support/QookiT/` |
| Linux | `~/.config/QookiT/` |

- `hosts.json` — 主机列表（密码与私钥口令均已加密）
- `.masterkey` — 本地主密钥，**切勿提交到版本库或分享给他人**

## 安全说明

- 主机配置与主密钥仅保存在本地配置目录，不会上传到任何服务器。
- 私钥文件的**内容**会以原文形式存入 `hosts.json`，请自行确保该目录的访问权限。
- 提交 Issue 时请勿粘贴真实主机地址、用户名或密钥内容。

## 参与贡献

欢迎提交 Issue 与 Pull Request。提交前建议先本地验证：

```bash
pnpm build                      # TypeScript 类型检查 + 前端构建
cd src-tauri; cargo check       # Rust 侧编译检查
```

## 许可证

本项目采用 [GNU General Public License v3.0 or later](LICENSE) 授权。
