import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { sftpService } from "../../services/sftpService";
import { terminalService } from "../../services/terminalService";
import { useTerminalActiveStore } from "../../stores/terminalActiveStore";
import { useFileClipboardStore } from "../../stores/fileClipboardStore";
import { useNavigationStore } from "../../stores/navigationStore";
import { useDockStore } from "../dock/dockStore";
import { dialogAlert, dialogConfirm, dialogPrompt } from "../../lib/dialog";
import type { FileEntry } from "../../types/sftp";
import {
  Folder,
  File as FileIcon,
  FileText,
  FileCode,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  ChevronsDownUp,
  FolderPlus,
  Copy,
  Scissors,
  ClipboardPaste,
  Pencil,
  Trash2,
  Terminal,
  Search,
  X,
} from "lucide-react";

interface FileExplorerProps {
  connectionId: string;
}

interface MenuState {
  x: number;
  y: number;
  entry: FileEntry | null;
  dirContext: string;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function getFileIcon(entry: FileEntry) {
  if (entry.is_dir) return Folder;
  if (
    entry.name.endsWith(".txt") ||
    entry.name.endsWith(".md") ||
    entry.name.endsWith(".log")
  )
    return FileText;
  return FileIcon;
}

function parentDirOf(entry: FileEntry): string {
  const i = entry.path.lastIndexOf("/");
  return i <= 0 ? "/" : entry.path.slice(0, i);
}

function parentDirOfPath(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

export function FileExplorer({ connectionId }: FileExplorerProps) {
  const [treeCache, setTreeCache] = useState<Record<string, FileEntry[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(["/"]),
  );
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [dirErrors, setDirErrors] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { path: string; isDir: boolean }[] | null
  >(null);
  const [searching, setSearching] = useState(false);
  const [highlightPath, setHighlightPath] = useState<string | null>(null);

  const treeCacheRef = useRef(treeCache);
  treeCacheRef.current = treeCache;

  const activeTerminalId = useTerminalActiveStore(
    (s) => s.activeByConnection[connectionId] ?? null,
  );
  const clipboard = useFileClipboardStore((s) => s.clipboard);
  const setClipboard = useFileClipboardStore((s) => s.set);
  const clearClipboard = useFileClipboardStore((s) => s.clear);
  const canPaste = !!clipboard && clipboard.connectionId === connectionId;

  const loadDir = useCallback(
    async (dirPath: string, force = false): Promise<FileEntry[] | undefined> => {
      if (!force && treeCacheRef.current[dirPath]) {
        return treeCacheRef.current[dirPath];
      }
      setLoadingPaths((s) => new Set(s).add(dirPath));
      try {
        await sftpService.open(connectionId);
        const list = await sftpService.listDir(connectionId, dirPath);
        list.sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setTreeCache((c) => ({ ...c, [dirPath]: list }));
        setDirErrors((e) => {
          if (!e[dirPath]) return e;
          const n = { ...e };
          delete n[dirPath];
          return n;
        });
        return list;
      } catch (e) {
        setDirErrors((err) => ({ ...err, [dirPath]: String(e) }));
        return undefined;
      } finally {
        setLoadingPaths((s) => {
          const n = new Set(s);
          n.delete(dirPath);
          return n;
        });
      }
    },
    [connectionId],
  );

  useEffect(() => {
    loadDir("/");
  }, [loadDir]);

  const toggleExpand = (dirPath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
        if (!treeCacheRef.current[dirPath]) loadDir(dirPath);
      }
      return next;
    });
  };

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleContextMenu = (
    e: ReactMouseEvent,
    entry: FileEntry | null,
    dirContext: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entry, dirContext });
  };

  const handleOpenInEditor = useCallback(
    (entry: FileEntry) => {
      closeMenu();
      const dockStore = useDockStore.getState();
      const dock = dockStore.byConnection[connectionId];
      if (dock) {
        for (const tab of Object.values(dock.tabs)) {
          if (tab.toolTypeId === "editor" && tab.meta?.path === entry.path) {
            dockStore.focusTab(connectionId, tab.id);
            return;
          }
        }
      }
      void dockStore
        .openTab(connectionId, "editor", "center", {
          path: entry.path,
          title: entry.name,
        })
        .catch((e) => console.error("[editor] open failed:", e));
    },
    [closeMenu, connectionId],
  );

  const handleCopyPath = useCallback(
    async (entry: FileEntry) => {
      try {
        await navigator.clipboard.writeText(entry.path);
      } catch {
        // clipboard may be blocked
      }
      closeMenu();
    },
    [closeMenu],
  );

  const handleRename = useCallback(
    async (entry: FileEntry) => {
      closeMenu();
      const newName = await dialogPrompt("重命名", entry.name);
      if (newName === null || newName === "" || newName === entry.name) return;
      const dir = parentDirOf(entry);
      const newPath = dir === "/" ? `/${newName}` : `${dir}/${newName}`;
      setBusy(true);
      try {
        await sftpService.rename(connectionId, entry.path, newPath);
        await loadDir(dir, true);
      } catch (e) {
        await dialogAlert("重命名失败", String(e));
      } finally {
        setBusy(false);
      }
    },
    [closeMenu, connectionId, loadDir],
  );

  const handleDelete = useCallback(
    async (entry: FileEntry) => {
      closeMenu();
      const ok = await dialogConfirm("删除", `确定删除 "${entry.name}"?`, true);
      if (!ok) return;
      const dir = parentDirOf(entry);
      setBusy(true);
      try {
        if (entry.is_dir) {
          await sftpService.removeDir(connectionId, entry.path);
        } else {
          await sftpService.removeFile(connectionId, entry.path);
        }
        await loadDir(dir, true);
      } catch (e) {
        await dialogAlert("删除失败", String(e));
      } finally {
        setBusy(false);
      }
    },
    [closeMenu, connectionId, loadDir],
  );

  const handleCdToTerminal = useCallback(
    async (entry: FileEntry) => {
      closeMenu();
      if (!activeTerminalId) {
        await dialogAlert("提示", "没有可用的终端");
        return;
      }
      const targetDir = entry.is_dir ? entry.path : parentDirOf(entry);
      try {
        await terminalService.write(
          connectionId,
          activeTerminalId,
          `cd ${targetDir}\n`,
        );
      } catch (e) {
        await dialogAlert("cd 失败", String(e));
      }
    },
    [closeMenu, connectionId, activeTerminalId],
  );

  const handleNewFolder = useCallback(
    async (targetDir: string) => {
      closeMenu();
      const name = await dialogPrompt("新建文件夹", "", "请输入文件夹名称");
      if (!name) return;
      const newPath = targetDir === "/" ? `/${name}` : `${targetDir}/${name}`;
      setBusy(true);
      try {
        await sftpService.mkdir(connectionId, newPath);
        await loadDir(targetDir, true);
        setExpandedPaths((prev) => new Set(prev).add(targetDir));
      } catch (e) {
        await dialogAlert("新建文件夹失败", String(e));
      } finally {
        setBusy(false);
      }
    },
    [closeMenu, connectionId, loadDir],
  );

  const handlePaste = useCallback(
    async (targetDir: string) => {
      closeMenu();
      if (!clipboard || clipboard.connectionId !== connectionId) return;
      setBusy(true);
      try {
        const base = clipboard.name;
        let destPath = "";
        for (let i = 0; i < 100; i++) {
          const candidateName = i === 0 ? base : `${base}_copy${i}`;
          const candidate =
            targetDir === "/" ? `/${candidateName}` : `${targetDir}/${candidateName}`;
          if (candidate === clipboard.path) continue;
          const check = await sftpService.exec(
            connectionId,
            `test -e ${shellQuote(candidate)}; echo $?`,
          );
          if (check.stdout.trim() === "0") continue;
          destPath = candidate;
          break;
        }
        if (!destPath) {
          await dialogAlert("粘贴失败", "无法找到可用的目标名称");
          return;
        }
        const cmd = clipboard.cut
          ? `mv ${shellQuote(clipboard.path)} ${shellQuote(destPath)}`
          : `cp -r ${shellQuote(clipboard.path)} ${shellQuote(destPath)}`;
        const result = await sftpService.exec(connectionId, cmd);
        if (result.exit_code !== 0) {
          await dialogAlert(
            `${clipboard.cut ? "移动" : "复制"}失败`,
            result.stderr || result.stdout,
          );
        } else {
          if (clipboard.cut) clearClipboard();
          await loadDir(targetDir, true);
        }
      } catch (e) {
        await dialogAlert(`${clipboard.cut ? "移动" : "复制"}失败`, String(e));
      } finally {
        setBusy(false);
      }
    },
    [closeMenu, clipboard, connectionId, loadDir, clearClipboard],
  );

  const handleCopy = useCallback(
    (entry: FileEntry) => {
      setClipboard({
        connectionId,
        path: entry.path,
        name: entry.name,
        isDir: entry.is_dir,
        cut: false,
      });
      closeMenu();
    },
    [closeMenu, connectionId, setClipboard],
  );

  const handleCut = useCallback(
    (entry: FileEntry) => {
      setClipboard({
        connectionId,
        path: entry.path,
        name: entry.name,
        isDir: entry.is_dir,
        cut: true,
      });
      closeMenu();
    },
    [closeMenu, connectionId, setClipboard],
  );

  const handleRefreshAll = useCallback(() => {
    closeMenu();
    expandedPaths.forEach((p) => loadDir(p, true));
  }, [closeMenu, expandedPaths, loadDir]);

  const handleCollapseAll = () => setExpandedPaths(new Set(["/"]));

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const pattern = shellQuote(`*${q}*`);
      const [dirRes, fileRes] = await Promise.all([
        sftpService.exec(
          connectionId,
          `find / -iname ${pattern} -maxdepth 6 -type d 2>/dev/null`,
        ),
        sftpService.exec(
          connectionId,
          `find / -iname ${pattern} -maxdepth 6 -type f 2>/dev/null`,
        ),
      ]);
      const dirs = dirRes.stdout
        .split("\n")
        .filter(Boolean)
        .map((p) => ({ path: p, isDir: true }));
      const files = fileRes.stdout
        .split("\n")
        .filter(Boolean)
        .map((p) => ({ path: p, isDir: false }));
      const items = [...dirs, ...files].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.path.localeCompare(b.path);
      });
      setSearchResults(items);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [connectionId, searchQuery]);

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
  };

  const navigateToPath = useCallback(
    async (targetPath: string, isDir: boolean) => {
      const targetDir = isDir ? targetPath : parentDirOfPath(targetPath);
      setSearchResults(null);
      setSearchQuery("");
      const segments = targetDir.split("/").filter(Boolean);
      setExpandedPaths((prev) => new Set(prev).add("/"));
      let curPath = "/";
      for (const seg of segments) {
        const entries = await loadDir(curPath, true);
        const found = (entries ?? []).find((e) => e.name === seg);
        if (!found) break;
        setExpandedPaths((prev) => new Set(prev).add(found.path));
        curPath = found.path;
      }
      await loadDir(curPath, true);
      setHighlightPath(curPath);
      setTimeout(() => setHighlightPath(null), 2500);
      setTimeout(() => {
        const el = document.querySelector(
          `[data-tree-path="${curPath.replace(/"/g, '\\"')}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    },
    [loadDir],
  );

  const navigateRequest = useNavigationStore((s) => s.navigateRequest);
  const consumeNavigateRequest = useNavigationStore(
    (s) => s.consumeNavigateRequest,
  );

  useEffect(() => {
    if (!navigateRequest) return;
    if (navigateRequest.connectionId !== connectionId) return;
    void navigateToPath(navigateRequest.path, navigateRequest.isDir);
    consumeNavigateRequest();
  }, [navigateRequest, connectionId, navigateToPath, consumeNavigateRequest]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-file-menu]")) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  const renderTree = (dirPath: string, depth: number): React.ReactNode => {
    const err = dirErrors[dirPath];
    if (err) {
      return (
        <div
          className="py-1 text-xs text-danger"
          style={{ paddingLeft: depth * 16 + 24 }}
        >
          加载失败: {err}
        </div>
      );
    }
    const entries = treeCache[dirPath];
    if (!entries) {
      if (loadingPaths.has(dirPath)) {
        return (
          <div
            className="py-1 text-xs text-muted"
            style={{ paddingLeft: depth * 16 + 24 }}
          >
            加载中...
          </div>
        );
      }
      return null;
    }
    if (entries.length === 0 && depth === 0) {
      return <div className="p-4 text-center text-muted">空目录</div>;
    }
    return entries.map((entry) => {
      const expanded = expandedPaths.has(entry.path);
      const isDir = entry.is_dir;
      const Icon = getFileIcon(entry);
      return (
        <Fragment key={entry.path}>
          <div
            data-tree-path={entry.path}
            className={`flex cursor-pointer items-center gap-1 py-1 pr-2 text-sm transition-colors hover:bg-accent-soft ${
              isDir ? "font-medium" : ""
            } ${highlightPath === entry.path ? "bg-accent-soft ring-1 ring-inset ring-accent" : ""}`}
            style={{ paddingLeft: depth * 16 + 8 }}
            onClick={() => {
              if (isDir) toggleExpand(entry.path);
            }}
            onDoubleClick={() => {
              if (!isDir) handleOpenInEditor(entry);
            }}
            onContextMenu={(e) =>
              handleContextMenu(
                e,
                entry,
                isDir ? entry.path : parentDirOf(entry),
              )
            }
          >
            {isDir ? (
              expanded ? (
                <ChevronDown size={14} className="flex-shrink-0 text-muted" />
              ) : (
                <ChevronRight size={14} className="flex-shrink-0 text-muted" />
              )
            ) : (
              <span className="inline-block w-[14px] flex-shrink-0" />
            )}
            <Icon
              size={16}
              className={`flex-shrink-0 ${isDir ? "text-accent" : "text-muted"}`}
            />
            <span className="flex-1 truncate">{entry.name}</span>
            {!isDir && (
              <span className="flex-shrink-0 text-xs text-muted">
                {formatSize(entry.size)}
              </span>
            )}
          </div>
          {isDir && expanded && renderTree(entry.path, depth + 1)}
        </Fragment>
      );
    });
  };

  const menuWidth = 180;
  const menuHeight = 380;
  const left = menu ? Math.min(menu.x, window.innerWidth - menuWidth - 8) : 0;
  const top = menu ? Math.min(menu.y, window.innerHeight - menuHeight - 8) : 0;

  return (
    <div className="flex h-full flex-col select-none">
      <div className="flex items-center gap-1 border-b border-border bg-background px-2 py-1">
        <button
          className="rounded p-1 hover:bg-default-soft"
          onClick={handleRefreshAll}
          title="刷新"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="rounded p-1 hover:bg-default-soft"
          onClick={handleCollapseAll}
          title="全部收起"
        >
          <ChevronsDownUp size={14} />
        </button>
        <div className="relative flex flex-1 items-center">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
              if (e.key === "Escape") clearSearch();
            }}
            placeholder="搜索文件名 (回车搜索)"
            className="w-full rounded border border-border bg-background py-1 pl-7 pr-7 text-sm outline-none focus:border-accent"
          />
          {searchQuery && (
            <button
              className="absolute right-1 rounded p-0.5 text-muted hover:bg-default-soft hover:text-foreground"
              onClick={clearSearch}
              title="清除"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="h-1 w-full overflow-hidden bg-transparent">
        {(busy || searching) && (
          <div
            className="h-full w-2/5 bg-accent"
            style={{
              animation: "progress-indeterminate 1.2s ease-in-out infinite",
            }}
          />
        )}
      </div>

      {searchResults !== null ? (
        <div className="flex-1 overflow-y-auto">
          {searching && (
            <div className="p-4 text-center text-sm text-muted">搜索中...</div>
          )}
          {!searching && searchResults.length === 0 && (
            <div className="p-4 text-center text-sm text-muted">无结果</div>
          )}
          {!searching &&
            searchResults.map((item) => {
              const Icon = item.isDir ? Folder : FileIcon;
              return (
                <div
                  key={item.path}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1 text-sm hover:bg-accent-soft"
                  onClick={() => navigateToPath(item.path, item.isDir)}
                >
                  <Icon
                    size={16}
                    className={`flex-shrink-0 ${item.isDir ? "text-accent" : "text-muted"}`}
                  />
                  <span className="flex-1 truncate">{item.path}</span>
                </div>
              );
            })}
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto"
          onContextMenu={(e) => handleContextMenu(e, null, "/")}
        >
          {busy && (
            <div className="p-2 text-center text-xs text-muted">处理中...</div>
          )}
          {renderTree("/", 0)}
        </div>
      )}

      {menu && (
        <div
          data-file-menu
          className="fixed z-50 min-w-40 overflow-hidden rounded-md border border-border bg-background py-1 text-sm shadow-lg"
          style={{ left, top, width: menuWidth }}
        >
          {menu.entry ? (
            <>
              {!menu.entry.is_dir && (
                <>
                  <MenuRow
                    icon={<FileCode size={14} />}
                    label="编辑"
                    onClick={() => handleOpenInEditor(menu.entry!)}
                  />
                  <div className="my-1 h-px bg-border" />
                </>
              )}
              <MenuRow
                icon={<Copy size={14} />}
                label="复制路径"
                onClick={() => handleCopyPath(menu.entry!)}
              />
              <div className="my-1 h-px bg-border" />
              <MenuRow
                icon={<Copy size={14} />}
                label="复制"
                onClick={() => handleCopy(menu.entry!)}
              />
              <MenuRow
                icon={<Scissors size={14} />}
                label="剪切"
                onClick={() => handleCut(menu.entry!)}
              />
              <MenuRow
                icon={<Pencil size={14} />}
                label="重命名"
                onClick={() => handleRename(menu.entry!)}
              />
              <MenuRow
                icon={<Trash2 size={14} />}
                label="删除"
                danger
                onClick={() => handleDelete(menu.entry!)}
              />
              <div className="my-1 h-px bg-border" />
              <MenuRow
                icon={<Terminal size={14} />}
                label={menu.entry.is_dir ? "在终端中打开" : "cd 到所在目录"}
                disabled={!activeTerminalId}
                onClick={() => handleCdToTerminal(menu.entry!)}
              />
              {menu.entry.is_dir && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <MenuRow
                    icon={<FolderPlus size={14} />}
                    label="新建文件夹"
                    onClick={() => handleNewFolder(menu.entry!.path)}
                  />
                  <MenuRow
                    icon={<ClipboardPaste size={14} />}
                    label="粘贴"
                    disabled={!canPaste}
                    onClick={() => handlePaste(menu.entry!.path)}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <MenuRow
                icon={<FolderPlus size={14} />}
                label="新建文件夹"
                onClick={() => handleNewFolder(menu.dirContext)}
              />
              <MenuRow
                icon={<ClipboardPaste size={14} />}
                label="粘贴"
                disabled={!canPaste}
                onClick={() => handlePaste(menu.dirContext)}
              />
              <div className="my-1 h-px bg-border" />
              <MenuRow
                icon={<RefreshCw size={14} />}
                label="刷新"
                onClick={handleRefreshAll}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface MenuRowProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function MenuRow({ icon, label, onClick, disabled, danger }: MenuRowProps) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : danger
            ? "hover:bg-danger-soft hover:text-danger"
            : "hover:bg-accent-soft hover:text-accent"
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
