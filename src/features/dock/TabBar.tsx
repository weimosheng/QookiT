import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TabInstance } from "./dockStore";
import { getTool } from "./toolRegistry";
import { useDragStore } from "./dragStore";
import { cn } from "../../lib/cn";
import {
  X,
  Plus,
  SplitSquareHorizontal,
  SplitSquareVertical,
  XCircle,
} from "lucide-react";

interface TabBarProps {
  paneId: string;
  tabs: TabInstance[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTab: () => void;
  onSplitH?: () => void;
  onSplitV?: () => void;
  onTabDragStart?: (tabId: string) => void;
}

export function TabBar({
  paneId,
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNewTab,
  onSplitH,
  onSplitV,
  onTabDragStart,
}: TabBarProps) {
  const draggingTabId = useDragStore((s) => (s.drag ? s.drag.tabId : null));
  const [menu, setMenu] = useState<{ tabId: string; x: number; y: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const onScroll = () => setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  const closeOthers = (tabId: string) => {
    tabs.filter((t) => t.id !== tabId).forEach((t) => onClose(t.id));
  };
  const closeToRight = (tabId: string) => {
    const i = tabs.findIndex((t) => t.id === tabId);
    if (i < 0) return;
    tabs.slice(i + 1).forEach((t) => onClose(t.id));
  };

  return (
    <div className="flex h-[30px] items-stretch border-b border-border bg-background/60 backdrop-blur-md">
      <div
        data-tab-strip
        data-pane-id={paneId}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
      >
        {tabs.map((tab) => {
          const tool = getTool(tab.toolTypeId);
          const Icon = tool?.icon;
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", tab.id);
                e.dataTransfer.effectAllowed = "move";
                onTabDragStart?.(tab.id);
              }}
              onDragEnd={() => useDragStore.getState().clear()}
              onClick={() => onSelect(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
              className={cn(
                "group flex flex-shrink-0 cursor-pointer items-center gap-1.5 border-r border-border/50 px-2.5 text-xs transition-colors",
                isActive
                  ? "bg-background text-foreground"
                  : "bg-transparent text-muted hover:bg-default-soft hover:text-foreground",
                draggingTabId === tab.id && "opacity-40",
              )}
            >
              {Icon && <Icon size={13} className="flex-shrink-0 text-accent" />}
              <span className="max-w-[120px] truncate">{tab.title}</span>
              {tab.dirty && (
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                  title="未保存"
                />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted opacity-0 hover:bg-default-soft hover:text-foreground group-hover:opacity-100"
                title="关闭"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: menu.y, left: menu.x }}
            className="z-[1000] min-w-[140px] overflow-hidden rounded-md border border-border bg-background/95 py-1 text-xs shadow-xl backdrop-blur-md"
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onClick={() => {
                onClose(menu.tabId);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-default-soft"
            >
              <X size={13} className="flex-shrink-0" />
              关闭标签页
            </button>
            <button
              type="button"
              onClick={() => {
                closeOthers(menu.tabId);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-default-soft"
            >
              <XCircle size={13} className="flex-shrink-0" />
              关闭其他标签页
            </button>
            <button
              type="button"
              onClick={() => {
                closeToRight(menu.tabId);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-default-soft"
            >
              <XCircle size={13} className="flex-shrink-0" />
              关闭右侧标签页
            </button>
          </div>,
          document.body,
        )}
      <div className="flex flex-shrink-0 items-center gap-0.5 px-1">
        <button
          type="button"
          onClick={onNewTab}
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-default-soft hover:text-foreground"
          title="新建终端"
        >
          <Plus size={14} />
        </button>
        {onSplitH && (
          <button
            type="button"
            onClick={onSplitH}
            className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-default-soft hover:text-foreground"
            title="水平分屏"
          >
            <SplitSquareHorizontal size={14} />
          </button>
        )}
        {onSplitV && (
          <button
            type="button"
            onClick={onSplitV}
            className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-default-soft hover:text-foreground"
            title="垂直分屏"
          >
            <SplitSquareVertical size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
