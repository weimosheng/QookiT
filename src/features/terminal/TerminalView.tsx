import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { terminalService } from "../../services/terminalService";
import { useThemeStore } from "../../stores/themeStore";
import { useCommandStore } from "../../stores/commandStore";
import { TERMINAL_DATA_EVENT, TERMINAL_EXIT_EVENT } from "../../types/events";
import type { TerminalDataPayload, TerminalExitPayload } from "../../types/events";

interface TerminalViewProps {
  connectionId: string;
  terminalId: string;
  onExit?: () => void;
}

interface MenuState {
  x: number;
  y: number;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function TerminalView({ connectionId, terminalId, onExit }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const dark = useThemeStore((s) => s.dark);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "Consolas, Monaco, 'Courier New', monospace",
      fontSize: 14,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: "#1e1e2e",
        foreground: "#cdd6f4",
        cursor: "#f5e0dc",
        selectionBackground: "#45475a",
      },
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    const dataDisposable = term.onData((data) => {
      terminalService.write(connectionId, terminalId, data);
      if (data.includes("\r")) {
        const buffer = term.buffer.active;
        const line = buffer.getLine(buffer.cursorY);
        const text = line?.translateToString(true).trim() ?? "";
        const cmd = text.replace(/^.*[\$#>]\s+/, "").trim();
        if (cmd) useCommandStore.getState().addHistory(cmd);
      }
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      terminalService.resize(connectionId, terminalId, cols, rows);
    });
    const selectionDisposable = term.onSelectionChange(() => {
      setHasSelection(term.hasSelection());
    });

    const unlistenData = listen<TerminalDataPayload>(TERMINAL_DATA_EVENT, (event) => {
      if (event.payload.terminal_id === terminalId) {
        term.write(base64ToBytes(event.payload.data));
      }
    });
    const unlistenExit = listen<TerminalExitPayload>(TERMINAL_EXIT_EVENT, (event) => {
      if (event.payload.terminal_id === terminalId) {
        onExitRef.current?.();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      selectionDisposable.dispose();
      resizeObserver.disconnect();
      unlistenData.then((f) => f());
      unlistenExit.then((f) => f());
      term.dispose();
      termRef.current = null;
    };
  }, [connectionId, terminalId]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleCopy = useCallback(async () => {
    const term = termRef.current;
    if (term) {
      const selection = term.getSelection();
      if (selection) await navigator.clipboard.writeText(selection);
    }
    closeMenu();
  }, [closeMenu]);

  const handlePaste = useCallback(async () => {
    const term = termRef.current;
    if (!term) return closeMenu();
    try {
      const text = await navigator.clipboard.readText();
      if (text) term.paste(text);
    } catch {
      // clipboard read may be blocked; ignore
    }
    closeMenu();
  }, [closeMenu]);

  const handleSelectAll = useCallback(() => {
    termRef.current?.selectAll();
    closeMenu();
  }, [closeMenu]);

  const handleClearSelection = useCallback(() => {
    termRef.current?.clearSelection();
    closeMenu();
  }, [closeMenu]);

  const handleClearScreen = useCallback(() => {
    termRef.current?.clear();
    closeMenu();
  }, [closeMenu]);

  // Close menu on outside click / escape while open.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-terminal-menu]")) closeMenu();
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

  const menuWidth = 160;
  const menuHeight = 180;
  const left = menu ? Math.min(menu.x, window.innerWidth - menuWidth - 8) : 0;
  const top = menu ? Math.min(menu.y, window.innerHeight - menuHeight - 8) : 0;

  return (
    <div ref={containerRef} className="h-full w-full" onContextMenu={handleContextMenu}>
      {menu && (
        <div
          data-terminal-menu
          className="fixed z-50 min-w-40 overflow-hidden rounded-md border py-1 text-sm shadow-lg"
          style={{
            left,
            top,
            background: dark ? "#282838" : "#ffffff",
            borderColor: dark ? "#3a3a4a" : "#e5e7eb",
            color: dark ? "#cdd6f4" : "#1e1e2e",
          }}
        >
          <MenuItem dark={dark} label="复制" shortcut="Ctrl+Shift+C" disabled={!hasSelection} onClick={handleCopy} />
          <MenuItem dark={dark} label="粘贴" shortcut="Ctrl+Shift+V" onClick={handlePaste} />
          <div
            className="my-1 h-px"
            style={{ background: dark ? "#3a3a4a" : "#e5e7eb" }}
          />
          <MenuItem dark={dark} label="全选" onClick={handleSelectAll} />
          <MenuItem dark={dark} label="清除选择" disabled={!hasSelection} onClick={handleClearSelection} />
          <div
            className="my-1 h-px"
            style={{ background: dark ? "#3a3a4a" : "#e5e7eb" }}
          />
          <MenuItem dark={dark} label="清屏" onClick={handleClearScreen} />
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  dark: boolean;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}

function MenuItem({ dark, label, shortcut, disabled, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : dark
            ? "hover:bg-[#3a3a4a]"
            : "hover:bg-[#f1f1f4]"
      }`}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="ml-4 text-xs" style={{ color: dark ? "#7f849c" : "#9ca3af" }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}
