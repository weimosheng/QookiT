import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { sftpService } from "../../services/sftpService";
import { useNavigationStore } from "../../stores/navigationStore";
import { useDockStore } from "../dock/dockStore";
import { cn } from "../../lib/cn";
import {
  Search as SearchIcon,
  ChevronRight,
  ChevronDown,
  FileText,
  AlertCircle,
  Loader2,
  X,
  Folder,
} from "lucide-react";

interface SearchPanelProps {
  connectionId: string;
}

interface MatchRange {
  start: number;
  end: number;
}

interface SearchMatch {
  line: number;
  content: string;
  ranges: MatchRange[];
}

interface FileGroup {
  path: string;
  matches: SearchMatch[];
}

const EXCLUDE_DIRS = [
  ".git",
  "node_modules",
  ".svn",
  "vendor",
  ".venv",
  "dist",
  "build",
  ".next",
  "target",
  "__pycache__",
];
const MAX_OUTPUT_LINES = 2000;
const MAX_RANGES_PER_LINE = 8;

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildGrepCommand(opts: {
  pattern: string;
  path: string;
  fileGlob: string;
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
}): string {
  const flags = ["-r", "-n", "-I"];
  if (!opts.caseSensitive) flags.push("-i");
  if (opts.wholeWord) flags.push("-w");
  flags.push(opts.useRegex ? "-E" : "-F");
  const parts = ["grep", ...flags];
  for (const d of EXCLUDE_DIRS) parts.push(`--exclude-dir=${d}`);
  const glob = opts.fileGlob.trim();
  if (glob) parts.push(`--include=${glob}`);
  parts.push("--", shellQuote(opts.pattern), shellQuote(opts.path));
  parts.push("2>/dev/null");
  parts.push("|", "head", `-${MAX_OUTPUT_LINES}`);
  return parts.join(" ");
}

function findRanges(
  content: string,
  pattern: string,
  useRegex: boolean,
  caseSensitive: boolean,
  wholeWord: boolean,
): MatchRange[] {
  let source: string;
  if (useRegex) {
    source = wholeWord ? `\\b(?:${pattern})\\b` : pattern;
  } else {
    const esc = escapeRegex(pattern);
    source = wholeWord ? `\\b${esc}\\b` : esc;
  }
  let re: RegExp;
  try {
    re = new RegExp(source, caseSensitive ? "g" : "gi");
  } catch {
    return [];
  }
  const ranges: MatchRange[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    ranges.push({ start: m.index, end: m.index + m[0].length });
    if (ranges.length >= MAX_RANGES_PER_LINE) break;
  }
  return ranges;
}

const LINE_REGEX = /^(.+?):(\d+):(.*)$/;

function parseGrepOutput(
  stdout: string,
  pattern: string,
  useRegex: boolean,
  caseSensitive: boolean,
  wholeWord: boolean,
): FileGroup[] {
  const map = new Map<string, SearchMatch[]>();
  const lines = stdout.split("\n");
  for (const raw of lines) {
    if (!raw) continue;
    const m = LINE_REGEX.exec(raw);
    if (!m) continue;
    const path = m[1];
    const line = parseInt(m[2], 10);
    if (!Number.isFinite(line)) continue;
    const content = m[3];
    const ranges = findRanges(
      content,
      pattern,
      useRegex,
      caseSensitive,
      wholeWord,
    );
    const match: SearchMatch = { line, content, ranges };
    const arr = map.get(path);
    if (arr) arr.push(match);
    else map.set(path, [match]);
  }
  const groups: FileGroup[] = [];
  for (const [path, matches] of map) {
    groups.push({ path, matches });
  }
  groups.sort((a, b) => a.path.localeCompare(b.path));
  return groups;
}

function renderHighlighted(content: string, ranges: MatchRange[]): ReactNode {
  if (ranges.length === 0) return content;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.start < pos) continue;
    if (r.start > pos) out.push(<span key={`t${i}`}>{content.slice(pos, r.start)}</span>);
    out.push(
      <mark
        key={`m${i}`}
        className="rounded bg-accent/30 px-0.5 text-accent-foreground"
      >
        {content.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  }
  if (pos < content.length) out.push(<span key="tail">{content.slice(pos)}</span>);
  return out;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? p : p.slice(i + 1);
}

export function SearchPanel({ connectionId }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [fileGlob, setFileGlob] = useState("");
  const [searchPath, setSearchPath] = useState("/");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<FileGroup[] | null>(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const openTab = useDockStore((s) => s.openTab);
  const requestNavigate = useNavigationStore((s) => s.requestNavigate);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setTotalMatches(0);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const cmd = buildGrepCommand({
        pattern: q,
        path: searchPath.trim() || "/",
        fileGlob,
        caseSensitive,
        useRegex,
        wholeWord,
      });
      const res = await sftpService.exec(connectionId, cmd);
      if (res.exit_code === 2) {
        setError(res.stderr.trim() || "grep 命令出错");
        setResults([]);
        setTotalMatches(0);
        return;
      }
      const groups = parseGrepOutput(res.stdout, q, useRegex, caseSensitive, wholeWord);
      setResults(groups);
      setTotalMatches(groups.reduce((s, g) => s + g.matches.length, 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
      setTotalMatches(0);
    } finally {
      setSearching(false);
    }
  }, [query, fileGlob, searchPath, caseSensitive, useRegex, wholeWord, connectionId]);

  const clearAll = () => {
    setQuery("");
    setResults(null);
    setTotalMatches(0);
    setError(null);
  };

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleJump = async (path: string) => {
    const tabs = useDockStore.getState().byConnection[connectionId]?.tabs;
    const hasFiles = Object.values(tabs ?? {}).some(
      (t) => t.toolTypeId === "files",
    );
    if (!hasFiles) {
      await openTab(connectionId, "files", "center");
    }
    requestNavigate(connectionId, path, false);
  };

  const canSearch = query.trim().length > 0 && !searching;

  const stats = useMemo(() => {
    if (!results) return null;
    return { files: results.length, matches: totalMatches };
  }, [results, totalMatches]);

  return (
    <div className="flex h-full flex-col select-none">
      <div className="border-b border-border/50 bg-background/60 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <SearchIcon size={14} className="flex-shrink-0 text-accent" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSearch) runSearch();
              if (e.key === "Escape") clearAll();
            }}
            placeholder="搜索内容 (回车搜索, Esc 清除)"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent"
            disabled={searching}
          />
          <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-default-soft p-0.5">
            <ToggleBtn
              active={caseSensitive}
              onClick={() => setCaseSensitive((v) => !v)}
              title="区分大小写"
              label="Aa"
            />
            <ToggleBtn
              active={useRegex}
              onClick={() => setUseRegex((v) => !v)}
              title="正则表达式"
              label=".*"
            />
            <ToggleBtn
              active={wholeWord}
              onClick={() => setWholeWord((v) => !v)}
              title="整词匹配"
              label="W"
            />
          </div>
          <button
            type="button"
            onClick={runSearch}
            disabled={!canSearch}
            title="搜索"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              canSearch
                ? "bg-accent text-accent-foreground hover:opacity-90"
                : "cursor-not-allowed text-muted",
            )}
          >
            {searching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <SearchIcon size={14} />
            )}
          </button>
          {query && (
            <button
              type="button"
              onClick={clearAll}
              title="清除"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-default-soft hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={fileGlob}
            onChange={(e) => setFileGlob(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSearch) runSearch();
            }}
            placeholder="文件过滤 (如 *.ts)"
            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
            disabled={searching}
          />
          <input
            type="text"
            value={searchPath}
            onChange={(e) => setSearchPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSearch) runSearch();
            }}
            placeholder="搜索路径"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:border-accent"
            disabled={searching}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0 text-danger" />
          <span className="text-[11px] text-danger">{error}</span>
        </div>
      )}

      {stats && !error && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-default-soft/40 px-3 py-1 text-[11px] text-muted">
          <span>
            结果 · {stats.files} 个文件 · {stats.matches} 处匹配
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {searching ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">搜索中...</span>
          </div>
        ) : !results ? (
          <div className="flex h-full items-center justify-center p-4 text-center">
            <p className="text-sm text-muted">
              输入内容并回车开始搜索
              <br />
              <span className="text-[11px]">
                缩小搜索路径可显著加速
              </span>
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-sm text-muted">未找到匹配</p>
          </div>
        ) : (
          <div className="py-1">
            {results.map((group) => {
              const isCollapsed = collapsed.has(group.path);
              return (
                <div key={group.path} className="border-b border-border/30">
                  <div
                    className="group flex cursor-pointer items-center gap-1 px-2 py-1 hover:bg-accent-soft"
                    onClick={() => toggleCollapse(group.path)}
                    onDoubleClick={() => handleJump(group.path)}
                    title={`${group.path} (双击跳转到文件树)`}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={13} className="flex-shrink-0 text-muted" />
                    ) : (
                      <ChevronDown size={13} className="flex-shrink-0 text-muted" />
                    )}
                    <FileText size={13} className="flex-shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {basename(group.path)}
                    </span>
                    <span className="flex-shrink-0 text-[10px] text-muted">
                      {group.matches.length}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJump(group.path);
                      }}
                      className="flex-shrink-0 rounded p-0.5 text-muted opacity-0 hover:text-accent group-hover:opacity-100"
                      title="跳转到文件树"
                    >
                      <Folder size={12} />
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="pb-1">
                      {group.matches.map((match, i) => (
                        <div
                          key={i}
                          className="group flex cursor-pointer items-start gap-2 px-2 py-0.5 pl-7 font-mono text-xs hover:bg-accent-soft"
                          onClick={() => handleJump(group.path)}
                          title={`${group.path}:${match.line}`}
                        >
                          <span className="flex-shrink-0 w-10 text-right text-muted">
                            {match.line}
                          </span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-foreground">
                            {renderHighlighted(match.content, match.ranges)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  title,
  label,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
