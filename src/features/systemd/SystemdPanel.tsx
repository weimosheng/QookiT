import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Power,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
  CircleDot,
  ToggleLeft,
  ToggleRight,
  Plus,
  Info,
  List,
  Maximize2,
  Pencil,
  Save,
} from "lucide-react";
import { systemdService } from "../../services/systemdService";
import type { SystemdUnit, SystemdUnitStatus } from "../../types/systemd";
import { dialogConfirm, dialogAlert } from "../../lib/dialog";
import { cn } from "../../lib/cn";
import { PanelHeader, panelHeaderBtnClass } from "../../components/PanelHeader";

interface SystemdPanelProps {
  connectionId: string;
}

type Filter = "all" | "active" | "inactive" | "failed";

const FILTERS: { value: Filter; labelKey: string }[] = [
  { value: "all", labelKey: "filter_all" },
  { value: "active", labelKey: "filter_active" },
  { value: "inactive", labelKey: "filter_inactive" },
  { value: "failed", labelKey: "filter_failed" },
];

const REFRESH_INTERVAL = 5000;
const DEFAULT_LOG_LINES = 200;

function activeStateColor(state: string): string {
  switch (state) {
    case "active":
      return "text-emerald-500";
    case "failed":
      return "text-danger";
    case "activating":
    case "deactivating":
    case "reloading":
      return "text-amber-500";
    default:
      return "text-muted";
  }
}

function activeStateDot(state: string): string {
  switch (state) {
    case "active":
      return "fill-emerald-500 text-emerald-500";
    case "failed":
      return "fill-danger text-danger";
    case "activating":
    case "deactivating":
    case "reloading":
      return "fill-amber-500 text-amber-500";
    default:
      return "text-muted";
  }
}

function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatCpuTime(nsec: number): string {
  const sec = nsec / 1e9;
  if (sec < 60) return `${sec.toFixed(2)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function SystemdPanel({ connectionId }: SystemdPanelProps) {
  const { t } = useTranslation("systemd");
  const [units, setUnits] = useState<SystemdUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const firstRef = useRef(true);

  const fetchList = useCallback(
    async (silent: boolean) => {
      if (!silent) setRefreshing(true);
      try {
        const list = await systemdService.listUnits(connectionId);
        setUnits(list);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (firstRef.current) {
          setLoading(false);
          firstRef.current = false;
        }
        setRefreshing(false);
      }
    },
    [connectionId],
  );

  useEffect(() => {
    firstRef.current = true;
    setLoading(true);
    setUnits([]);
    setError(null);
    setSelected(null);
    fetchList(true);
  }, [connectionId, fetchList]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => fetchList(true), REFRESH_INTERVAL);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchList]);

  const filtered = units.filter((u) => {
    if (filter === "active" && u.active_state !== "active") return false;
    if (filter === "inactive" && u.active_state !== "inactive") return false;
    if (filter === "failed" && u.active_state !== "failed") return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !u.name.toLowerCase().includes(q) &&
        !u.description.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  if (error && units.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle size={32} className="text-danger" />
        <p className="text-sm text-foreground">{t("cannot_collect")}</p>
        <p className="text-xs text-muted">{error}</p>
        <button
          type="button"
          onClick={() => {
            firstRef.current = true;
            setLoading(true);
            fetchList(true);
          }}
          className="rounded-md border border-border bg-default-soft px-3 py-1 text-xs text-foreground hover:bg-accent-soft"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <PanelHeader
        icon={Power}
        title={t("title")}
        leftExtra={<span className="text-[10px] text-muted">({filtered.length}/{units.length})</span>}
      >
        <button
          type="button"
          title={t("create")}
          onClick={() => {
            setSelected(null);
            setCreating(true);
          }}
          className={panelHeaderBtnClass}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          title={t("auto_refresh")}
          onClick={() => setAutoRefresh((v) => !v)}
          className={panelHeaderBtnClass}
        >
          {autoRefresh ? (
            <ToggleRight size={14} className="text-accent" />
          ) : (
            <ToggleLeft size={14} />
          )}
        </button>
        <button
          type="button"
          title={t("refresh")}
          onClick={() => fetchList(false)}
          className={panelHeaderBtnClass}
        >
          <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
        </button>
      </PanelHeader>

      <div className="flex flex-col gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Search size={13} className="flex-shrink-0 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_placeholder")}
            className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="flex-shrink-0 text-muted hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex-1 rounded px-2 py-0.5 text-[11px] transition-colors",
                filter === f.value
                  ? "bg-accent text-white"
                  : "border border-border/50 text-muted hover:bg-default-soft hover:text-foreground",
              )}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-sm text-muted">
            <CircleDot size={28} className="opacity-40" />
            <span>{t("empty")}</span>
            <span className="text-[11px]">{t("empty_hint")}</span>
          </div>
        ) : (
          filtered.map((u) => (
            <button
              key={u.name}
              type="button"
              onClick={() =>
                setSelected((prev) => (prev === u.name ? null : u.name))
              }
              className={cn(
                "flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left transition-colors hover:bg-default-soft",
                selected === u.name && "bg-accent-soft",
              )}
            >
              <CircleDot
                size={11}
                className={cn("flex-shrink-0", activeStateDot(u.active_state))}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs text-foreground">
                  {u.name}
                </div>
                {u.description && (
                  <div className="truncate text-[10px] text-muted">
                    {u.description}
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "flex-shrink-0 text-[10px] font-medium",
                  activeStateColor(u.active_state),
                )}
              >
                {u.active_state}
              </span>
            </button>
          ))
        )}
      </div>

      {creating && (
        <CreateUnitForm
          connectionId={connectionId}
          existingNames={units.map((u) => u.name)}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            fetchList(true);
          }}
        />
      )}

      {selected && (
        <UnitDetail
          connectionId={connectionId}
          name={selected}
          onClose={() => setSelected(null)}
          onChanged={() => fetchList(true)}
        />
      )}

      {error && units.length > 0 && (
        <div className="flex items-center gap-2 border-t border-danger/30 bg-danger/10 px-3 py-1.5">
          <AlertCircle size={12} className="text-danger" />
          <span className="text-[11px] text-danger">{error}</span>
        </div>
      )}
    </div>
  );
}

function UnitDetail({
  connectionId,
  name,
  onClose,
  onChanged,
}: {
  connectionId: string;
  name: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation("systemd");
  const [status, setStatus] = useState<SystemdUnitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"props" | "unit" | "logs">("props");
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [unitContent, setUnitContent] = useState<string | null>(null);
  const [unitLoading, setUnitLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const s = await systemdService.unitStatus(connectionId, name);
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [connectionId, name]);

  useEffect(() => {
    void fetchStatus();
    setLogs(null);
    setUnitContent(null);
    setView("props");
  }, [fetchStatus]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const out = await systemdService.getLogs(
        connectionId,
        name,
        DEFAULT_LOG_LINES,
      );
      setLogs(out);
    } catch (e) {
      setLogs(`__ERROR__${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLogsLoading(false);
    }
  }, [connectionId, name]);

  const fetchUnit = useCallback(async () => {
    setUnitLoading(true);
    try {
      const out = await systemdService.catUnit(connectionId, name);
      setUnitContent(out);
    } catch (e) {
      setUnitContent(`__ERROR__${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUnitLoading(false);
    }
  }, [connectionId, name]);

  useEffect(() => {
    if (view === "logs" && logs === null) void fetchLogs();
  }, [view, logs, fetchLogs]);

  useEffect(() => {
    if (view === "unit" && unitContent === null) void fetchUnit();
  }, [view, unitContent, fetchUnit]);

  const runAction = async (
    action: "start" | "stop" | "restart" | "enable" | "disable",
  ) => {
    const label = t(action);
    if (action === "stop") {
      if (
        !(await dialogConfirm(
          t("confirm_stop"),
          t("confirm_stop_msg", { name }),
          true,
        ))
      )
        return;
    } else if (action === "restart") {
      if (
        !(await dialogConfirm(
          t("confirm_restart"),
          t("confirm_restart_msg", { name }),
          true,
        ))
      )
        return;
    } else if (action === "disable") {
      if (
        !(await dialogConfirm(
          t("confirm_disable"),
          t("confirm_disable_msg", { name }),
          true,
        ))
      )
        return;
    }

    setBusy(action);
    try {
      await systemdService[action](connectionId, name);
      await fetchStatus();
      onChanged();
    } catch (e) {
      await dialogAlert(
        t("action_failed", { action: label }),
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!(await dialogConfirm(t("confirm_edit"), t("confirm_edit_msg"), true)))
      return;
    setEditSaving(true);
    try {
      const b64 = toBase64(editContent);
      await systemdService.createUnit(connectionId, name, b64, false, false);
      setEditing(false);
      setFullscreen(false);
      setUnitContent(null);
      await fetchUnit();
      onChanged();
    } catch (e) {
      await dialogAlert(
        t("edit_failed"),
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setEditSaving(false);
    }
  };

  const isRunning =
    status?.active_state === "active" ||
    status?.active_state === "activating";
  const isEnabled = status?.unit_file_state === "enabled";

  return (
    <div className="flex h-[45%] min-h-[200px] flex-col border-t-2 border-accent/40 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground">
          {name}
        </span>
        {status && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              activeStateColor(status.active_state),
              "bg-default-soft",
            )}
          >
            {status.active_state} / {status.sub_state}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 rounded p-0.5 text-muted hover:bg-default-soft hover:text-foreground"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-3 py-1.5">
        <ActionButton
          icon={Play}
          label={t("start")}
          disabled={isRunning || !!busy}
          loading={busy === "start"}
          onClick={() => runAction("start")}
        />
        <ActionButton
          icon={Square}
          label={t("stop")}
          disabled={!isRunning || !!busy}
          loading={busy === "stop"}
          danger
          onClick={() => runAction("stop")}
        />
        <ActionButton
          icon={RotateCw}
          label={t("restart")}
          disabled={!!busy}
          loading={busy === "restart"}
          onClick={() => runAction("restart")}
        />
        <div className="mx-1 h-4 w-px bg-border/50" />
        <ActionButton
          icon={ToggleRight}
          label={t("enable")}
          disabled={isEnabled || !!busy}
          loading={busy === "enable"}
          onClick={() => runAction("enable")}
        />
        <ActionButton
          icon={ToggleLeft}
          label={t("disable")}
          disabled={!isEnabled || !!busy}
          loading={busy === "disable"}
          danger
          onClick={() => runAction("disable")}
        />
        <div className="mx-1 h-4 w-px bg-border/50" />
        <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-default-soft p-0.5">
          {(["props", "unit", "logs"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors",
                view === v
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground",
              )}
            >
              {v === "props" && <Info size={11} />}
              {v === "unit" && <FileText size={11} />}
              {v === "logs" && <List size={11} />}
              {v === "logs" ? t("logs") : t(`view_${v}`)}
            </button>
          ))}
        </div>
        {(view === "unit" || view === "logs") && (
          <button
            type="button"
            title={t("fullscreen")}
            onClick={() => setFullscreen(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-default-soft hover:text-foreground"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {view === "logs" ? (
          <LogView
            logs={logs}
            loading={logsLoading}
            onRefresh={() => void fetchLogs()}
            emptyText={t("logs_empty")}
            loadingText={t("logs_loading")}
            refreshText={t("logs_refresh")}
          />
        ) : view === "unit" ? (
          <UnitFileView
            content={unitContent}
            loading={unitLoading}
            onRefresh={() => void fetchUnit()}
            onEdit={() => {
              if (unitContent && !unitContent.startsWith("__ERROR__")) {
                setEditContent(unitContent);
                setEditing(true);
                setFullscreen(true);
              }
            }}
            emptyText={t("unit_empty")}
            loadingText={t("unit_loading")}
          />
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={16} className="animate-spin text-accent" />
          </div>
        ) : status ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 text-xs">
            <Prop label={t("prop_description")} value={status.description} />
            <Prop
              label={t("prop_load_state")}
              value={status.load_state}
              color={activeStateColor(status.active_state)}
            />
            <Prop
              label={t("prop_active_state")}
              value={`${status.active_state} / ${status.sub_state}`}
              color={activeStateColor(status.active_state)}
            />
            <Prop
              label={t("prop_unit_file_state")}
              value={status.unit_file_state || t("not_set")}
            />
            <Prop
              label={t("prop_main_pid")}
              value={status.main_pid > 0 ? String(status.main_pid) : t("not_set")}
            />
            <Prop
              label={t("prop_memory")}
              value={
                status.memory_current > 0
                  ? formatBytes(status.memory_current)
                  : t("not_set")
              }
            />
            <Prop
              label={t("prop_cpu")}
              value={
                status.cpu_usage_nsec > 0
                  ? formatCpuTime(status.cpu_usage_nsec)
                  : t("not_set")
              }
            />
            <Prop
              label={t("prop_active_since")}
              value={status.active_enter_timestamp || t("not_set")}
            />
            <Prop
              label={t("prop_inactive_since")}
              value={status.inactive_enter_timestamp || t("not_set")}
            />
            <Prop
              label={t("prop_fragment_path")}
              value={status.fragment_path || t("not_set")}
              mono
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            {t("not_set")}
          </div>
        )}
      </div>

      {fullscreen &&
        createPortal(
          <div className="fixed left-0 right-0 bottom-0 top-10 z-[9999] flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium text-foreground">{name}</span>
              <span className="text-[10px] text-muted">
                {editing ? t("edit") : view === "logs" ? t("logs") : t("view_unit")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded border border-border/50 px-2 py-1 text-[11px] text-muted hover:bg-default-soft hover:text-foreground"
                  >
                    {t("cancel_edit")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={editSaving}
                    className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white disabled:opacity-50"
                  >
                    {editSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {t("save")}
                  </button>
                </>
              ) : (
                <>
                  {view === "unit" && unitContent && !unitContent.startsWith("__ERROR__") && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditContent(unitContent);
                        setEditing(true);
                      }}
                      className="flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[11px] text-muted hover:bg-default-soft hover:text-foreground"
                    >
                      <Pencil size={12} />
                      {t("edit")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFullscreen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-default-soft hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
                className="h-full w-full resize-none bg-black/40 p-3 font-mono text-xs leading-relaxed text-foreground outline-none"
              />
            ) : view === "logs" ? (
              <LogView
                logs={logs}
                loading={logsLoading}
                onRefresh={() => void fetchLogs()}
                emptyText={t("logs_empty")}
                loadingText={t("logs_loading")}
                refreshText={t("logs_refresh")}
              />
            ) : (
              <UnitFileView
                content={unitContent}
                loading={unitLoading}
                onRefresh={() => void fetchUnit()}
                onEdit={() => {
                  if (unitContent && !unitContent.startsWith("__ERROR__")) {
                    setEditContent(unitContent);
                    setEditing(true);
                  }
                }}
                emptyText={t("unit_empty")}
                loadingText={t("unit_loading")}
              />
            )}
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  disabled,
  loading,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        danger
          ? "border border-danger/40 text-danger hover:bg-danger-soft"
          : "border border-border/50 text-muted hover:bg-default-soft hover:text-foreground",
      )}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Icon size={12} />
      )}
      {label}
    </button>
  );
}

function Prop({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-foreground",
          mono && "font-mono",
          color,
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function LogView({
  logs,
  loading,
  onRefresh,
  emptyText,
  loadingText,
  refreshText,
}: {
  logs: string | null;
  loading: boolean;
  onRefresh: () => void;
  emptyText: string;
  loadingText: string;
  refreshText: string;
}) {
  const { t } = useTranslation("systemd");
  const isError = logs?.startsWith("__ERROR__");
  const content = isError ? logs!.slice(9) : logs;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-1">
        <span className="text-[10px] text-muted">
          {t("log_lines")}: {DEFAULT_LOG_LINES}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-default-soft hover:text-foreground"
        >
          <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          {refreshText}
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-black/40 p-2 font-mono text-[11px] leading-relaxed">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted">
            {loadingText}
          </div>
        ) : isError ? (
          <pre className="whitespace-pre-wrap text-danger">{content}</pre>
        ) : !content ? (
          <div className="flex h-full items-center justify-center text-muted">
            {emptyText}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-emerald-300/90">{content}</pre>
        )}
      </div>
    </div>
  );
}

function UnitFileView({
  content,
  loading,
  onRefresh,
  onEdit,
  emptyText,
  loadingText,
}: {
  content: string | null;
  loading: boolean;
  onRefresh: () => void;
  onEdit?: () => void;
  emptyText: string;
  loadingText: string;
}) {
  const { t } = useTranslation("systemd");
  const isError = content?.startsWith("__ERROR__");
  const text = isError ? content!.slice(9) : content;
  const canEdit = !!onEdit && !loading && !isError && !!text;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-1 border-b border-border/40 px-3 py-1">
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-default-soft hover:text-foreground"
          >
            <Pencil size={11} />
            {t("edit")}
          </button>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-default-soft hover:text-foreground"
        >
          <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          {t("logs_refresh")}
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-black/40 p-2 font-mono text-[11px] leading-relaxed">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted">
            {loadingText}
          </div>
        ) : isError ? (
          <pre className="whitespace-pre-wrap text-danger">{text}</pre>
        ) : !text ? (
          <div className="flex h-full items-center justify-center text-muted">
            {emptyText}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-emerald-300/90">{text}</pre>
        )}
      </div>
    </div>
  );
}

const TYPE_OPTIONS = ["simple", "forking", "oneshot", "notify", "idle"];
const RESTART_OPTIONS = ["no", "always", "on-failure", "on-abnormal"];

function CreateUnitForm({
  connectionId,
  existingNames,
  onClose,
  onCreated,
}: {
  connectionId: string;
  existingNames: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation("systemd");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [execStart, setExecStart] = useState("");
  const [type, setType] = useState("simple");
  const [user, setUser] = useState("");
  const [workDir, setWorkDir] = useState("");
  const [restart, setRestart] = useState("no");
  const [restartSec, setRestartSec] = useState("5");
  const [env, setEnv] = useState("");
  const [enableAfter, setEnableAfter] = useState(false);
  const [startAfter, setStartAfter] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const fullName = trimmedName.endsWith(".service")
    ? trimmedName
    : `${trimmedName}.service`;
  const exists = trimmedName !== "" && existingNames.includes(fullName);
  const content = buildUnitContent({
    description,
    execStart,
    type,
    user,
    workDir,
    restart,
    restartSec,
    env,
  });

  const handleSubmit = async () => {
    if (!trimmedName) {
      setError(t("create_name_required"));
      return;
    }
    if (!execStart.trim()) {
      setError(t("create_exec_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const b64 = toBase64(content);
      await systemdService.createUnit(
        connectionId,
        trimmedName,
        b64,
        enableAfter,
        startAfter,
      );
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none focus:border-accent";
  const selectCls =
    "w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent";
  const labelCls = "text-[10px] text-muted";

  return (
    <div className="absolute inset-0 z-20 flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/50 bg-background/60 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Plus size={15} className="text-accent" />
          <span className="text-xs font-medium text-foreground">
            {t("create_title")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 rounded p-0.5 text-muted hover:bg-default-soft hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("create_name")}</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
            />
            <span className="text-[10px] text-muted">
              {t("create_name_hint")}
            </span>
            {exists && (
              <span className="text-[10px] text-amber-500">
                {t("create_overwrite_warn")}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("create_description")}</label>
            <input
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("create_exec_start")}</label>
            <input
              className={inputCls}
              value={execStart}
              onChange={(e) => setExecStart(e.target.value)}
              placeholder="/usr/bin/node /opt/app/index.js"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t("create_type")}</label>
              <select
                className={selectCls}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {TYPE_OPTIONS.map((v) => (
                  <option key={v} value={v} className="bg-background text-foreground">
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t("create_restart")}</label>
              <select
                className={selectCls}
                value={restart}
                onChange={(e) => setRestart(e.target.value)}
              >
                {RESTART_OPTIONS.map((v) => (
                  <option key={v} value={v} className="bg-background text-foreground">
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t("create_user")}</label>
              <input
                className={inputCls}
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="root"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t("create_workdir")}</label>
              <input
                className={inputCls}
                value={workDir}
                onChange={(e) => setWorkDir(e.target.value)}
                placeholder="/opt/app"
              />
            </div>
          </div>
          {restart !== "no" && (
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{t("create_restart_sec")}</label>
              <input
                className={inputCls}
                value={restartSec}
                onChange={(e) => setRestartSec(e.target.value)}
                inputMode="numeric"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{t("create_env")}</label>
            <textarea
              className={cn(inputCls, "h-16 resize-none font-mono")}
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder={"NODE_ENV=production\nPORT=3000"}
            />
            <span className="text-[10px] text-muted">
              {t("create_env_hint")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={enableAfter}
                onChange={(e) => setEnableAfter(e.target.checked)}
                className="accent-accent"
              />
              {t("create_enable_after")}
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={startAfter}
                onChange={(e) => setStartAfter(e.target.checked)}
                className="accent-accent"
              />
              {t("create_start_after")}
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
            >
              {showPreview ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              {showPreview ? t("create_preview_hide") : t("create_preview")}
            </button>
            {showPreview && (
              <pre className="max-h-48 overflow-auto rounded border border-border/50 bg-black/40 p-2 font-mono text-[11px] text-emerald-300/90">
                {content}
              </pre>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-t border-danger/30 bg-danger/10 px-3 py-1.5">
          <AlertCircle size={12} className="text-danger" />
          <span className="text-[11px] text-danger">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border/50 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border/50 px-3 py-1 text-xs text-muted hover:bg-default-soft hover:text-foreground"
        >
          {t("create_cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-1 rounded bg-accent px-3 py-1 text-xs text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          {t("create_submit")}
        </button>
      </div>
    </div>
  );
}

function buildUnitContent(f: {
  description: string;
  execStart: string;
  type: string;
  user: string;
  workDir: string;
  restart: string;
  restartSec: string;
  env: string;
}): string {
  const lines: string[] = ["[Unit]"];
  if (f.description) lines.push(`Description=${f.description}`);
  lines.push("");
  lines.push("[Service]");
  lines.push(`Type=${f.type}`);
  lines.push(`ExecStart=${f.execStart}`);
  if (f.user.trim()) lines.push(`User=${f.user.trim()}`);
  if (f.workDir.trim()) lines.push(`WorkingDirectory=${f.workDir.trim()}`);
  lines.push(`Restart=${f.restart}`);
  if (f.restart !== "no") lines.push(`RestartSec=${f.restartSec || "5"}`);
  for (const line of f.env.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) lines.push(`Environment=${trimmed}`);
  }
  lines.push("");
  lines.push("[Install]");
  lines.push("WantedBy=multi-user.target");
  return lines.join("\n") + "\n";
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
