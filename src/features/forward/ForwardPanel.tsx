import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { forwardService } from "../../services/forwardService";
import { FORWARD_STATE_EVENT } from "../../types/events";
import type { ForwardStatePayload } from "../../types/events";
import type { ForwardInfo, ForwardKind } from "../../types/forward";
import {
  ArrowRightLeft,
  ArrowLeftRight,
  Globe,
  Plus,
  X,
  AlertTriangle,
  Loader2,
  Circle,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { PanelHeader } from "../../components/PanelHeader";

interface ForwardPanelProps {
  connectionId: string;
}

const KIND_OPTIONS: { value: ForwardKind; flag: string; labelKey: string; descKey: string }[] = [
  { value: "local", flag: "-L", labelKey: "kind_local", descKey: "desc_local" },
  { value: "remote", flag: "-R", labelKey: "kind_remote", descKey: "desc_remote" },
  { value: "dynamic", flag: "-D", labelKey: "kind_dynamic", descKey: "desc_dynamic" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ForwardPanel({ connectionId }: ForwardPanelProps) {
  const { t } = useTranslation("forward");
  const [forwards, setForwards] = useState<ForwardInfo[]>([]);
  const [kind, setKind] = useState<ForwardKind>("local");
  const [localHost, setLocalHost] = useState("127.0.0.1");
  const [localPort, setLocalPort] = useState("");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ruleText = (info: ForwardInfo): string => {
    const { spec, bound_port } = info;
    const local = `${spec.local_host}:${bound_port || spec.local_port}`;
    if (spec.kind === "dynamic") {
      return t("rule_dynamic", { local });
    }
    const remote = `${spec.remote_host}:${spec.remote_port}`;
    if (spec.kind === "remote") {
      return t("rule_remote", { remote, local });
    }
    return t("rule_local", { local, remote });
  };

  useEffect(() => {
    let alive = true;
    setForwards([]);
    forwardService.list(connectionId).then((list) => {
      if (alive) setForwards(list);
    });
    const unlisten = listen<ForwardStatePayload>(FORWARD_STATE_EVENT, (e) => {
      const p = e.payload;
      if (p.connection_id !== connectionId) return;
      // 后端不再 emit starting；若因时序收到遗留 starting，不覆盖已 active 的状态。
      if (p.status === "starting") return;
      setForwards((prev) => {
        const idx = prev.findIndex((f) => f.id === p.forward_id);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: p.status,
          bound_port: p.bound_port,
          bytes_in: p.bytes_in,
          bytes_out: p.bytes_out,
          error: p.error,
        };
        return copy;
      });
    });
    return () => {
      alive = false;
      unlisten.then((f) => f());
    };
  }, [connectionId]);

  const handleAdd = async () => {
    const lp = Number(localPort);
    if (!localHost.trim() || !localPort.trim() || lp <= 0 || lp > 65535) {
      setError(t("local_port"));
      return;
    }
    if (kind !== "dynamic") {
      const rp = Number(remotePort);
      if (!remoteHost.trim() || !remotePort.trim() || rp <= 0 || rp > 65535) {
        setError(t("remote_port"));
        return;
      }
    }
    setAdding(true);
    setError(null);
    try {
      const rp = kind === "dynamic" ? 0 : Number(remotePort);
      const id = await forwardService.add(
        connectionId,
        kind,
        localHost.trim(),
        lp,
        remoteHost.trim(),
        rp,
      );
      // add 返回时后端 bind/tcpip_forward 已同步完成：成功必为 active，失败已抛错走 catch。
      // 直接 optimistic 加入 active，不调 list 覆盖（避免 list 时序拿回 starting 覆盖 active）。
      setForwards((prev) => [
        ...prev,
        {
          id,
          spec: {
            kind,
            local_host: localHost.trim(),
            local_port: lp,
            remote_host: remoteHost.trim(),
            remote_port: rp,
          },
          status: "active" as const,
          bound_port: kind === "remote" ? rp : lp,
          bytes_in: 0,
          bytes_out: 0,
          error: null,
        },
      ]);
      setLocalPort("");
      setRemoteHost("");
      setRemotePort("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (forwardId: string) => {
    setForwards((prev) => prev.filter((f) => f.id !== forwardId));
    try {
      await forwardService.remove(connectionId, forwardId);
    } catch {
      const list = await forwardService.list(connectionId);
      setForwards(list);
    }
  };

  const inputCls =
    "w-full rounded border border-border bg-transparent px-2 py-1 text-sm text-foreground outline-none focus:border-accent";

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={ArrowRightLeft} title={t("title")} />
      <div className="border-b border-border/50 p-3 space-y-2">
        <div className="flex gap-1">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setKind(opt.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                kind === opt.value
                  ? "bg-accent text-white"
                  : "border border-border text-muted hover:bg-default-soft hover:text-foreground",
              )}
            >
              <span className={cn("font-mono text-[10px]", kind === opt.value ? "text-white/70" : "text-muted/70")}>{opt.flag}</span>
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{t(KIND_OPTIONS.find((o) => o.value === kind)!.descKey)}</p>
        <div className="flex items-center gap-1.5">
          <input
            className={inputCls}
            value={localHost}
            onChange={(e) => setLocalHost(e.target.value)}
            placeholder={t("local_addr")}
          />
          <span className="text-muted">:</span>
          <input
            className={cn(inputCls, "w-20")}
            value={localPort}
            onChange={(e) => setLocalPort(e.target.value)}
            placeholder={t("local_port")}
            inputMode="numeric"
          />
        </div>
        {kind !== "dynamic" ? (
          <div className="flex items-center gap-1.5">
            <input
              className={inputCls}
              value={remoteHost}
              onChange={(e) => setRemoteHost(e.target.value)}
              placeholder={t("remote_addr")}
            />
            <span className="text-muted">:</span>
            <input
              className={cn(inputCls, "w-20")}
              value={remotePort}
              onChange={(e) => setRemotePort(e.target.value)}
              placeholder={t("remote_port")}
              inputMode="numeric"
            />
          </div>
        ) : null}
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="flex w-full items-center justify-center gap-1 rounded bg-accent px-3 py-1.5 text-sm text-white transition-opacity disabled:opacity-50"
        >
          <Plus size={14} />
          <span>{t("add")}</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {forwards.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
            <ArrowRightLeft size={28} className="opacity-40" />
            <span>{t("empty")}</span>
          </div>
        ) : (
          forwards.map((f) => (
            <div key={f.id} className="border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                {f.spec.kind === "local" && (
                  <ArrowRightLeft size={14} className="flex-shrink-0 text-accent" />
                )}
                {f.spec.kind === "remote" && (
                  <ArrowLeftRight size={14} className="flex-shrink-0 text-accent" />
                )}
                {f.spec.kind === "dynamic" && (
                  <Globe size={14} className="flex-shrink-0 text-accent" />
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {ruleText(f)}
                </span>
                {f.status === "starting" && (
                  <Loader2 size={13} className="flex-shrink-0 animate-spin text-accent" />
                )}
                {f.status === "active" && (
                  <Circle size={10} className="flex-shrink-0 fill-emerald-500 text-emerald-500" />
                )}
                {f.status === "error" && (
                  <AlertTriangle size={14} className="flex-shrink-0 text-danger" />
                )}
                {f.status === "stopped" && (
                  <Circle size={10} className="flex-shrink-0 text-muted" />
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(f.id)}
                  className="flex-shrink-0 rounded p-0.5 text-muted opacity-50 transition-opacity hover:bg-danger-soft hover:text-danger hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted">
                <span>
                  {f.status === "error"
                    ? (f.error ?? t("status_error")).slice(0, 40)
                    : t(`status_${f.status}`)}
                </span>
                {f.spec.kind !== "remote" && f.status === "active" && (
                  <span>{t("traffic", { in: formatBytes(f.bytes_in), out: formatBytes(f.bytes_out) })}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
