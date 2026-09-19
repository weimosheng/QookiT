import { useEffect, useState } from "react";
import { useHostsStore } from "../stores/hostsStore";
import { useConnectionsStore } from "../stores/connectionsStore";
import { HostEditModal } from "./HostEditModal";
import { ConnectingModal } from "./ConnectingModal";
import { Button } from "@heroui/react";
import { Plus, Server, Trash2, Pencil } from "lucide-react";
import type { Host } from "../types/host";
import { createEmptyHost } from "../types/host";

export function Sidebar() {
  const { hosts, load, remove } = useHostsStore();
  const { connect, tabs } = useConnectionsStore();
  const [editing, setEditing] = useState<Host | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectingHost, setConnectingHost] = useState<Host | null>(null);
  const [connectingOpen, setConnectingOpen] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleNew = () => {
    setEditing(createEmptyHost());
    setModalOpen(true);
  };

  const handleEdit = (host: Host) => {
    setEditing(host);
    setModalOpen(true);
  };

  const handleConnect = (host: Host) => {
    setConnectingHost(host);
    setConnectingOpen(true);
  };

  const handleConnectingClose = () => {
    setConnectingOpen(false);
    setConnectingHost(null);
  };

  const handleConnectingConnect = async () => {
    if (!connectingHost) return;
    try {
      await connect(connectingHost.id);
    } catch (e) {
      console.error("连接失败:", e);
      throw e;
    }
  };

  const handleDelete = async (host: Host) => {
    if (confirm(`确认删除服务器 ${host.name}?`)) {
      await remove(host.id);
    }
  };

  const isConnected = (hostId: string) => tabs.some((t) => t.hostId === hostId);

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <span className="text-sm font-semibold text-foreground">连接中心</span>
        <Button isIconOnly size="sm" variant="primary" onPress={handleNew}>
          <Plus size={18} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {hosts.length === 0 && (
          <div className="p-4 text-center text-sm text-muted">
            点击 + 添加服务器
          </div>
        )}
        {hosts.map((host) => (
          <div
            key={host.id}
            className="group flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-default-soft"
            onClick={() => handleConnect(host)}
          >
            <Server
              size={16}
              className={isConnected(host.id) ? "text-success" : "text-muted"}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{host.name}</div>
              <div className="truncate text-xs text-muted">
                {host.username}@{host.host}:{host.port}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                className="rounded p-1 hover:bg-accent-soft"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(host);
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                className="rounded p-1 hover:bg-danger-soft"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(host);
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <HostEditModal host={editing} isOpen={modalOpen} onOpenChange={setModalOpen} />
      )}

      {connectingHost && (
        <ConnectingModal
          hostId={connectingHost.id}
          hostName={connectingHost.name}
          isOpen={connectingOpen}
          onClose={handleConnectingClose}
          onConnect={handleConnectingConnect}
        />
      )}
    </div>
  );
}
