import { useState, useEffect, useCallback } from "react";
import { useHostsStore } from "../stores/hostsStore";
import { useConnectionsStore } from "../stores/connectionsStore";
import { HostEditModal } from "./HostEditModal";
import { ConnectingModal } from "./ConnectingModal";
import { Button } from "@heroui/react";
import { pingService } from "../services/pingService";
import {
  Plus,
  Server,
  Trash2,
  Pencil,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import type { Host } from "../types/host";
import { createEmptyHost } from "../types/host";

type Latency = number | "error" | "loading" | null;

function latencyColor(ms: number): string {
  if (ms < 50) return "text-success";
  if (ms < 150) return "text-warning";
  return "text-danger";
}

function latencyLabel(latency: Latency): string {
  if (latency === null) return "未检测";
  if (latency === "loading") return "检测中...";
  if (latency === "error") return "不可达";
  return `${latency} ms`;
}

export function ConnectionCenter() {
  const { hosts, load, remove } = useHostsStore();
  const { connect, tabs } = useConnectionsStore();
  const [editing, setEditing] = useState<Host | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectingHost, setConnectingHost] = useState<Host | null>(null);
  const [connectingOpen, setConnectingOpen] = useState(false);
  const [latencies, setLatencies] = useState<Record<string, Latency>>({});

  useEffect(() => {
    load();
  }, [load]);

  const pingAll = useCallback(async () => {
    const currentHosts = await useHostsStore.getState().hosts;
    const initial: Record<string, Latency> = {};
    for (const h of currentHosts) initial[h.id] = "loading";
    setLatencies(initial);
    for (const h of currentHosts) {
      try {
        const ms = await pingService.ping(h.host, h.port);
        setLatencies((prev) => ({ ...prev, [h.id]: ms }));
      } catch {
        setLatencies((prev) => ({ ...prev, [h.id]: "error" }));
      }
    }
  }, []);

  useEffect(() => {
    if (hosts.length > 0) pingAll();
  }, [hosts.length, pingAll]);

  const pingOne = async (host: Host) => {
    setLatencies((prev) => ({ ...prev, [host.id]: "loading" }));
    try {
      const ms = await pingService.ping(host.host, host.port);
      setLatencies((prev) => ({ ...prev, [host.id]: ms }));
    } catch {
      setLatencies((prev) => ({ ...prev, [host.id]: "error" }));
    }
  };

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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">连接中心</span>
          <span className="text-sm text-muted">{hosts.length} 台服务器</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onPress={pingAll} isDisabled={hosts.length === 0}>
            <RefreshCw size={14} className="mr-1" />
            全部测速
          </Button>
          <Button size="sm" variant="primary" onPress={handleNew}>
            <Plus size={14} className="mr-1" />
            添加服务器
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {hosts.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Server size={48} className="mx-auto text-muted" />
              <p className="mt-4 text-lg font-semibold text-foreground">还没有服务器</p>
              <p className="mt-2 text-sm text-muted">点击右上角"添加服务器"开始</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {hosts.map((host) => {
              const latency = latencies[host.id];
              const connected = isConnected(host.id);
              return (
                <div
                  key={host.id}
                  className="flex flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{host.name}</span>
                        {connected && (
                          <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-xs text-success">
                            已连接
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted">
                        {host.username}@{host.host}:{host.port}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {host.auth.type === "password" ? "密码认证" : "密钥认证"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {latency === "loading" ? (
                      <Loader2 size={14} className="animate-spin text-muted" />
                    ) : latency === "error" ? (
                      <WifiOff size={14} className="text-danger" />
                    ) : latency !== null ? (
                      <Wifi size={14} className={latencyColor(latency)} />
                    ) : (
                      <Wifi size={14} className="text-muted" />
                    )}
                    <span
                      className={`text-xs ${
                        latency === "error"
                          ? "text-danger"
                          : typeof latency === "number"
                            ? latencyColor(latency)
                            : "text-muted"
                      }`}
                    >
                      {latencyLabel(latency)}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onPress={() => handleConnect(host)}
                      className="flex-1"
                    >
                      连接
                    </Button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-default-soft hover:text-foreground"
                      onClick={() => pingOne(host)}
                      title="测速"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-default-soft hover:text-foreground"
                      onClick={() => handleEdit(host)}
                      title="编辑"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                      onClick={() => handleDelete(host)}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
