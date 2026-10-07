import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Server,
  Activity,
  Pause,
  Play,
  RefreshCw,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { performanceService } from "../../services/performanceService";
import type { PerformanceSample } from "../../types/performance";
import { PerformanceChart } from "./PerformanceChart";
import { cn } from "../../lib/cn";
import { PanelHeader, panelHeaderBtnClass } from "../../components/PanelHeader";
import i18n from "../../lib/i18n";

interface PerformancePanelProps {
  connectionId: string;
}

const MAX_HISTORY = 60;
const CORE_FOLD_THRESHOLD = 8;
const INTERVAL_OPTIONS = [
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 },
  { label: "5s", value: 5000 },
];

export function PerformancePanel({ connectionId }: PerformancePanelProps) {
  const { t } = useTranslation("performance");
  const [sample, setSample] = useState<PerformanceSample | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [loadHistory, setLoadHistory] = useState<number[]>([]);
  const [intervalMs, setIntervalMs] = useState(2000);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const firstRef = useRef(true);

  const fetchOnce = useCallback(
    async (silent: boolean) => {
      if (!silent) setRefreshing(true);
      try {
        const s = await performanceService.sample(connectionId);
        setSample(s);
        setError(null);
        setCpuHistory((h) => [...h, s.cpu_usage].slice(-MAX_HISTORY));
        const memPct = s.mem_total > 0 ? (s.mem_used / s.mem_total) * 100 : 0;
        setMemHistory((h) => [...h, memPct].slice(-MAX_HISTORY));
        setLoadHistory((h) => [...h, s.load_avg[0]].slice(-MAX_HISTORY));
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
    setSample(null);
    setCpuHistory([]);
    setMemHistory([]);
    setLoadHistory([]);
    setError(null);
    fetchOnce(true);
  }, [connectionId, fetchOnce]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => fetchOnce(true), intervalMs);
    return () => window.clearInterval(id);
  }, [paused, intervalMs, fetchOnce]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  if (error && !sample) {
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
            fetchOnce(true);
          }}
          className="rounded-md border border-border bg-default-soft px-3 py-1 text-xs text-foreground hover:bg-accent-soft"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={Activity} title={t("title")}>
        <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-default-soft p-0.5">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setIntervalMs(opt.value)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                intervalMs === opt.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          title={paused ? t("resume") : t("pause")}
          onClick={() => setPaused((p) => !p)}
          className={panelHeaderBtnClass}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
        <button
          type="button"
          title={t("refresh_now")}
          onClick={() => fetchOnce(false)}
          className={panelHeaderBtnClass}
        >
          <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
        </button>
      </PanelHeader>

      {error && (
        <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5">
          <AlertCircle size={12} className="text-danger" />
          <span className="text-[11px] text-danger">{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {sample && (
          <div className="flex flex-col gap-3">
            <OverviewCard sample={sample} />
            <CpuCard sample={sample} history={cpuHistory} />
            <MemoryCard sample={sample} history={memHistory} />
            <LoadCard sample={sample} history={loadHistory} />
            <DiskCard sample={sample} />
            <NetworkCard sample={sample} />
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/70 p-3 backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} className="text-accent" />
        <h3 className="text-xs font-medium text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  );
}

function OverviewCard({ sample }: { sample: PerformanceSample }) {
  const { t } = useTranslation("performance");
  return (
    <Card icon={Server} title={t("overview")}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("hostname")} value={sample.hostname} />
        <Stat label={t("os")} value={sample.os} />
        <Stat label={t("kernel")} value={sample.kernel} />
        <Stat label={t("uptime")} value={formatUptime(sample.uptime_seconds)} />
        <Stat
          label={t("load")}
          value={sample.load_avg.map((v) => v.toFixed(2)).join(" / ")}
        />
        <Stat label={t("processes")} value={String(sample.process_count)} />
      </div>
    </Card>
  );
}

function CpuCard({
  sample,
  history,
}: {
  sample: PerformanceSample;
  history: number[];
}) {
  const { t } = useTranslation("performance");
  const perCore = sample.cpu_per_core;
  const [expanded, setExpanded] = useState(perCore.length <= CORE_FOLD_THRESHOLD);
  return (
    <Card icon={Cpu} title={t("cpu")}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-accent">
          {sample.cpu_usage.toFixed(1)}
        </span>
        <span className="text-sm text-muted">%</span>
        <span className="ml-auto text-[10px] text-muted">
          {t("cpu_cores", { cores: sample.cpu_cores, model: sample.cpu_model })}
        </span>
      </div>
      <PerformanceChart data={history} max={100} height={56} />
      {perCore.length > 0 && (
        <div className="mt-2">
          {perCore.length > CORE_FOLD_THRESHOLD && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mb-1 flex items-center gap-1 text-[10px] text-muted transition-colors hover:text-foreground"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded
                ? t("cpu_collapse")
                : t("cpu_summary", {
                    cores: perCore.length,
                    avg: (perCore.reduce((a, b) => a + b, 0) / perCore.length).toFixed(1),
                    max: Math.max(...perCore).toFixed(1),
                  })}
            </button>
          )}
          {expanded && (
            <div className="space-y-0.5">
              {perCore.map((u, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-4 text-right text-[9px] tabular-nums text-muted">{i}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-default-soft">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${u}%` }}
                    />
                  </div>
                  <span className="w-7 text-right text-[9px] tabular-nums text-muted">{u.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MemoryCard({
  sample,
  history,
}: {
  sample: PerformanceSample;
  history: number[];
}) {
  const { t } = useTranslation("performance");
  const pct =
    sample.mem_total > 0 ? (sample.mem_used / sample.mem_total) * 100 : 0;
  return (
    <Card icon={MemoryStick} title={t("memory")}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-accent">{pct.toFixed(1)}</span>
        <span className="text-sm text-muted">%</span>
        <span className="ml-auto text-[10px] text-muted">
          {formatBytes(sample.mem_used)} / {formatBytes(sample.mem_total)}
        </span>
      </div>
      <PerformanceChart data={history} max={100} height={48} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label={t("mem_available")} value={formatBytes(sample.mem_available)} />
        <Stat label={t("mem_cached")} value={formatBytes(sample.mem_cached)} />
        <Stat
          label={t("mem_swap")}
          value={formatBytes(sample.swap_used)}
          sub={sample.swap_total > 0 ? `/ ${formatBytes(sample.swap_total)}` : t("no_swap")}
        />
      </div>
    </Card>
  );
}

function LoadCard({
  sample,
  history,
}: {
  sample: PerformanceSample;
  history: number[];
}) {
  const { t } = useTranslation("performance");
  const maxScale = Math.max(1, ...history, sample.load_avg[0] * 1.2);
  return (
    <Card icon={Activity} title={t("load_title")}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-accent">
          {sample.load_avg[0].toFixed(2)}
        </span>
        <span className="text-xs text-muted">
          {t("load_5m_15m", { v5: sample.load_avg[1].toFixed(2), v15: sample.load_avg[2].toFixed(2) })}
        </span>
        <span className="ml-auto text-[10px] text-muted">
          {t("load_normalized", { value: (sample.load_avg[0] / Math.max(1, sample.cpu_cores)).toFixed(2) })}
        </span>
      </div>
      <PerformanceChart data={history} max={maxScale} height={48} />
    </Card>
  );
}

function DiskCard({ sample }: { sample: PerformanceSample }) {
  const { t } = useTranslation("performance");
  if (sample.disks.length === 0) {
    return (
      <Card icon={HardDrive} title={t("disk")}>
        <p className="text-xs text-muted">{t("no_disk")}</p>
      </Card>
    );
  }
  return (
    <Card icon={HardDrive} title={t("disk")}>
      <div className="flex flex-col gap-2">
        {sample.disks.map((d) => {
          const pct = d.total > 0 ? (d.used / d.total) * 100 : 0;
          return (
            <div key={d.mount}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-foreground" title={d.mount}>
                  {d.mount}
                </span>
                <span className="flex-shrink-0 text-muted">
                  {formatBytes(d.used)} / {formatBytes(d.total)}
                </span>
              </div>
              <Bar value={pct} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function NetworkCard({ sample }: { sample: PerformanceSample }) {
  const { t } = useTranslation("performance");
  if (sample.net_interfaces.length === 0) {
    return (
      <Card icon={Network} title={t("network")}>
        <p className="text-xs text-muted">{t("no_network")}</p>
      </Card>
    );
  }
  return (
    <Card icon={Network} title={t("network_traffic")}>
      <div className="grid grid-cols-2 gap-2">
        {sample.net_interfaces.map((n) => (
          <div
            key={n.name}
            className="rounded-lg border border-border/40 bg-default-soft/50 p-2"
          >
            <div className="mb-1 flex items-center gap-1.5">
              <Layers size={11} className="text-accent" />
              <span className="text-[11px] font-medium text-foreground">
                {n.name}
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted">↓ {formatBytes(n.rx_bytes)}</span>
              <span className="text-muted">↑ {formatBytes(n.tx_bytes)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Bar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "var(--accent)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-default-soft">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatUptime(s: number): string {
  if (s <= 0) return i18n.t("unknown", { ns: "performance" });
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return i18n.t("uptime_days", { ns: "performance", d, h });
  if (h > 0) return i18n.t("uptime_hours", { ns: "performance", h, m });
  return i18n.t("uptime_minutes", { ns: "performance", m });
}
