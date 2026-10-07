import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Plus,
  RefreshCw,
  Search,
  X,
  Pencil,
  Trash2,
  Play,
  Pause,
  FileText,
  ScrollText,
  Loader2,
  AlertCircle,
  Save,
  Calendar,
  Server,
  Terminal,
} from "lucide-react";
import { cronService } from "../../services/cronService";
import type { CronJob, CronFile } from "../../types/cron";
import { dialogConfirm, dialogAlert } from "../../lib/dialog";
import { cn } from "../../lib/cn";
import { PanelHeader, panelHeaderBtnClass } from "../../components/PanelHeader";

interface CronPanelProps {
  connectionId: string;
}

type Tab = "user" | "system";
type SpecialTime = "@reboot" | "@daily" | "@hourly" | "@weekly" | "@monthly" | "@yearly";

const REFRESH_INTERVAL = 10000;
const DEFAULT_LOG_LINES = 200;

const PRESETS: { labelKey: string; minute: string; hour: string; day: string; month: string; weekday: string }[] = [
  { labelKey: "preset_every_minute", minute: "*", hour: "*", day: "*", month: "*", weekday: "*" },
  { labelKey: "preset_every_hour", minute: "0", hour: "*", day: "*", month: "*", weekday: "*" },
  { labelKey: "preset_every_day", minute: "0", hour: "0", day: "*", month: "*", weekday: "*" },
  { labelKey: "preset_every_week", minute: "0", hour: "0", day: "*", month: "*", weekday: "0" },
  { labelKey: "preset_every_month", minute: "0", hour: "0", day: "1", month: "*", weekday: "*" },
];

const SPECIALS: { value: SpecialTime; labelKey: string }[] = [
  { value: "@reboot", labelKey: "special_reboot" },
  { value: "@daily", labelKey: "special_daily" },
  { value: "@hourly", labelKey: "special_hourly" },
  { value: "@weekly", labelKey: "special_weekly" },
  { value: "@monthly", labelKey: "special_monthly" },
  { value: "@yearly", labelKey: "special_yearly" },
];

function formatSchedule(job: CronJob): string {
  if (job.is_special) return job.special;
  return `${job.minute} ${job.hour} ${job.day} ${job.month} ${job.weekday}`;
}

function buildCronLine(form: JobForm): string {
  const line = form.isSpecial
    ? `${form.special} ${form.command}`
    : `${form.minute} ${form.hour} ${form.day} ${form.month} ${form.weekday} ${form.command}`;
  return line;
}

interface JobForm {
  isSpecial: boolean;
  special: SpecialTime;
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
  command: string;
  comment: string;
}

function emptyForm(): JobForm {
  return {
    isSpecial: false,
    special: "@daily",
    minute: "*",
    hour: "*",
    day: "*",
    month: "*",
    weekday: "*",
    command: "",
    comment: "",
  };
}

function jobToForm(job: CronJob): JobForm {
  return {
    isSpecial: job.is_special,
    special: (job.special as SpecialTime) || "@daily",
    minute: job.minute || "*",
    hour: job.hour || "*",
    day: job.day || "*",
    month: job.month || "*",
    weekday: job.weekday || "*",
    command: job.command,
    comment: job.comment,
  };
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function CronPanel({ connectionId }: CronPanelProps) {
  const { t } = useTranslation("cron");
  const [tab, setTab] = useState<Tab>("user");
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [editing, setEditing] = useState<{ index: number; form: JobForm } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [jobLogs, setJobLogs] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ command: string; stdout: string; stderr: string; exit_code: number } | null>(null);
  const [runningCmd, setRunningCmd] = useState<string | null>(null);

  const fetchJobs = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const raw = await cronService.getCrontabRaw(connectionId);
        setRawLines(raw.split("\n"));
        const list = await cronService.listJobs(connectionId);
        setJobs(list);
        setError(null);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    },
    [connectionId],
  );

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!autoRefresh || tab !== "user" || editing || showLogs || showRaw || jobLogs || runResult) return;
    const id = setInterval(() => void fetchJobs(true), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [autoRefresh, tab, fetchJobs, editing, showLogs, showRaw, jobLogs, runResult]);

  const saveCrontab = useCallback(
    async (lines: string[]) => {
      const filtered = lines.filter((l) => l.trim().length > 0);
      const content = filtered.join("\n") + "\n";
      await cronService.setCrontabRaw(connectionId, toBase64(content));
      setRawLines(filtered);
      const list = await cronService.listJobs(connectionId);
      setJobs(list);
    },
    [connectionId],
  );

  const handleSaveJob = async () => {
    if (!editing) return;
    const { index, form } = editing;
    if (!form.command.trim()) {
      void dialogAlert(t("error_save"), t("field_command") + " is required");
      return;
    }
    try {
      const lines = [...rawLines];
      const newLine = buildCronLine(form);
      if (index >= 0 && index < lines.length) {
        lines[index] = newLine;
      } else {
        if (form.comment.trim()) {
          lines.push(`# ${form.comment.trim()}`);
        }
        lines.push(newLine);
      }
      await saveCrontab(lines);
      setEditing(null);
      setError(null);
    } catch (e) {
      void dialogAlert(t("error_save"), errMsg(e));
    }
  };

  const handleDeleteJob = async (job: CronJob) => {
    const ok = await dialogConfirm(
      t("confirm_delete"),
      t("confirm_delete_msg", { command: job.command.slice(0, 60) }),
      true,
    );
    if (!ok) return;
    try {
      const lines = [...rawLines];
      const idx = job.line_number - 1;
      if (idx < 0 || idx >= lines.length) return;
      let commentIdx = -1;
      if (idx > 0 && lines[idx - 1].trimStart().startsWith("#")) {
        const afterHash = lines[idx - 1].trimStart().slice(1).trim();
        if (afterHash && !afterHash.match(/^[@*0-9]/)) {
          commentIdx = idx - 1;
        }
      }
      lines.splice(commentIdx >= 0 ? commentIdx : idx, commentIdx >= 0 ? 2 : 1);
      await saveCrontab(lines);
    } catch (e) {
      void dialogAlert(t("error_delete"), errMsg(e));
    }
  };

  const handleToggleJob = async (job: CronJob) => {
    if (job.enabled) {
      const ok = await dialogConfirm(t("disable"), t("confirm_disable"), true);
      if (!ok) return;
    }
    try {
      const lines = [...rawLines];
      const idx = job.line_number - 1;
      if (idx >= 0 && idx < lines.length) {
        if (job.enabled) {
          lines[idx] = "# " + lines[idx];
        } else {
          lines[idx] = lines[idx].replace(/^#\s*/, "");
        }
      }
      await saveCrontab(lines);
    } catch (e) {
      void dialogAlert(t("error_save"), errMsg(e));
    }
  };

  const handleRunJob = async (command: string) => {
    setRunningCmd(command);
    try {
      const result = await cronService.runJob(connectionId, command);
      setRunResult({ command, ...result });
    } catch (e) {
      setRunResult({ command, stdout: "", stderr: errMsg(e), exit_code: -1 });
    } finally {
      setRunningCmd(null);
    }
  };

  const filtered = jobs.filter((j) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      j.command.toLowerCase().includes(s) ||
      formatSchedule(j).includes(s) ||
      j.comment.toLowerCase().includes(s)
    );
  });

  const enabledCount = jobs.filter((j) => j.enabled).length;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <PanelHeader icon={Clock} title={t("title")}>
        {tab === "user" && (
          <button
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
            onClick={() => setEditing({ index: -1, form: emptyForm() })}
          >
            <Plus size={14} />
            {t("new_job")}
          </button>
        )}
        <button
          className={cn(panelHeaderBtnClass, autoRefresh && "text-accent")}
          title={t("auto_refresh")}
          onClick={() => setAutoRefresh((v) => !v)}
        >
          <RefreshCw size={14} className={autoRefresh ? "animate-spin" : ""} />
        </button>
        <button
          className={panelHeaderBtnClass}
          title={t("refresh")}
        >
          <RefreshCw size={14} />
        </button>
      </PanelHeader>

      <div className="flex border-b border-border">
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "user"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground",
          )}
          onClick={() => setTab("user")}
        >
          <Clock size={13} />
          {t("tab_user")}
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "system"
              ? "border-b-2 border-accent text-accent"
              : "text-muted hover:text-foreground",
          )}
          onClick={() => setTab("system")}
        >
          <Server size={13} />
          {t("tab_system")}
        </button>
        {tab === "user" && (
          <div className="ml-auto flex items-center gap-1 px-3">
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-default-soft hover:text-foreground"
              onClick={() => setShowLogs(true)}
            >
              <ScrollText size={13} />
              {t("view_logs")}
            </button>
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-default-soft hover:text-foreground"
              onClick={() => setShowRaw(true)}
            >
              <FileText size={13} />
              {t("view_raw")}
            </button>
          </div>
        )}
      </div>

      {tab === "user" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
            <Search size={13} className="text-muted" />
            <input
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
              placeholder={t("search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="text-xs text-muted">
              {t("enabled_count", { count: enabledCount })} · {t("total_count", { count: jobs.length })}
            </span>
          </div>

          {error && jobs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
              <AlertCircle size={24} className="text-danger" />
              <span className="text-sm">{t("error_load")}</span>
              <span className="text-xs text-muted">{error}</span>
              <button
                className="rounded-md bg-accent px-3 py-1 text-xs text-white hover:opacity-90"
                onClick={() => void fetchJobs()}
              >
                {t("retry")}
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center text-muted">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
              <Calendar size={32} className="opacity-40" />
              <span className="text-sm">{jobs.length === 0 ? t("no_jobs") : t("loading")}</span>
              {jobs.length === 0 && (
                <span className="text-xs">{t("no_jobs_desc")}</span>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              {filtered.map((job) => (
                <JobItem
                  key={job.line_number}
                  job={job}
                  onEdit={() => setEditing({ index: job.line_number - 1, form: jobToForm(job) })}
                  onDelete={() => void handleDeleteJob(job)}
                  onToggle={() => void handleToggleJob(job)}
                  onLogs={() => setJobLogs(job.command)}
                  onRun={() => void handleRunJob(job.command)}
                  running={runningCmd === job.command}
                />
              ))}
            </div>
          )}

          {editing && (
            <JobEditForm
              form={editing.form}
              isNew={editing.index < 0}
              onChange={(form) => setEditing({ ...editing, form })}
              onSave={() => void handleSaveJob()}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      ) : (
        <SystemFilesView connectionId={connectionId} />
      )}

      {showLogs && (
        <LogsView
          connectionId={connectionId}
          onClose={() => setShowLogs(false)}
        />
      )}
      {showRaw && (
        <RawEditView
          initialContent={rawLines.join("\n")}
          onSave={async (content) => {
            await saveCrontab(content.split("\n"));
            setShowRaw(false);
          }}
          onClose={() => setShowRaw(false)}
        />
      )}
      {jobLogs && (
        <JobLogsView
          connectionId={connectionId}
          command={jobLogs}
          onClose={() => setJobLogs(null)}
        />
      )}
      {runResult && (
        <RunResultView
          result={runResult}
          onClose={() => setRunResult(null)}
        />
      )}
    </div>
  );
}

function JobItem({
  job,
  onEdit,
  onDelete,
  onToggle,
  onLogs,
  onRun,
  running,
}: {
  job: CronJob;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onLogs: () => void;
  onRun: () => void;
  running: boolean;
}) {
  const { t } = useTranslation("cron");
  return (
    <div
      className={cn(
        "group flex items-start gap-2 border-b border-border/50 px-3 py-2 hover:bg-default-soft/50",
        !job.enabled && "opacity-50",
      )}
    >
      <button
        className="mt-0.5 shrink-0"
        onClick={onToggle}
        title={job.enabled ? t("disable") : t("enable")}
      >
        {job.enabled ? (
          <Play size={14} className="text-emerald-500" />
        ) : (
          <Pause size={14} className="text-muted" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="rounded bg-default-soft/60 px-1.5 py-0.5 font-mono text-xs text-accent">
            {formatSchedule(job)}
          </code>
          <span className={cn("text-xs", job.enabled ? "text-emerald-500" : "text-muted")}>
            {job.enabled ? t("status_enabled") : t("status_disabled")}
          </span>
        </div>
        <code className="mt-1 block truncate font-mono text-xs text-foreground" title={job.command}>
          {job.command}
        </code>
        {job.comment && (
          <span className="mt-0.5 block truncate text-xs text-muted">{job.comment}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-default-soft/40 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          className="rounded p-1 text-muted hover:bg-accent/20 hover:text-accent disabled:opacity-50"
          onClick={onRun}
          disabled={running}
          title={t("run_job")}
        >
          {running ? <Loader2 size={13} className="animate-spin" /> : <Terminal size={13} />}
        </button>
        <button
          className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
          onClick={onLogs}
          title={t("job_logs_title")}
        >
          <ScrollText size={13} />
        </button>
        <button
          className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
          onClick={onEdit}
          title={t("edit_job")}
        >
          <Pencil size={13} />
        </button>
        <div className="mx-0.5 h-4 w-px bg-border/50" />
        <button
          className="rounded p-1 text-muted hover:bg-danger/20 hover:text-danger"
          onClick={onDelete}
          title={t("delete_job")}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function JobEditForm({
  form,
  isNew,
  onChange,
  onSave,
  onCancel,
}: {
  form: JobForm;
  isNew: boolean;
  onChange: (form: JobForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("cron");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col border-t border-border bg-default-soft px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <Pencil size={14} className="text-accent" />
        <span className="text-xs font-semibold">
          {isNew ? t("new_job") : t("edit_job")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !form.command.trim()}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {t("save")}
          </button>
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
            onClick={onCancel}
          >
            <X size={13} />
            {t("cancel")}
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <button
          className={cn(
            "rounded-md px-2 py-1 text-xs",
            !form.isSpecial ? "bg-accent text-white" : "bg-default-soft text-muted hover:text-foreground",
          )}
          onClick={() => onChange({ ...form, isSpecial: false })}
        >
          {t("use_standard")}
        </button>
        <button
          className={cn(
            "rounded-md px-2 py-1 text-xs",
            form.isSpecial ? "bg-accent text-white" : "bg-default-soft text-muted hover:text-foreground",
          )}
          onClick={() => onChange({ ...form, isSpecial: true })}
        >
          {t("use_special")}
        </button>
      </div>

      {form.isSpecial ? (
        <div className="mb-2">
          <label className="mb-1 block text-xs text-muted">{t("field_special")}</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={form.special}
            onChange={(e) => onChange({ ...form, special: e.target.value as SpecialTime })}
          >
            {SPECIALS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value} — {t(s.labelKey)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-2">
          <div className="mb-1.5 flex items-center gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.labelKey}
                className="rounded bg-default-soft px-1.5 py-0.5 text-xs text-muted hover:bg-accent hover:text-white"
                onClick={() =>
                  onChange({
                    ...form,
                    minute: p.minute,
                    hour: p.hour,
                    day: p.day,
                    month: p.month,
                    weekday: p.weekday,
                  })
                }
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {([
              ["minute", t("field_minute")],
              ["hour", t("field_hour")],
              ["day", t("field_day")],
              ["month", t("field_month")],
              ["weekday", t("field_weekday")],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="mb-0.5 block text-xs text-muted">{label}</label>
                <input
                  className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                  value={form[key]}
                  onChange={(e) => onChange({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2">
        <label className="mb-0.5 block text-xs text-muted">{t("field_command")}</label>
        <textarea
          className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
          rows={2}
          value={form.command}
          onChange={(e) => onChange({ ...form, command: e.target.value })}
          placeholder="/usr/bin/example.sh"
        />
      </div>

      {isNew && (
        <div>
          <label className="mb-0.5 block text-xs text-muted">{t("field_comment")}</label>
          <input
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={form.comment}
            onChange={(e) => onChange({ ...form, comment: e.target.value })}
            placeholder="# optional comment"
          />
        </div>
      )}
    </div>
  );
}

function JobLogsView({
  connectionId,
  command,
  onClose,
}: {
  connectionId: string;
  command: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("cron");
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(DEFAULT_LOG_LINES);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const out = await cronService.getJobLogs(connectionId, command, lines);
      setLogs(out);
    } catch {
      setLogs(t("no_job_logs"));
    } finally {
      setLoading(false);
    }
  }, [connectionId, command, lines, t]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return createPortal(
    <div className="fixed top-10 left-0 right-0 bottom-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <ScrollText size={16} className="text-accent" />
        <span className="text-sm font-semibold">{t("job_logs_title")}</span>
        <code className="truncate font-mono text-xs text-muted" title={command}>{command}</code>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">{t("logs_lines")}</span>
          <input
            type="number"
            className="w-16 rounded-md border border-border bg-default-soft px-2 py-1 text-xs"
            value={lines}
            min={10}
            max={5000}
            onChange={(e) => setLines(Number(e.target.value) || DEFAULT_LOG_LINES)}
          />
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
            onClick={() => void fetchLogs()}
          >
            <RefreshCw size={13} />
            {t("refresh")}
          </button>
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
            onClick={onClose}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 py-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{logs}</pre>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RunResultView({
  result,
  onClose,
}: {
  result: { command: string; stdout: string; stderr: string; exit_code: number };
  onClose: () => void;
}) {
  const { t } = useTranslation("cron");
  const success = result.exit_code === 0;
  return createPortal(
    <div className="fixed top-10 left-0 right-0 bottom-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Terminal size={16} className={success ? "text-emerald-500" : "text-danger"} />
        <span className="text-sm font-semibold">{t("run_result")}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-xs", success ? "bg-emerald-500/20 text-emerald-500" : "bg-danger/20 text-danger")}>
          {success ? t("run_success") : t("run_failed")} · {t("exit_code")} {result.exit_code}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
            onClick={onClose}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        <div className="mb-2">
          <code className="font-mono text-xs text-accent">$ {result.command}</code>
        </div>
        {result.stdout && (
          <div className="mb-2">
            <div className="mb-1 text-xs font-medium text-muted">{t("stdout")}</div>
            <pre className="whitespace-pre-wrap break-all rounded-md bg-default-soft p-2 font-mono text-xs">{result.stdout}</pre>
          </div>
        )}
        {result.stderr && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">{t("stderr")}</div>
            <pre className="whitespace-pre-wrap break-all rounded-md bg-danger/10 p-2 font-mono text-xs text-danger">{result.stderr}</pre>
          </div>
        )}
        {!result.stdout && !result.stderr && (
          <div className="text-xs text-muted">{t("logs_empty")}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function LogsView({
  connectionId,
  onClose,
}: {
  connectionId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("cron");
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(DEFAULT_LOG_LINES);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const out = await cronService.getLogs(connectionId, lines);
      setLogs(out);
    } catch {
      setLogs(t("logs_empty"));
    } finally {
      setLoading(false);
    }
  }, [connectionId, lines, t]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return createPortal(
    <div className="fixed top-10 left-0 right-0 bottom-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <ScrollText size={16} className="text-accent" />
        <span className="text-sm font-semibold">{t("logs_title")}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">{t("logs_lines")}</span>
          <input
            type="number"
            className="w-16 rounded-md border border-border bg-default-soft px-2 py-1 text-xs"
            value={lines}
            min={10}
            max={5000}
            onChange={(e) => setLines(Number(e.target.value) || DEFAULT_LOG_LINES)}
          />
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
            onClick={() => void fetchLogs()}
          >
            <RefreshCw size={13} />
            {t("refresh")}
          </button>
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
            onClick={onClose}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 py-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{logs}</pre>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RawEditView({
  initialContent,
  onSave,
  onClose,
}: {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation("cron");
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(content);
    } catch (e) {
      void dialogAlert(t("error_save"), errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed top-10 left-0 right-0 bottom-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <FileText size={16} className="text-accent" />
        <span className="text-sm font-semibold">{t("raw_edit")}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {t("save")}
          </button>
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
            onClick={onClose}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <textarea
        className="min-h-0 flex-1 resize-none bg-default-soft p-4 font-mono text-xs outline-none"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>,
    document.body,
  );
}

function SystemFilesView({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation("cron");
  const [files, setFiles] = useState<CronFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await cronService.listSystemFiles(connectionId);
      setFiles(list);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const openFile = async (name: string) => {
    setSelected(name);
    setEditing(false);
    setContentLoading(true);
    try {
      const c = await cronService.getSystemFile(connectionId, name);
      setContent(c);
    } catch (e) {
      void dialogAlert(t("error_load"), errMsg(e));
      setSelected(null);
    } finally {
      setContentLoading(false);
    }
  };

  const startNew = () => {
    setEditing(true);
    setEditName("");
    setEditContent("");
    setSelected(null);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditing(true);
    setEditName(selected);
    setEditContent(content);
  };

  const handleSaveFile = async () => {
    if (!editName.trim()) {
      void dialogAlert(t("error_save"), t("system_file_name") + " is required");
      return;
    }
    setSaving(true);
    try {
      await cronService.writeSystemFile(connectionId, editName.trim(), toBase64(editContent));
      setEditing(false);
      await fetchFiles();
      await openFile(editName.trim());
    } catch (e) {
      void dialogAlert(t("error_save"), errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFile = async (name: string) => {
    const ok = await dialogConfirm(
      t("confirm_delete"),
      t("confirm_delete_file_msg", { name }),
      true,
    );
    if (!ok) return;
    try {
      await cronService.removeSystemFile(connectionId, name);
      if (selected === name) setSelected(null);
      await fetchFiles();
    } catch (e) {
      void dialogAlert(t("error_delete"), errMsg(e));
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <span className="text-xs font-medium text-muted">{t("system_files")}</span>
          <button
            className="ml-auto rounded p-1 text-muted hover:bg-default-soft hover:text-foreground"
            onClick={() => void fetchFiles()}
          >
            <RefreshCw size={12} />
          </button>
          <button
            className="rounded p-1 text-accent hover:bg-default-soft"
            onClick={startNew}
            title={t("system_new_file")}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-muted">
              <AlertCircle size={16} className="text-danger" />
              <span className="text-xs">{error}</span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted">
              {t("system_no_files")}
            </div>
          ) : (
            files.map((f) => (
              <div
                key={f.name}
                className={cn(
                  "group flex items-center gap-1.5 px-2 py-1.5 hover:bg-default-soft/50",
                  selected === f.name && "bg-accent/10",
                )}
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void openFile(f.name)}
                >
                  <div className="truncate font-mono text-xs">{f.name}</div>
                  <div className="text-xs text-muted">
                    {f.owner} · {f.modified}
                  </div>
                </button>
                <button
                  className="rounded p-0.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                  onClick={() => void handleDeleteFile(f.name)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {editing ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <Pencil size={13} className="text-accent" />
              <span className="text-xs font-semibold">
                {editName ? t("system_edit_file") : t("system_new_file")}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
                  onClick={() => void handleSaveFile()}
                  disabled={saving}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {t("save")}
                </button>
                <button
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
                  onClick={() => setEditing(false)}
                >
                  <X size={12} />
                  {t("cancel")}
                </button>
              </div>
            </div>
            <div className="px-3 py-2">
              <label className="mb-1 block text-xs text-muted">{t("system_file_name")}</label>
              <input
                className="w-full rounded-md border border-border bg-default-soft px-2 py-1 font-mono text-xs"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="my-task"
                disabled={!!selected && editName === selected}
              />
            </div>
            <textarea
              className="min-h-0 flex-1 resize-none bg-default-soft p-3 font-mono text-xs outline-none"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
              placeholder="# m h dom mon dow command"
            />
          </>
        ) : selected ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <FileText size={13} className="text-accent" />
              <span className="font-mono text-xs">{selected}</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-default-soft"
                  onClick={startEdit}
                >
                  <Pencil size={12} />
                  {t("system_edit_file")}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {contentLoading ? (
                <div className="flex h-full items-center justify-center text-muted">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-all p-3 font-mono text-xs">{content}</pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
            <Server size={32} className="opacity-40" />
            <span className="text-xs">{t("system_no_files")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
