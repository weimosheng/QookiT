import os

tag = os.environ["TAG"]
version = os.environ["VERSION"]
repo = os.environ["REPO"]
base = f"https://github.com/{repo}/releases/download/{tag}"

files = sorted(
    f for f in os.listdir("release-assets")
    if os.path.isfile(os.path.join("release-assets", f))
)

rows = {
    "Windows": {"arch": "x64", "install": [], "portable": []},
    "macOS":   {"arch": "universal", "install": [], "portable": []},
    "Linux":   {"arch": "x64", "install": [], "portable": []},
}

for f in files:
    fl = f.lower()
    # 商店上传包不进下载表（未签名，仅供合作伙伴中心使用）
    if fl.endswith(".msixupload") or "_store.msix" in fl:
        continue
    if fl.endswith(".msix") or fl.endswith(".msi") or "-setup.exe" in fl or (fl.endswith(".exe") and "portable" not in fl):
        rows["Windows"]["install"].append(f)
    elif fl.endswith("-portable.zip"):
        rows["Windows"]["portable"].append(f)
    elif fl.endswith(".dmg"):
        rows["macOS"]["install"].append(f)
    elif fl.endswith(".deb") or fl.endswith(".rpm"):
        rows["Linux"]["install"].append(f)
    elif fl.endswith(".appimage"):
        rows["Linux"]["portable"].append(f)
    elif fl.endswith("-portable.tar.gz"):
        if "universal" in fl or "macos" in fl:
            rows["macOS"]["portable"].append(f)
        else:
            rows["Linux"]["portable"].append(f)


def link(fn):
    return f"[`{fn}`]({base}/{fn})"


def cell(items):
    return " / ".join(link(i) for i in items) if items else "—"


table = "| 平台 | 架构 | 安装包 | 便携式 |\n|------|------|--------|--------|\n"
for name, r in rows.items():
    table += f"| {name} | {r['arch']} | {cell(r['install'])} | {cell(r['portable'])} |\n"

store_uploads = [f for f in files if f.lower().endswith(".msixupload")]
store_line = ""
if store_uploads:
    store_line = (
        "- 上架 Microsoft Store：上传 "
        + " / ".join(link(i) for i in store_uploads)
        + "（未签名属正常，商店会重新签名；侧载请用上表中的 `.msix`）"
    )

body = f"""## QookiT {version}

### 下载

{table}
### 说明
- **Windows**：NSIS `.exe` 安装器、`.msix`（现代包，以完全信任运行）
- **macOS**：`.dmg`（universal，Apple Silicon 与 Intel 通用；拖入 Applications 安装）
- **Linux**：`.deb`（Debian/Ubuntu）、`.rpm`（Fedora/RedHat）
- 便携式：Windows `zip`、macOS `tar.gz`、Linux `AppImage`/`tar.gz`
{store_line}

> macOS 版本未做代码签名与公证，首次打开请在「系统设置 → 隐私与安全性」点击「仍要打开」。
> Windows `.msix`：配置 `MSIX_PACKAGE_NAME`+`MSIX_PUBLISHER`（自签名证书 Subject 需与 Publisher 一致）；商店上传包用 `MSIX_STORE_PACKAGE_NAME`+`MSIX_STORE_PUBLISHER`，详见 `MSIX_STORE.md`。
> 从 Microsoft Store 安装的版本可在应用内直接触发商店更新（由 Microsoft Store 下载并安装）；侧载 `.msix` 无此通道，请手动下载新版本覆盖安装。
"""

with open("body.md", "w", encoding="utf-8") as fp:
    fp.write(body)
print("已生成 body.md")
