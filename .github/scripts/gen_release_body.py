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

body = f"""## QookiT {version}

### 下载

{table}
### 说明
- **Windows**：NSIS `.exe` 安装器、`.msix`（现代包，以完全信任运行）
- **macOS**：`.dmg`（universal，Apple Silicon 与 Intel 通用；拖入 Applications 安装）
- **Linux**：`.deb`（Debian/Ubuntu）、`.rpm`（Fedora/RedHat）
- 便携式：Windows `zip`、macOS `tar.gz`、Linux `AppImage`/`tar.gz`

> macOS 版本未做代码签名与公证，首次打开请在「系统设置 → 隐私与安全性」点击「仍要打开」。
> Windows `.msix`：配置 `MSIX_PACKAGE_NAME`+`MSIX_PUBLISHER`（Partner Center 保留名与发布者 ID）即可上传 Microsoft Store 上架——Store 会重新签名，无需正式证书；`MSIX_CERT_PFX_B64`+`MSIX_CERT_PASSWORD` 仅旁加载场景可选。
"""

with open("body.md", "w", encoding="utf-8") as fp:
    fp.write(body)
print("已生成 body.md")
