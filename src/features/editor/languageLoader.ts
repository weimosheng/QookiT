import { StreamLanguage } from "@codemirror/language";
import type { StreamParser } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

export interface LanguageDef {
  id: string;
  label: string;
  load: () => Promise<Extension>;
}

function legacy(
  id: string,
  label: string,
  load: () => Promise<StreamParser<unknown>>,
): LanguageDef {
  return { id, label, load: async () => StreamLanguage.define(await load()) };
}

const LANGS: Record<string, LanguageDef> = {
  javascript: {
    id: "javascript",
    label: "JavaScript",
    load: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  },
  typescript: {
    id: "typescript",
    label: "TypeScript",
    load: () =>
      import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ typescript: true }),
      ),
  },
  tsx: {
    id: "tsx",
    label: "TSX",
    load: () =>
      import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ typescript: true, jsx: true }),
      ),
  },
  json: {
    id: "json",
    label: "JSON",
    load: () => import("@codemirror/lang-json").then((m) => m.json()),
  },
  html: {
    id: "html",
    label: "HTML",
    load: () => import("@codemirror/lang-html").then((m) => m.html()),
  },
  css: {
    id: "css",
    label: "CSS",
    load: () => import("@codemirror/lang-css").then((m) => m.css()),
  },
  markdown: {
    id: "markdown",
    label: "Markdown",
    load: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  },
  python: {
    id: "python",
    label: "Python",
    load: () => import("@codemirror/lang-python").then((m) => m.python()),
  },
  rust: {
    id: "rust",
    label: "Rust",
    load: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  },
  java: {
    id: "java",
    label: "Java",
    load: () => import("@codemirror/lang-java").then((m) => m.java()),
  },
  cpp: {
    id: "cpp",
    label: "C/C++",
    load: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  },
  xml: {
    id: "xml",
    label: "XML",
    load: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  },
  yaml: {
    id: "yaml",
    label: "YAML",
    load: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  },
  sql: {
    id: "sql",
    label: "SQL",
    load: () => import("@codemirror/lang-sql").then((m) => m.sql()),
  },
  php: {
    id: "php",
    label: "PHP",
    load: () => import("@codemirror/lang-php").then((m) => m.php()),
  },
  shell: legacy("shell", "Shell", () =>
    import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
  ),
  dockerfile: legacy("dockerfile", "Dockerfile", () =>
    import("@codemirror/legacy-modes/mode/dockerfile").then((m) => m.dockerFile),
  ),
  properties: legacy("properties", "Properties", () =>
    import("@codemirror/legacy-modes/mode/properties").then((m) => m.properties),
  ),
  toml: legacy("toml", "TOML", () =>
    import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml),
  ),
  nginx: legacy("nginx", "Nginx", () =>
    import("@codemirror/legacy-modes/mode/nginx").then((m) => m.nginx),
  ),
  diff: legacy("diff", "Diff", () =>
    import("@codemirror/legacy-modes/mode/diff").then((m) => m.diff),
  ),
  cmake: legacy("cmake", "CMake", () =>
    import("@codemirror/legacy-modes/mode/cmake").then((m) => m.cmake),
  ),
  go: legacy("go", "Go", () =>
    import("@codemirror/legacy-modes/mode/go").then((m) => m.go),
  ),
  lua: legacy("lua", "Lua", () =>
    import("@codemirror/legacy-modes/mode/lua").then((m) => m.lua),
  ),
  ruby: legacy("ruby", "Ruby", () =>
    import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby),
  ),
  swift: legacy("swift", "Swift", () =>
    import("@codemirror/legacy-modes/mode/swift").then((m) => m.swift),
  ),
  powershell: legacy("powershell", "PowerShell", () =>
    import("@codemirror/legacy-modes/mode/powershell").then((m) => m.powerShell),
  ),
  perl: legacy("perl", "Perl", () =>
    import("@codemirror/legacy-modes/mode/perl").then((m) => m.perl),
  ),
  haskell: legacy("haskell", "Haskell", () =>
    import("@codemirror/legacy-modes/mode/haskell").then((m) => m.haskell),
  ),
  clojure: legacy("clojure", "Clojure", () =>
    import("@codemirror/legacy-modes/mode/clojure").then((m) => m.clojure),
  ),
  r: legacy("r", "R", () =>
    import("@codemirror/legacy-modes/mode/r").then((m) => m.r),
  ),
  groovy: legacy("groovy", "Groovy", () =>
    import("@codemirror/legacy-modes/mode/groovy").then((m) => m.groovy),
  ),
};

const EXT_LANGS: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  json5: "json",
  map: "json",
  html: "html",
  htm: "html",
  xhtml: "html",
  vue: "html",
  svelte: "html",
  css: "css",
  scss: "css",
  less: "css",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  py: "python",
  pyw: "python",
  pyi: "python",
  rs: "rust",
  java: "java",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  ino: "cpp",
  xml: "xml",
  xsd: "xml",
  xsl: "xml",
  xslt: "xml",
  svg: "xml",
  plist: "xml",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ksh: "shell",
  fish: "shell",
  properties: "properties",
  ini: "properties",
  cfg: "properties",
  conf: "properties",
  env: "properties",
  toml: "toml",
  diff: "diff",
  patch: "diff",
  cmake: "cmake",
  go: "go",
  lua: "lua",
  rb: "ruby",
  ruby: "ruby",
  gemspec: "ruby",
  rake: "ruby",
  swift: "swift",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  pl: "perl",
  pm: "perl",
  hs: "haskell",
  lhs: "haskell",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  r: "r",
  groovy: "groovy",
  gradle: "groovy",
};

const FILE_NAME_LANGS: Record<string, string> = {
  dockerfile: "dockerfile",
  "dockerfile.dev": "dockerfile",
  "dockerfile.prod": "dockerfile",
  "nginx.conf": "nginx",
  "cmakelists.txt": "cmake",
  ".env": "properties",
  ".bashrc": "shell",
  ".bash_profile": "shell",
  ".zshrc": "shell",
  ".profile": "shell",
};

const cache = new Map<string, Extension>();

export function detectLanguage(path: string): LanguageDef | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const lower = name.toLowerCase();
  const byName = FILE_NAME_LANGS[lower];
  if (byName) return LANGS[byName] ?? null;
  const dot = lower.lastIndexOf(".");
  if (dot < 0 || dot === lower.length - 1) return null;
  const id = EXT_LANGS[lower.slice(dot + 1)];
  return id ? (LANGS[id] ?? null) : null;
}

export async function loadLanguage(id: string): Promise<Extension | null> {
  const cached = cache.get(id);
  if (cached) return cached;
  const def = LANGS[id];
  if (!def) return null;
  const ext = await def.load();
  cache.set(id, ext);
  return ext;
}
