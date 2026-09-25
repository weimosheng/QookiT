<div align="center">

<img src="src-tauri/icons/128x128.png" alt="QookiT" width="128" />

# QookiT

**一款现代化、跨平台的轻量级 SSH / SFTP 桌面客户端**

[![version](https://img.shields.io/github/v/tag/weimosheng/QookiT?color=e89a4b&label=version)](https://github.com/weimosheng/QookiT/tags)
[![license](https://img.shields.io/github/license/weimosheng/QookiT?color=3da639)](LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-4b8bbe)](#下载安装)
[![tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)

</div>

QookiT 在 Rust 侧基于 `russh` 实现完整的 SSH 协议栈（连接、认证、终端、SFTP、远程执行），
前端通过 Tauri 命令与事件通道与之通信。连接前在**连接中心**管理主机与凭据，连接后进入**面板工作区**：
终端、文件管理、搜索、命令面板与性能监控都是可拖拽的独立面板，可按习惯自由排布。

## 特性

### 主机与连接

- **主机管理** — 保存名称、地址、端口、用户名、分组与初始目录，随时编辑或删除。
- **两种认证方式** — 密码认证，或粘贴 / 读取本地私钥文件进行公钥认证。
- **凭据加密存储** — 密码与私钥口令使用 AES-256-GCM 加密后写入本地 `hosts.json`，主密钥单独存放于 `.masterkey`。
- **连通性检测** — 一键探测全部主机或单台主机，连接前先定位网络问题。
- **多标签会话** — 每台主机一个标签页，切换标签不会中断已建立的会话。

### 终端

- 基于 xterm.js 的完整交互式终端，随窗口尺寸自适应。
- 单个连接可开多个终端实例，输出缓冲区在标签切换后仍然保留。
- 右键菜单：复制（`Ctrl+Shift+C`）、粘贴（`Ctrl+Shift+V`）、清屏。

### 文件管理

- 树形目录浏览，按需懒加载，可一键折叠全部。
- 新建文件夹、重命名、删除、复制路径。
- 剪切 / 复制 / 粘贴，跨目录移动或复制文件。
- 目录内快速搜索并高亮定位结果，支持在终端中打开当前目录。

### 效率工具

- **全局搜索** — 直接在远程主机上执行 `grep`：支持大小写敏感、正则、全词匹配与文件通配，结果按文件分组、点击跳转。
- **命令面板** — 收藏常用命令并保留执行历史，一键发送到当前终端。
- **性能监控** — CPU、内存、磁盘、网络与负载均值实时采样，带趋势图表，采样间隔 1s / 2s / 5s 可调、可暂停。
- **布局模板** — 将当前面板布局保存为模板，一键切换或恢复默认，支持导入 / 导出 JSON 与他人共享。

### 界面

- 无边框窗口与自定义标题栏，暗 / 亮主题随时切换。
- 面板拖拽、尺寸调整与细腻的过渡动画。

## 下载安装

前往 [Releases](https://github.com/weimosheng/QookiT/releases) 下载对应平台的安装包（推送 `v*` 标签后由 CI 自动构建）：

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Windows | `.exe`（NSIS 安装器） | 常规安装，可选择安装目录 |
| Windows | `.msix` | 应用包格式，适合企业分发或上架 Microsoft Store |
| Windows | `*-portable.zip` | 便携版，解压后直接运行 |
| macOS | `.dmg` | 通用二进制，同时支持 Intel 与 Apple Silicon |
| Linux | `.deb` / `.rpm` | 发行版原生包 |
| Linux | `.AppImage` | 免安装单文件，`chmod +x` 后直接运行 |

**首次运行提示**

- 安装包目前**未做代码签名**：Windows 会弹出 SmartScreen 提示，选择「更多信息 → 仍要运行」；macOS 请右键应用选择「打开」，或执行 `xattr -dr com.apple.quarantine /Applications/QookiT.app`。
- Linux 需要图形桌面环境与 `webkit2gtk-4.1` 等运行库；AppImage 需要系统已安装 FUSE。

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
pnpm install      # 安装前端依赖
pnpm tauri dev    # 启动桌面应用（同时拉起 Vite 与 Rust 侧），首次编译耗时较长
```

`pnpm tauri dev` 会把 Vite 固定在 1425 端口，并在 Rust 侧改动后自动重新编译。
若只想调试前端界面，可以单独运行 `pnpm dev`：

> 注意：直接使用 Vite 开发服务器时，Tauri 的 `invoke` 命令与事件均不可用，界面会停留在未连接状态。

## 构建与发布

```bash
pnpm build                        # TypeScript 类型检查 + 前端构建
cd src-tauri; cargo check         # Rust 侧编译检查
pnpm tauri build                  # 构建当前平台的安装包
pnpm tauri build --bundles nsis   # 只构建指定格式（nsis / dmg / deb / rpm / appimage …）
```

产物位于 `src-tauri/target/release/bundle/`。

推送 `v*` 标签（或在 Actions 中手动触发）会执行 [`.github/workflows/release.yml`](.github/workflows/release.yml)：
并行构建 Windows / macOS / Linux 产物（Windows 额外生成并签名 MSIX），统一收集安装包与便携版后创建 Release。

## 目录结构

```text
QookiT/
├── src/                        # 前端
│   ├── components/             # 通用 UI（标题栏、连接中心、对话框等）
│   ├── features/               # 业务模块
│   │   ├── connection/         # 连接工作区
│   │   ├── dock/               # 可拖拽面板工作区与工具注册
│   │   ├── terminal/           # xterm.js 终端
│   │   ├── sftp/               # 远程文件管理器
│   │   ├── search/             # 远程内容搜索
│   │   ├── command/            # 命令面板
│   │   └── performance/        # 性能监控
│   ├── services/               # Tauri 命令封装
│   ├── stores/                 # Zustand 状态
│   └── types/                  # 类型与事件定义
└── src-tauri/                  # Rust 后端
    ├── src/commands/           # 暴露给前端的命令
    ├── src/hosts/              # 主机模型与加密存储
    ├── src/ssh/                # SSH 连接、认证、终端、SFTP
    ├── msix/                   # Windows MSIX 清单模板
    └── capabilities/           # Tauri 权限声明
```

## 本地数据

| 平台 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\QookiT\` |
| macOS | `~/Library/Application Support/QookiT/` |
| Linux | `~/.config/QookiT/` |

- `hosts.json` — 主机列表（密码与私钥口令均已加密）
- `layouts.json` — 面板布局模板
- `.masterkey` — 本地主密钥，**切勿提交到版本库或分享给他人**

## 快捷键与操作

| 操作 | 方式 |
| --- | --- |
| 复制 / 粘贴终端内容 | `Ctrl+Shift+C` / `Ctrl+Shift+V`，或终端右键菜单 |
| 清屏 | 终端右键菜单 |
| 切换主机标签 / 回到连接中心 | 标题栏标签，左侧「连接中心」 |
| 新增面板、切换工具 | 工作区左侧图标栏 + 面板标签 |
| 保存 / 恢复 / 导入 / 导出布局 | 工作区左下角「布局管理」 |
| 探测主机连通性 | 连接中心的主机条目，或一键探测全部 |

## 安全说明

- 主机配置与主密钥仅保存在本地配置目录，不会上传到任何服务器。
- 私钥文件的**内容**会以原文形式存入 `hosts.json`，请自行确保该目录的访问权限。
- 全局搜索、性能采样等功能会在目标主机上执行 shell 命令，请仅在受信任的主机上使用。
- 提交 Issue 时请勿粘贴真实主机地址、用户名或密钥内容。

## 参与贡献

欢迎提交 Issue 与 Pull Request。提交前建议先本地验证：

```bash
pnpm build                      # TypeScript 类型检查 + 前端构建
cd src-tauri; cargo check       # Rust 侧编译检查
```

发版时请注意版本号需在 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 三处保持一致。

## 许可证

本项目采用 [GNU General Public License v3.0 or later](LICENSE) 授权。
