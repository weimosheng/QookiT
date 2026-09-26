import json
import os
from datetime import datetime, timezone
from pathlib import Path

tag = os.environ["TAG"]
version = os.environ["VERSION"]
repo = os.environ["REPO"]
assets_dir = Path("release-assets")

platforms = {}
for sig_path in sorted(assets_dir.glob("*.sig")):
    sig_content = sig_path.read_text(encoding="utf-8").strip()
    installer_name = sig_path.name[:-4]
    installer_path = assets_dir / installer_name
    if not installer_path.exists():
        continue
    name_lower = installer_name.lower()
    url = f"https://github.com/{repo}/releases/download/{tag}/{installer_name}"
    if name_lower.endswith(".exe"):
        platforms["windows-x86_64"] = {"signature": sig_content, "url": url}
    elif name_lower.endswith(".app.tar.gz"):
        platforms["darwin-x86_64"] = {"signature": sig_content, "url": url}
        platforms["darwin-aarch64"] = {"signature": sig_content, "url": url}
    elif name_lower.endswith(".appimage"):
        platforms["linux-x86_64"] = {"signature": sig_content, "url": url}

latest = {
    "version": version,
    "notes": f"QookiT {tag}",
    "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": platforms,
}

Path("latest.json").write_text(json.dumps(latest, indent=2), encoding="utf-8")
print("=== latest.json ===")
print(json.dumps(latest, indent=2))
