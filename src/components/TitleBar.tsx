import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { useConnectionsStore } from "../stores/connectionsStore";
import { useThemeStore } from "../stores/themeStore";
import { X, Minus, Square, Sun, Moon, LayoutGrid, Settings } from "lucide-react";
import { SettingsModal } from "./SettingsModal";

export function TitleBar() {
  const { t } = useTranslation("titlebar");
  const { tabs, activeTabId, setActive, disconnect, reorderTabs } = useConnectionsStore();
  const { dark, toggle } = useThemeStore();
  const [maximized, setMaximized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<"left" | "right">("left");

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
          <span className="flex-1 truncate">{t("connection_center")}</span>
        </div>

        {tabs.map((tab) => (
          <div
            key={tab.connectionId}
            draggable
            onDragStart={(e) => {
              setDraggedTabId(tab.connectionId);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", tab.connectionId);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              setDragOverTabId(tab.connectionId);
              setDragOverSide(
                e.clientX < rect.left + rect.width / 2 ? "left" : "right",
              );
            }}
            onDragLeave={() => {
              setDragOverTabId((id) =>
                id === tab.connectionId ? null : id,
              );
            }}
            onDrop={(e) => {
              e.preventDefault();
              const fromId = e.dataTransfer.getData("text/plain");
              if (fromId && fromId !== tab.connectionId) {
                const rect = e.currentTarget.getBoundingClientRect();
                const insertBefore = e.clientX < rect.left + rect.width / 2;
                reorderTabs(fromId, tab.connectionId, insertBefore);
              }
              setDraggedTabId(null);
              setDragOverTabId(null);
            }}
            onDragEnd={() => {
              setDraggedTabId(null);
              setDragOverTabId(null);
            }}
            className={`group relative flex min-w-[140px] cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
              tab.connectionId === activeTabId
                ? "bg-accent-soft text-accent"
                : "text-foreground hover:bg-default-soft"
            } ${draggedTabId === tab.connectionId ? "opacity-50" : ""}`}
            onClick={() => setActive(tab.connectionId)}
          >
            {dragOverTabId === tab.connectionId &&
              draggedTabId !== tab.connectionId &&
              dragOverSide === "left" && (
                <div className="absolute -left-0.5 bottom-1 top-1 w-0.5 rounded-full bg-accent" />
              )}
            <span className="flex-1 truncate">{tab.hostName}</span>
            <button
              draggable={false}
              className="rounded p-0.5 opacity-50 hover:bg-danger-soft hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                disconnect(tab.connectionId);
              }}
            >
              <X size={11} />
            </button>
            {dragOverTabId === tab.connectionId &&
              draggedTabId !== tab.connectionId &&
              dragOverSide === "right" && (
                <div className="absolute -right-0.5 bottom-1 top-1 w-0.5 rounded-full bg-accent" />
              )}
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
          title={t("settings")}
        >
          <Settings size={14} />
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-default-soft transition-colors"
          onClick={toggle}
          title={dark ? t("toggle_light") : t("toggle_dark")}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-default-soft transition-colors"
          onClick={handleMinimize}
          title={t("minimize")}
        >
          <Minus size={14} />
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-default-soft transition-colors"
          onClick={handleMaximize}
          title={maximized ? t("restore") : t("maximize")}
        >
          <Square size={12} />
        </button>
        <button
          className="rounded-md p-1.5 text-foreground hover:bg-danger-soft hover:text-danger transition-colors"
          onClick={handleClose}
          title={t("close")}
        >
          <X size={14} />
        </button>
      </div>
      <SettingsModal isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
