import type { TabInstance } from "./dockStore";
import { getTool } from "./toolRegistry";
import { cn } from "../../lib/cn";
import { X, Plus, SplitSquareHorizontal, SplitSquareVertical } from "lucide-react";

interface TabBarProps {
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
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNewTab,
  onSplitH,
  onSplitV,
  onTabDragStart,
}: TabBarProps) {
  return (
    <div className="flex h-[30px] items-stretch border-b border-border bg-background/60 backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const tool = getTool(tab.toolTypeId);
          const Icon = tool?.icon;
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", tab.id);
                e.dataTransfer.effectAllowed = "move";
                onTabDragStart?.(tab.id);
              }}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "group flex flex-shrink-0 cursor-pointer items-center gap-1.5 border-r border-border/50 px-2.5 text-xs transition-colors",
                isActive
                  ? "bg-background text-foreground"
                  : "bg-transparent text-muted hover:bg-default-soft hover:text-foreground",
              )}
            >
              {Icon && <Icon size={13} className="flex-shrink-0 text-accent" />}
              <span className="max-w-[120px] truncate">{tab.title}</span>
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
