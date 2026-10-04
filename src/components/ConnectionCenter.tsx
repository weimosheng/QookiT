import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useHostsStore } from "../stores/hostsStore";
import { useConnectionsStore } from "../stores/connectionsStore";
import { useGroupsStore } from "../stores/groupsStore";
import { HostEditModal } from "./HostEditModal";
import { ConnectingModal } from "./ConnectingModal";
import { pingService } from "../services/pingService";
import { connectionService } from "../services/connectionService";
import { dialogAlert, dialogConfirm, dialogPrompt } from "../lib/dialog";
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
  Folder,
  ChevronRight,
  ChevronDown,
  Layers,
} from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Host } from "../types/host";
import { createEmptyHost } from "../types/host";
import { createEmptyGroup } from "../types/group";

type Latency = number | "error" | "loading" | null;

function latencyColor(ms: number): string {
  if (ms < 50) return "text-success";
  if (ms < 150) return "text-warning";
  return "text-danger";
}

function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function ConnectionCenter() {
  const { t } = useTranslation("connection");
  const { hosts, load, remove } = useHostsStore();
  const { groups, load: loadGroups, add: addGroup, remove: removeGroup } = useGroupsStore();
  const { connect, tabs } = useConnectionsStore();
  const [editing, setEditing] = useState<Host | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectingHost, setConnectingHost] = useState<Host | null>(null);
  const [connectingOpen, setConnectingOpen] = useState(false);
  const [latencies, setLatencies] = useState<Record<string, Latency>>({});
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; type: "group"; groupName: string }
    | { x: number; y: number; type: "host"; host: Host }
    | null
  >(null);
  const [showAddress, setShowAddress] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const toggleNode = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    load();
    loadGroups();
  }, [load, loadGroups]);

  const pingAll = useCallback(async () => {
    const currentHosts = await useHostsStore.getState().hosts;
    const initial: Record<string, Latency> = {};
    for (const h of currentHosts) initial[h.id] = "loading";
    setLatencies(initial);
    await Promise.allSettled(
      currentHosts.map(async (h) => {
        try {
          const ms = await pingService.ping(h.host, h.port);
          setLatencies((prev) => ({ ...prev, [h.id]: ms }));
        } catch {
          setLatencies((prev) => ({ ...prev, [h.id]: "error" }));
        }
      }),
    );
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

  const handleNewInGroup = (groupName: string) => {
    const host = createEmptyHost();
    host.group = groupName;
    setEditing(host);
    setModalOpen(true);
  };

  const handleDeleteGroup = async (groupName: string) => {
    const group = groups.find((g) => g.name === groupName);
    if (!group) return;
    const ok = await dialogConfirm(
      t("confirm_delete_group", { name: groupName }),
      undefined,
      true,
    );
    if (ok) await removeGroup(group.id);
  };

  const handleNewGroup = async () => {
    const name = await dialogPrompt(t("new_group_prompt"), "");
    if (name && name.trim()) {
      await addGroup(createEmptyGroup(name.trim()));
    }
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

  const groupNames = useMemo(
    () => groups.map((g) => g.name).sort(),
    [groups],
  );
  const hostsInGroup = useCallback(
    (name: string) => hosts.filter((h) => h.group === name),
    [hosts],
  );
  const ungroupedHosts = useMemo(
    () => hosts.filter((h) => !h.group),
    [hosts],
  );

  const renderCard = (host: Host) => {
    const latency = latencies[host.id];
    const connected = isConnected(host.id);
    const sysInfo = host.system_info;
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
                : `${host.username}@•••.•••.•••.•••:••`}
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

        {sysInfo && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sysInfo.os && (
              <span className="rounded bg-default-soft px-1.5 py-0.5 text-xs text-muted">
                {sysInfo.os}
              </span>
            )}
            {sysInfo.system && (
              <span className="rounded bg-default-soft px-1.5 py-0.5 text-xs text-muted">
                {sysInfo.system}
              </span>
            )}
            {sysInfo.arch && (
              <span className="rounded bg-default-soft px-1.5 py-0.5 text-xs text-muted">
                {sysInfo.arch}
              </span>
            )}
            {sysInfo.cpu_cores != null && (
              <span className="rounded bg-default-soft px-1.5 py-0.5 text-xs text-muted">
                {t("cpu_cores", { count: sysInfo.cpu_cores })}
              </span>
            )}
            {sysInfo.mem_total_mb != null && (
              <span className="rounded bg-default-soft px-1.5 py-0.5 text-xs text-muted">
                {formatMem(sysInfo.mem_total_mb)}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto pt-4 flex flex-col gap-2">
          <button
            onClick={() => handleConnect(host)}
            className="w-full rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            {t("connect")}
          </button>
          <div className="flex items-center gap-1">
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
      </div>
    );
  };

  function latencyLabel(latency: Latency): string {
    if (latency === null) return t("latency_untested");
    if (latency === "loading") return t("latency_testing");
    if (latency === "error") return t("latency_unreachable");
    return `${latency} ms`;
  }

  const nodeBase =
    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-left transition-colors hover:bg-default-soft";
  const nodeClass = (active: boolean) =>
    active ? `${nodeBase} bg-accent-soft text-accent` : `${nodeBase} text-foreground`;
  const leafClass = (active: boolean) =>
    active
      ? `${nodeBase} bg-accent-soft text-accent`
      : `${nodeBase} text-muted`;

  const renderHostLeaf = (h: Host) => {
    const lat = latencies[h.id];
    const iconColor =
      typeof lat === "number"
        ? "text-success"
        : lat === "error"
          ? "text-danger"
          : "text-muted";
    return (
      <div key={h.id} className="ml-7 border-l border-border/40 pl-7">
        <button
          className={leafClass(selectedKey === h.id)}
          onClick={() => handleConnect(h)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, type: "host", host: h });
          }}
          title={h.name}
        >
          <Server size={13} className={`shrink-0 ${iconColor}`} />
          <span className="truncate">{h.name}</span>
        </button>
      </div>
    );
  };

  const renderGroupNode = (
    key: string,
    label: string,
    count: number,
    folderClass: string,
    collapsible = true,
  ) => {
    const isCollapsed = collapsible && collapsed.has(key);
    const hostsInThis = key === "__ungrouped__" ? ungroupedHosts : hostsInGroup(key);
    const labelBase =
      "flex h-8 flex-1 items-center gap-1.5 rounded-md px-2 text-sm text-left transition-colors hover:bg-default-soft";
    return (
      <div key={key}>
        <div className="flex items-center">
          {collapsible && (
            <button
              className="shrink-0 h-8 rounded-md p-1.5 text-muted transition-colors hover:bg-default-soft"
              onClick={() => toggleNode(key)}
            >
              {isCollapsed ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
          )}
          <button
            className={
              selectedKey === key
                ? `${labelBase} bg-accent-soft text-accent`
                : `${labelBase} text-foreground`
            }
            onClick={() => setSelectedKey(key)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: "group", groupName: key });
            }}
          >
            <Folder size={14} className={`shrink-0 ${folderClass}`} />
            <span className="truncate">{label}</span>
            <span className="ml-auto shrink-0 text-xs text-muted">{count}</span>
          </button>
        </div>
        {!isCollapsed && hostsInThis.map(renderHostLeaf)}
      </div>
    );
  };

  const filteredHosts = (list: Host[]) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.host.toLowerCase().includes(q) ||
        h.username.toLowerCase().includes(q),
    );
  };

  const renderCards = () => {
    if (hosts.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <Server size={48} className="mx-auto text-muted" />
            <p className="mt-4 text-lg font-semibold text-foreground">{t("no_servers")}</p>
            <p className="mt-2 text-sm text-muted">{t("no_servers_hint")}</p>
          </div>
        </div>
      );
    }
    const gridClass =
      "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    if (selectedKey === "all") {
      return <div className={gridClass}>{filteredHosts(hosts).map(renderCard)}</div>;
    }
    if (selectedKey === "__ungrouped__") {
      return <div className={gridClass}>{filteredHosts(ungroupedHosts).map(renderCard)}</div>;
    }
    return <div className={gridClass}>{filteredHosts(hostsInGroup(selectedKey)).map(renderCard)}</div>;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal" className="h-full">
          <Panel
            defaultSize="22"
            minSize="14"
            maxSize="45"
            className="flex flex-col border-r border-border"
          >
            <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-b border-border px-2">
              <button
                onClick={handleNew}
                className="inline-flex items-center justify-center rounded-md px-2 py-1 text-xs text-accent transition-colors hover:bg-default-soft"
              >
                <Plus size={12} className="mr-0.5" />
                {t("add_server")}
              </button>
              <button
                onClick={() => void handleNewGroup()}
                className="inline-flex items-center justify-center rounded-md px-2 py-1 text-xs text-accent transition-colors hover:bg-default-soft"
              >
                <Plus size={12} className="mr-0.5" />
                {t("new_group")}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
            <button
              className={nodeClass(selectedKey === "all")}
              onClick={() => setSelectedKey("all")}
            >
              <Layers size={14} className="shrink-0" />
              <span className="truncate">{t("all_connections")}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">{hosts.length}</span>
            </button>
            <div className="mt-1 flex flex-col gap-0.5">
              {groupNames.map((g) =>
                renderGroupNode(g, g, hostsInGroup(g).length, "text-accent"),
              )}
              {ungroupedHosts.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {ungroupedHosts.map((h) => {
                    const lat = latencies[h.id];
                    const iconColor =
                      typeof lat === "number"
                        ? "text-success"
                        : lat === "error"
                          ? "text-danger"
                          : "text-muted";
                    return (
                      <div key={h.id} className="ml-7">
                        <button
                          className={`${nodeBase} h-8 ${selectedKey === h.id ? "bg-accent-soft text-accent" : "text-muted"}`}
                          onClick={() => handleConnect(h)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, type: "host", host: h });
                          }}
                          title={h.name}
                        >
                          <Server size={14} className={`shrink-0 ${iconColor}`} />
                          <span className="truncate">{h.name}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </Panel>
          <Separator className="w-px bg-border transition-colors hover:bg-accent" />
          <Panel minSize="50" className="flex flex-col overflow-hidden">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("search_placeholder")}
                  className="h-8 w-48 rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddress((v) => !v)}
                  title={showAddress ? t("hide_address") : t("show_address")}
                  className="inline-flex items-center justify-center rounded-md p-2 text-foreground transition-colors hover:bg-default-soft"
                >
                  {showAddress ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={pingAll}
                  disabled={hosts.length === 0}
                  title={t("ping_all")}
                  className="inline-flex items-center justify-center rounded-md p-2 text-foreground transition-colors hover:bg-default-soft disabled:opacity-50"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={handleNew}
                  title={t("add_server")}
                  className="inline-flex items-center justify-center rounded-md bg-accent p-2 text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {renderCards()}
            </div>
          </Panel>
        </Group>
      </div>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-40 rounded-md border border-border bg-surface py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === "group" ? (
              <>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-default-soft"
                  onClick={() => {
                    handleNewInGroup(contextMenu.groupName);
                    setContextMenu(null);
                  }}
                >
                  <Plus size={14} />
                  {t("add_server")}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-default-soft"
                  onClick={() => {
                    void handleDeleteGroup(contextMenu.groupName);
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  {t("delete")}
                </button>
              </>
            ) : (
              <>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-default-soft"
                  onClick={() => {
                    handleConnect(contextMenu.host);
                    setContextMenu(null);
                  }}
                >
                  <Wifi size={14} />
                  {t("connect")}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-default-soft"
                  onClick={() => {
                    handleNew();
                    setContextMenu(null);
                  }}
                >
                  <Plus size={14} />
                  {t("add_server")}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-default-soft"
                  onClick={() => {
                    void handleDelete(contextMenu.host);
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  {t("delete")}
                </button>
              </>
            )}
          </div>
        </>
      )}

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
