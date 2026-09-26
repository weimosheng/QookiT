import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConnectionsStore } from "../stores/connectionsStore";
import { useThemeStore } from "../stores/themeStore";
import { X, Minus, Square, Sun, Moon, LayoutGrid, Settings } from "lucide-react";
import { SettingsModal } from "./SettingsModal";

export function TitleBar() {
  const { tabs, activeTabId, setActive, disconnect } = useConnectionsStore();
  const { dark, toggle } = useThemeStore();
  const [maximized, setMaximized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const win = getCurrentWindow();

  useEffect(() => {
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {});
    });
    win.isMaximized().then(setMaximized).catch(() => {});
    return () => {
      unlisten.then((f) => f());
    };
  }, [win]);

  const handleMinimize = () => win.minimize();
  const handleMaximize = () => win.toggleMaximize();
  const handleClose = () => win.close();

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 items-center border-b border-border bg-background select-none"
    >
      <div
        data-tauri-drag-region
        className="flex flex-1 items-center gap-1 overflow-x-auto px-2"
      >
        <div
          className={`flex min-w-[140px] cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
            activeTabId === null
              ? "bg-accent-soft text-accent"
              : "text-foreground hover:bg-default-soft"
          }`}
          onClick={() => setActive(null)}
        >
          <LayoutGrid size={13} />
          <span className="flex-1 truncate">连接中心</span>
        </div>

        {tabs.map((tab) => (
          <div
            key={tab.connectionId}
            className={`group flex min-w-[140px] cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
              tab.connectionId === activeTabId
                ? "bg-accent-soft text-accent"
                : "text-foreground hover:bg-default-soft"
            }`}
            onClick={() => setActive(tab.connectionId)}
          >
            <span className="flex-1 truncate">{tab.hostName}</span>
            <button
              className="rounded p-0.5 opacity-50 hover:bg-danger-soft hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                disconnect(tab.connectionId);
              }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      <div
        data-tauri-drag-region
        className="flex items-center gap-1 px-2 flex-shrink-0"
      >
        <span className="text-sm font-semibold text-accent pr-1">QookiT</span>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-default-soft transition-colors"
          onClick={() => setSettingsOpen(true)}
          title="设置"
        >
          <Settings size={14} />
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-default-soft transition-colors"
          onClick={toggle}
          title={dark ? "切换到亮色模式" : "切换到暗色模式"}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-default-soft transition-colors"
          onClick={handleMinimize}
          title="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-default-soft transition-colors"
          onClick={handleMaximize}
          title={maximized ? "还原" : "最大化"}
        >
          <Square size={12} />
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-danger-soft hover:text-danger transition-colors"
          onClick={handleClose}
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>
      <SettingsModal isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
