import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkgPath = resolve(root, "package.json");
const cargoPath = resolve(root, "src-tauri", "Cargo.toml");
const confPath = resolve(root, "src-tauri", "tauri.conf.json");

function semverBump(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
  if (!m) throw new Error(`无法解析当前版本号: ${version}`);
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
  } else if (kind === "patch") {
    patch += 1;
  } else {
    throw new Error(`未知的 bump 类型: ${kind}`);
  }
  return `${major}.${minor}.${patch}${m[4] ?? ""}`;
}

const arg = process.argv[2];
if (!arg) {
  console.error(
    "用法: node scripts/bump-version.mjs <新版本号 | major | minor | patch>",
  );
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const current = pkg.version;
const next = /^(major|minor|patch)$/.test(arg)
  ? semverBump(current, arg)
  : arg.trim();
if (!/^\d+\.\d+\.\d+/.test(next)) {
  console.error(`无效的版本号: ${next}`);
  process.exit(1);
}

// 1) package.json
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

// 2) src-tauri/Cargo.toml —— 替换 [package] 段下第一个 version = "..."
let cargo = readFileSync(cargoPath, "utf-8");
cargo = cargo.replace(/^version = ".*"$/m, `version = "${next}"`);
writeFileSync(cargoPath, cargo, "utf-8");

// 3) src-tauri/tauri.conf.json
const conf = JSON.parse(readFileSync(confPath, "utf-8"));
conf.version = next;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n", "utf-8");

console.log(`版本已更新: ${current} -> ${next}`);
console.log("  • package.json");
console.log("  • src-tauri/Cargo.toml");
console.log("  • src-tauri/tauri.conf.json");
