import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useHostsStore } from "../stores/hostsStore";
import { useConnectionsStore } from "../stores/connectionsStore";
import { HostEditModal } from "./HostEditModal";
import { ConnectingModal } from "./ConnectingModal";
import { Button } from "@heroui/react";
import { pingService } from "../services/pingService";
import { connectionService } from "../services/connectionService";
import { dialogAlert, dialogConfirm } from "../lib/dialog";
import {
  Plus,
  Server,
  Trash2,
  Pencil,
  KeyRound,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import type { Host } from "../types/host";
import { createEmptyHost } from "../types/host";

type Latency = number | "error" | "loading" | null;

function latencyColor(ms: number): string {
  if (ms < 50) return "text-success";
  if (ms < 150) return "text-warning";
  return "text-danger";
}

export function ConnectionCenter() {
  const { t } = useTranslation("connection");
  const { hosts, load, remove } = useHostsStore();
  const { connect, tabs } = useConnectionsStore();
  const [editing, setEditing] = useState<Host | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectingHost, setConnectingHost] = useState<Host | null>(null);
  const [connectingOpen, setConnectingOpen] = useState(false);
  const [latencies, setLatencies] = useState<Record<string, Latency>>({});
  const [showAddress, setShowAddress] = useState(false);

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
    const ok = await dialogConfirm(t("confirm_delete", { name: host.name }), undefined, true);
    if (ok) await remove(host.id);
  };

  /**
   * 清除该主机已记录的主机密钥。
   *
   * 密钥与本地记录不一致时连接会被拒绝；确认服务器确实更换了密钥后，
   * 用这个入口删除旧记录，下次连接会重新信任并写入新密钥。
   */
  const handleForgetKey = async (host: Host) => {
    try {
      const fingerprints = await connectionService.knownHostFingerprints(
        host.host,
        host.port,
      );
      if (fingerprints.length === 0) {
        await dialogAlert(
          t("no_host_key"),
          t("no_host_key_msg", { host: host.host, port: host.port }),
        );
        return;
      }
      const ok = await dialogConfirm(
        t("clear_host_key_title"),
        t("clear_host_key_msg", {
          host: host.host,
          port: host.port,
          fingerprints: fingerprints.join("\n"),
        }),
        true,
      );
      if (!ok) return;
      const removed = await connectionService.forgetHostKey(
        host.host,
        host.port,
      );
      await dialogAlert(t("cleared"), t("cleared_msg", { count: removed }));
    } catch (e) {
      await dialogAlert(t("operation_failed"), String(e));
    }
  };

  const isConnected = (hostId: string) => tabs.some((t) => t.hostId === hostId);

  function latencyLabel(latency: Latency): string {
    if (latency === null) return t("latency_untested");
    if (latency === "loading") return t("latency_testing");
    if (latency === "error") return t("latency_unreachable");
    return `${latency} ms`;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">{t("center_title")}</span>
          <span className="text-sm text-muted">{t("server_count", { count: hosts.length })}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setShowAddress((v) => !v)}
          >
            {showAddress ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />}
            {showAddress ? t("hide_address") : t("show_address")}
          </Button>
          <Button size="sm" variant="ghost" onPress={pingAll} isDisabled={hosts.length === 0}>
            <RefreshCw size={14} className="mr-1" />
            {t("ping_all")}
          </Button>
          <Button size="sm" variant="primary" onPress={handleNew}>
            <Plus size={14} className="mr-1" />
            {t("add_server")}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {hosts.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Server size={48} className="mx-auto text-muted" />
              <p className="mt-4 text-lg font-semibold text-foreground">{t("no_servers")}</p>
              <p className="mt-2 text-sm text-muted">{t("no_servers_hint")}</p>
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
                            {t("connected")}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted">
                        {showAddress
                          ? `${host.username}@${host.host}:${host.port}`
                          : `${host.username}@•••:•••`}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {host.auth.type === "password" ? t("password_auth") : t("key_auth")}
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
                      {t("connect")}
                    </Button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-default-soft hover:text-foreground"
                      onClick={() => pingOne(host)}
                      title={t("ping")}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-default-soft hover:text-foreground"
                      onClick={() => handleEdit(host)}
                      title={t("edit")}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-default-soft hover:text-foreground"
                      onClick={() => void handleForgetKey(host)}
                      title={t("clear_host_key")}
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                      onClick={() => handleDelete(host)}
                      title={t("delete")}
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
