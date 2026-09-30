# 上架 Microsoft Store（MSIX）操作手册

本项目的 Windows 侧同时维护两条分发链路，**同一个二进制**，靠运行期探测区分：

| 链路 | 产物 | 更新方式 |
| --- | --- | --- |
| 仓库直发 / 侧载 | `QookiT_<ver>_x64.msix`（自签名）+ NSIS `.exe` + portable zip | 应用内「设置 → 关于 → 检查更新」（Tauri updater） |
| Microsoft Store | `QookiT_<ver>_x64_store.msixupload`（未签名） | 应用内点击检查更新 → 调用 Microsoft Store 官方接口（`StoreContext`），由商店下载并安装 |

## 为什么必须区分

MSIX 安装后，应用文件位于 `C:\Program Files\WindowsApps\<包全名>\`，该目录对应用**只读**；
Tauri 自更新需要替换自身可执行文件，在打包运行时必然失败。因此：

- 运行期用 `GetCurrentPackageFullName` 判断是否存在**包标识**（`src-tauri/src/packaging.rs`）；
- 存在包标识（即 MSIX / Store 安装）时**不注册** updater 插件（`src-tauri/src/lib.rs`）；
- 前端「设置 → 关于」改走 Microsoft Store 更新通道（`src/components/SettingsModal.tsx`）。

判定用的是 Windows API 而非编译期开关，因为 CI 中 NSIS 与 MSIX 复用同一次构建产物。

## 商店版本的应用内更新（StoreContext）

商店版本不会自我更新，而是调用微软官方接口 **`Windows.Services.Store.StoreContext`**，由商店完成下载与部署：

| 步骤 | API |
| --- | --- |
| 获取上下文 | `StoreContext::GetDefault()` |
| 查询更新 | `GetAppAndOptionalStorePackageUpdatesAsync()` |
| 下载并安装 | `RequestDownloadAndInstallStorePackageUpdatesAsync(&updates)` |

实现位于 `src-tauri/src/store_update.rs`，命令为 `check_store_updates` / `install_store_updates`。

要点：

- `StoreContext` 属于 WinRT，调用线程需先初始化公寓。代码在阻塞线程上先调用 `RoInitialize(RO_INIT_MULTITHREADED)`
  再执行（**不要**在 UI 主线程上阻塞等待，STA + 阻塞会死锁）。
- 等待异步完成使用 `windows-future` 提供的 `IAsyncOperation::join()`（阻塞版本，无需 async 运行时）。
- 安装完成后当前进程仍是旧版本，需要用户重启应用；因此界面提示「更新已安装，请重启应用」。
- 依赖：`[target.'cfg(windows)'.dependencies]` 中的 `windows = { features = ["Services_Store", "Win32_System_WinRT"] }`，
  版本与 tauri/tao 已在依赖树里的 `windows 0.62` 一致（不在 Windows 构建中链接该依赖）。

### 失败回退

`StoreContext` **要求应用由 Microsoft Store 安装且已上架**：

| 场景 | 结果 |
| --- | --- |
| 商店安装 + 已上架 | 正常查询并安装更新 |
| 侧载 `.msix` / NSIS 安装包版本 | 调用报错 → 界面显示错误原因，并保留「商店更新页」按钮 |
| 已提交但尚未审核通过 | 通常查不到更新（返回空列表） |
| 无网络 / 商店不可用 | 调用报错 → 同样回退 |

因此发布前无法在本地验证该通道的完整效果，只能验证错误分支；上架后建议用商店安装的版本实测一次。

## 一次性准备

1. 在[合作伙伴中心](https://partner.microsoft.com/dashboard)保留应用名，取得**产品标识**：
   - `Package/Identity/Name`（形如 `12345Publisher.QookiT`）
   - `Package/Identity/Publisher`（形如 `CN=ABCDEF12-3456-7890-ABCD-EF1234567890`）
2. 在 GitHub 仓库配好下面这些 **Variables** 与 **Secrets**（Settings → Secrets and variables → Actions）。

**Variables（明文）**

| 变量 | 用途 | 必填? | 未配置时的回退 |
| --- | --- | --- | --- |
| `MSIX_STORE_PACKAGE_NAME` | 商店上传包 Identity/Name（= 产品标识 `Package/Identity/Name`） | **上架必填** | 回退为 `MSIX_PACKAGE_NAME` → `QookiT` |
| `MSIX_STORE_PUBLISHER` | 商店上传包 Identity/Publisher（= 产品标识 `Package/Identity/Publisher`） | **上架必填** | 回退为 `MSIX_PUBLISHER` → `CN=QookiT` |
| `MSIX_PACKAGE_NAME` | 侧载包 Identity/Name | 可选 | `QookiT` |
| `MSIX_PUBLISHER` | 侧载包 Publisher，需与签名证书 Subject 一致 | 可选 | `CN=QookiT` |

**Secrets（加密）**

| 密钥 | 用途 | 必填? |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | 应用内自更新签名（Tauri updater）；缺失会导致打不出 updater 产物 | **构建必填** |
| `MSIX_CERT_PFX_B64` | 侧载 MSIX 的正式代码签名证书（`.pfx` 的 base64） | 可选，缺失则用自签名 |
| `MSIX_CERT_PASSWORD` | 上面证书的密码 | 与上项配套 |

> `MSIX_STORE_*` 未配置时，CI 会打出身份为 `QookiT` / `CN=QookiT` 的商店包 —— 这种包**不能上传**
> （Publisher 必须与账号分配值完全一致，否则报「包发布者与账户不匹配」）。
> **身份变量必须在构建之前配好**，配好后再重跑一次发布。

命令行配置（值取自合作伙伴中心「产品标识」）：

```bash
gh variable set MSIX_STORE_PACKAGE_NAME --body "12345Publisher.QookiT"
gh variable set MSIX_STORE_PUBLISHER    --body "CN=ABCDEF12-3456-7890-ABCD-EF1234567890"

# 核对现状
gh variable list
gh secret list
```

3. 隐私政策 URL：把 `PRIVACY.md` 托管为公开 HTTPS 地址（如 GitHub Pages），填入商店提交页。

## 每次发版的流程

```bash
# 1. 同步三处版本号后打 tag（版本号必须为 x.y.z 三段数字；MSIX 内部会写成 x.y.z.0）
pnpm bump patch
git tag v1.1.0 && git push origin v1.1.0
```

若只是补了变量 / 改了 CI，不想重新打 tag，可以直接用既有 tag 重跑（取 main 上的 workflow）：

```bash
gh workflow run release.yml --ref main -f tag=v1.1.0 -f prerelease=false
gh run list --limit 3
```

2. 等待 `Release` workflow 产出资产，下载 `QookiT_<ver>_x64_store.msixupload`。
3. 在合作伙伴中心创建提交 → 「程序包」页上传该 `.msixupload`（未签名是**正确**的，商店会重新签名；**不要**上传侧载用的签名包）。
4. 填写「数据收集」问卷：全部选择**不收集任何数据**（与 `PRIVACY.md` 一致）。
5. 需要说明的能力：清单中只有 `runFullTrust`（桌面桥标准能力），说明用途为「SSH 客户端需以完全信任方式访问本地密钥文件与网络」。

## 常见报错对照

| 报错 | 原因 |
| --- | --- |
| 包发布者与账户不匹配 / 0x80080204 | `MSIX_STORE_PUBLISHER` 与商店分配值不一致 |
| 版本号无效 / 第四段必须为 0 | tag 版本不是 `x.y.z`，或带 `-beta` 之类后缀 |
| 包名与保留名不一致 | `MSIX_STORE_PACKAGE_NAME` 未填或拼写错误 |
| 上传后商店显示「不支持的平台」 | 只上传了 x64 包；本项目当前仅提供 x64，提交时勾选 x64 即可 |

## 本地验证

```powershell
# 侧载测试商店包（未签名，需先开启开发者模式）
Add-AppxPackage -Path .\QookiT_1.1.0_x64_store.msix
# 或在设置里改为「信任的证书」后安装侧载包：
Import-Certificate -FilePath .\sign-cert.cer -CertStoreLocation Cert:\CurrentUser\TrustedPeople
```

安装后检查「设置 → 关于」：

- 商店安装且已上架：点击「检查更新」应能正常返回结果（无更新时显示「已是最新版本」）；
- 侧载安装：点击后应报错并提示可改用「商店更新页」，说明失败回退生效（属预期）；
- 若侧载版本上仍显示 Tauri 自更新的「检查更新」按钮，说明包标识判定失效，需复查 `src-tauri/src/packaging.rs`。

## 数据目录说明

全信任（`runFullTrust`）的打包应用不做 AppData 重定向，配置仍写入 `%APPDATA%\QookiT\`，
与 NSIS 版本共用同一目录；从 MSIX 卸载**不会**自动删除该目录（与 `PRIVACY.md` 的说明一致）。

> 若实测发现配置落在 `%LOCALAPPDATA%\Packages\<包族名>\LocalCache\Roaming\QookiT\`，
> 说明该环境启用了 AppData 重定向，属正常现象：应用始终使用 `dirs::config_dir()` 返回的路径，无需改动代码，
> 仅需将 README / 隐私政策中的路径说明补充说明即可。
