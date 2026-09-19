import { useConnectionsStore } from "../stores/connectionsStore";
import { X } from "lucide-react";

export function TabBar() {
  const { tabs, activeTabId, setActive, disconnect } = useConnectionsStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-default-soft px-1 border-b border-border">
      {tabs.map((tab) => (
        <div
          key={tab.connectionId}
          className={`group flex cursor-pointer items-center gap-2 border-r border-border px-3 py-2 text-sm transition-colors ${
            tab.connectionId === activeTabId
              ? "border-b-2 border-b-accent bg-background text-accent"
              : "text-foreground hover:bg-background"
          }`}
          onClick={() => setActive(tab.connectionId)}
        >
          <span>{tab.hostName}</span>
          <button
            className="rounded p-0.5 opacity-50 hover:bg-danger-soft hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              disconnect(tab.connectionId);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
