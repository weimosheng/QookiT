# QookiT 隐私政策 · Privacy Policy

- **生效日期 / Effective Date**：2026 年 9 月 30 日
- **适用应用 / Applies to**：QookiT（包标识符 `cn.mhjz1.qookit`），1.1.0 及以后版本
- **适用平台 / Platforms**：Windows（Microsoft Store / 安装包）、macOS、Linux
- **文档用途**：本页面的公开访问地址用于填写 Microsoft Store 合作伙伴中心中的「隐私政策 URL」。

---

## 中文版

### 一、总则

QookiT 是一款运行在您本机上的 SSH / SFTP 桌面客户端。我们深知 SSH 客户端会接触服务器地址、账号与密钥等高度敏感的信息，因此本软件在设计上遵循**本地优先、零遥测**的原则：我们不运营任何用于收集用户数据的服务器。

### 二、信息摘要

| 事项 | 情况 |
| --- | --- |
| 是否收集可识别个人身份的信息 | **否** |
| 是否向开发者上传任何数据 | **否** |
| 是否包含遥测、使用统计或崩溃上报 | **否** |
| 是否包含广告或第三方数据分析 SDK | **否** |
| 是否需要联网 | 仅在您主动连接远程主机、或（非商店版本）主动检查更新时 |
| 是否包含应用内自更新 | 非商店版本：是（向 GitHub 检查更新）；Microsoft Store 版本：不自行更新，由商店服务代为下载与安装 |

### 三、我们不收集的信息

QookiT 不会收集、上传、出售或共享以下任何信息：

- 姓名、邮箱、电话号、住址等身份信息；
- 设备标识符、硬件指纹、广告 ID、IP 地址（用于分析目的）；
- 您的使用行为、功能点击、会话时长等统计数据；
- 崩溃日志、性能数据或诊断信息；
- 您的主机列表、用户名、密码、私钥、终端输入输出、传输的文件内容。

本软件不集成任何统计、分析、广告或崩溃上报组件。

### 四、仅保存在您设备本地的信息

为提供功能，QookiT 会在您的本地配置目录中写入以下数据。**这些数据始终留在您的设备上，不会以任何形式上传给开发者或第三方。**

| 平台 | 配置目录 |
| --- | --- |
| Windows | `%APPDATA%\QookiT\` |
| macOS | `~/Library/Application Support/QookiT/` |
| Linux | `~/.config/QookiT/` |

| 文件 / 位置 | 内容 | 保护方式 |
| --- | --- | --- |
| `hosts.json` | 主机名称、地址、端口、用户名、分组、初始目录 | 明文（不含凭据时） |
| `hosts.json` 中的 `password` / `passphrase` 字段 | 登录密码、私钥口令 | AES-256-GCM 加密 |
| `hosts.json` 中的私钥内容 | 您导入或粘贴的私钥文本 | **明文**（应用在连接时需读取原文） |
| `.masterkey` | 用于上述加密的本地主密钥 | 明文，权限依赖操作系统账户隔离 |
| `layouts.json` | 面板布局模板 | 明文 |
| `~/.ssh/known_hosts`（位于用户主目录，不在上述配置目录内） | 已信任主机的公钥指纹，用于校验服务器身份；**与 OpenSSH 共用同一文件** | 明文（标准 OpenSSH known_hosts 格式） |
| WebView 本地存储（`localStorage`） | 界面设置（字体、字号、缓冲区行数、默认端口与用户名、隐藏的工具面板等） | 明文 |

> **请注意**：主密钥 `.masterkey` 与 `hosts.json` 位于同一目录。请务必保护好您的操作系统账户与磁盘加密（如 BitLocker / FileVault），并切勿将配置目录分享给他人或提交到版本库。删除该目录即可彻底清除上述全部数据；但 `~/.ssh/known_hosts` 位于用户主目录，不受删除配置目录影响（它与您的 OpenSSH 客户端共用，请一并按需清理）。

### 五、网络通信

QookiT 仅在以下两种情形下产生网络连接：

1. **连接您指定的远程主机（由您主动发起）**
   当您连接某台主机时，应用会与您在「连接中心」中填写的服务器地址建立 SSH / SFTP 连接，并传输完成该操作所必需的数据（主机地址、端口、用户名、认证凭据、终端输入输出、文件传输内容等）。这些数据直接发送到**您指定的那台服务器**，其处理方式由该服务器的所有者或服务商决定，与开发者无关。

2. **检查更新（仅限非商店版本，且仅在您主动点击时发起）**
   当您在「设置」中点击「检查更新」时，应用会通过 HTTPS 向下列地址请求版本信息，以判断是否有新版本：
   `https://github.com/weimosheng/QookiT/releases/latest/download/latest.json`
   该请求由 GitHub 处理，GitHub 可能记录您的 IP 地址等请求元数据，适用 [GitHub 隐私声明](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement)。
   应用**不会**在您未点击的情况下自动联网检查更新。
   **MSIX 安装的版本（含从 Microsoft Store 安装）不会发起该请求**：该版本不包含自更新功能，商店版本的更新由下面第 3 条所述的方式完成。

3. **通过 Microsoft Store 检查更新（仅商店版本，且仅在您主动点击时发起）**
   若本应用是从 Microsoft Store 安装的，当您在「设置」中点击「检查更新」时，应用会通过 Windows 提供的 `Windows.Services.Store`（`StoreContext`）接口向 Microsoft Store 查询可用更新，并在您确认后请求商店下载安装。
   该调用由 Windows 与 Microsoft Store 服务处理，适用 [Microsoft 隐私声明](https://privacy.microsoft.com/privacystatement)。开发者不会从中获得任何数据，应用也不会在后台自动发起该请求。

除此之外，QookiT 不会建立任何其他网络连接。

### 六、第三方组件

| 组件 | 用途 | 涉及的数据 |
| --- | --- | --- |
| Microsoft Edge WebView2（Windows） | 渲染应用界面 | 仅本地渲染，适用 [Microsoft 隐私声明](https://privacy.microsoft.com/privacystatement) |
| GitHub Releases | 提供更新包下载 | 请求元数据（IP、User-Agent 等） |
| Microsoft Store 服务 | 商店版本的更新查询与安装（由 `StoreContext` 发起） | 由 Microsoft 依据其隐私声明处理 |
| 您连接的远程服务器 | 提供 SSH / SFTP 服务 | 您主动发送的连接与操作数据 |

当您从 **Microsoft Store** 安装本应用时，应用的下载、安装与更新可能由 Microsoft Store 服务完成，Microsoft 可能依据其自身政策收集相关信息，该部分数据处理适用 [Microsoft 隐私声明](https://privacy.microsoft.com/privacystatement)，不由开发者控制。

### 七、数据安全

- 主机密码与私钥口令使用 AES-256-GCM 加密后存储；
- SSH / SFTP 会话使用协议自身的加密与主机密钥校验机制；
- 所有配置数据仅存放于本地，不存在被开发者服务器泄露的风险；
- 由于主密钥与配置文件保存在同一目录，本地数据的安全性最终取决于您设备的账户与磁盘保护措施。

### 八、数据保留与删除

由于我们不收集任何数据，因此不存在服务端的数据保留问题。本地数据会一直保留在您的设备上，直到您主动删除。删除方式：

1. 在应用内删除对应主机与布局模板；
2. 或直接删除上述本地配置目录（Windows：`%APPDATA%\QookiT`）；
3. 卸载应用（**含**从 Microsoft Store 卸载）不会删除该配置目录，如需彻底清除请手动执行第 2 步。

### 九、儿童隐私

QookiT 是面向开发与运维人员的专业工具，不面向 13 周岁（或您所在司法辖区规定的更低年龄）以下儿童。由于我们不收集任何个人信息，不会出现收集儿童信息的情形。

### 十、您的权利

由于本软件不收集、不存储、不传输任何个人信息至开发者可控的系统，因此不存在需要向开发者提出访问、更正、删除或导出个人数据请求的情形。若您对本地数据的处理仍有疑问，可通过下方联系方式与我们联系。

### 十一、政策变更

本隐私政策可能随功能变化而更新。更新后我们会修改页面顶部的生效日期，重大变更会在应用内或发布说明中提示。继续使用新版应用即表示您接受更新后的政策。

### 十二、联系方式

如对本隐私政策有任何疑问，请联系：

- 邮箱：`veimos@mhjz1.cn`
- 问题反馈：<https://github.com/weimosheng/QookiT/issues>

---

## English Version

### 1. Overview

QookiT is a desktop SSH / SFTP client that runs entirely on your own machine. We understand that an SSH client handles highly sensitive information such as server addresses, accounts, and keys. QookiT is therefore designed around **local-first operation and zero telemetry**: we do not operate any server that collects user data.

### 2. Summary

| Item | Status |
| --- | --- |
| Collects personally identifiable information | **No** |
| Uploads any data to the developer | **No** |
| Includes telemetry, usage analytics or crash reporting | **No** |
| Includes advertising or third-party analytics SDKs | **No** |
| Requires an internet connection | Only when you connect to a remote host, or (for non-Store builds) when you check for updates |
| 是否包含应用内自更新 | Non-Store builds: yes (checks GitHub for updates). Microsoft Store builds: no self-update; the Store service downloads and installs updates on request |

### 3. Information We Do Not Collect

QookiT does not collect, upload, sell or share:

- Identity information such as name, email address, phone number or postal address;
- Device identifiers, hardware fingerprints, advertising IDs, or IP addresses for analytics purposes;
- Usage behavior, feature interactions or session duration statistics;
- Crash logs, performance data or diagnostic information;
- Your host list, usernames, passwords, private keys, terminal input/output, or transferred file contents.

The application does not embed any analytics, tracking, advertising or crash-reporting component.

### 4. Information Stored Locally on Your Device Only

To provide its functionality, QookiT writes the following data into your local configuration directory. **This data always remains on your device and is never uploaded to the developer or any third party.**

| Platform | Configuration directory |
| --- | --- |
| Windows | `%APPDATA%\QookiT\` |
| macOS | `~/Library/Application Support/QookiT/` |
| Linux | `~/.config/QookiT/` |

| File / Location | Contents | Protection |
| --- | --- | --- |
| `hosts.json` | Host name, address, port, username, group, initial directory | Plain text (contains no credentials) |
| `password` / `passphrase` fields in `hosts.json` | Login password, private key passphrase | Encrypted with AES-256-GCM |
| Private key content in `hosts.json` | Private key text you imported or pasted | **Plain text** (the raw key is required to establish connections) |
| `.masterkey` | Local master key used for the encryption above | Plain text; protected only by OS account isolation |
| `layouts.json` | Panel layout templates | Plain text |
| `~/.ssh/known_hosts` (in your home directory, outside the configuration directory above) | Public key fingerprints of trusted hosts, used to verify server identity; **shared with OpenSSH** | Plain text (standard OpenSSH known_hosts format) |
| WebView local storage (`localStorage`) | UI settings (font, size, scrollback, default port and username, hidden tools, etc.) | Plain text |

> **Please note**: the master key `.masterkey` resides in the same directory as `hosts.json`. Protect your operating system account and disk encryption (e.g. BitLocker / FileVault), and never share the configuration directory with others or commit it to a repository. Deleting that directory permanently removes all of the data listed above; `~/.ssh/known_hosts` lives in your home directory and is unaffected by that deletion (it is shared with your OpenSSH client, so clean it up separately if needed).

### 5. Network Communications

QookiT initiates network connections only in the following two cases:

1. **Connecting to remote hosts you specify (initiated by you)**
   When you connect to a host, the app establishes an SSH / SFTP connection to the server address you entered in the Connection Center and transmits the data required to complete that operation (host address, port, username, credentials, terminal input/output, file transfer contents). This data goes directly to **the server you specified**; its handling is determined by that server's owner or provider and is outside the developer's control.

2. **Update check (non-Store builds only, and only when you click the button)**
   When you click "Check for updates" in Settings, the app requests version information over HTTPS from:
   `https://github.com/weimosheng/QookiT/releases/latest/download/latest.json`
   This request is handled by GitHub, which may log request metadata such as your IP address, subject to the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement).
   The app does **not** check for updates automatically in the background.
   **Builds installed as an MSIX package (including from the Microsoft Store) never make this request**: they contain no self-update capability; updates for the Store build are handled as described in item 3 below.

3. **Update check through the Microsoft Store (Store builds only, and only when you click)**
   If the app was installed from the Microsoft Store, clicking "Check for updates" in Settings makes the app query the Microsoft Store through the Windows-provided `Windows.Services.Store` (`StoreContext`) API and, after your confirmation, ask the Store to download and install the update.
   This call is handled by Windows and Microsoft Store services and is subject to the [Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement). The developer receives no data from it, and the app never makes this request automatically in the background.

Apart from the above, QookiT makes no other network connections.

### 6. Third-Party Components

| Component | Purpose | Data involved |
| --- | --- | --- |
| Microsoft Edge WebView2 (Windows) | Renders the application UI | Local rendering only; subject to the [Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement) |
| GitHub Releases | Distributes update packages | Request metadata (IP address, User-Agent) |
| Microsoft Store services | Update lookup and installation for Store builds (via `StoreContext`) | Handled by Microsoft under its own privacy statement |
| Remote servers you connect to | Provide SSH / SFTP services | Connection and operation data you actively send |

If you install this application from the **Microsoft Store**, downloading, installation and updating may be handled by Microsoft Store services, and Microsoft may collect related information under its own policies. Such processing is governed by the [Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement) and is not controlled by the developer.

### 7. Data Security

- Host passwords and private key passphrases are encrypted with AES-256-GCM before being written to disk;
- SSH / SFTP sessions use the protocol's own encryption and host key verification;
- All configuration data is stored locally, so there is no risk of exposure through a developer-operated server;
- Because the master key is stored alongside the configuration files, the security of local data ultimately depends on your device's account and disk protection.

### 8. Data Retention and Deletion

Since we collect no data, there is no server-side retention. Local data remains on your device until you delete it. To delete it:

1. Remove the corresponding hosts and layout templates inside the app, or
2. Delete the local configuration directory directly (Windows: `%APPDATA%\QookiT`).
3. Uninstalling the application (including uninstalling it from the Microsoft Store) does not remove that configuration directory; perform step 2 for a complete wipe.

### 9. Children's Privacy

QookiT is a professional tool for developers and system administrators and is not directed at children under 13 (or the minimum age in your jurisdiction). As we collect no personal information, we do not knowingly collect data from children.

### 10. Your Rights

Because the software does not collect, store or transmit any personal information to systems controlled by the developer, there is no scenario in which you would need to request access, correction, deletion or portability of personal data from the developer. If you still have questions about how local data is handled, please contact us using the details below.

### 11. Changes to This Policy

This Privacy Policy may be updated as the application evolves. When it changes, we will update the effective date at the top of this page; significant changes will also be noted in the app or in the release notes. Continued use of a newer version constitutes acceptance of the updated policy.

### 12. Contact

For any questions about this Privacy Policy, please contact:

- Email: `veimos@mhjz1.cn`
- Issue tracker: <https://github.com/weimosheng/QookiT/issues>
