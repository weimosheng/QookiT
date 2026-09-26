import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { FILE_TRANSFER_PROGRESS_EVENT } from "../../types/events";
import type { FileTransferProgressPayload } from "../../types/events";
import { useTransferStore } from "../../stores/transferStore";
import {
  Download,
  Upload,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Trash2,
  ListTree,
} from "lucide-react";

interface TransferQueuePanelProps {
  connectionId: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TransferQueuePanel({ connectionId }: TransferQueuePanelProps) {
  const allTasks = useTransferStore((s) => s.tasks);
  const updateTask = useTransferStore((s) => s.updateTask);
  const removeTask = useTransferStore((s) => s.removeTask);
  const clearDone = useTransferStore((s) => s.clearDone);
  const tasks = allTasks.filter((t) => t.connectionId === connectionId);
  const hasDone = tasks.some((t) => t.status === "done");

  useEffect(() => {
    const unlisten = listen<FileTransferProgressPayload>(
      FILE_TRANSFER_PROGRESS_EVENT,
      (event) => {
        const p = event.payload;
        updateTask(p.transfer_id, {
          transferred: p.transferred,
          total: p.total,
          status: p.status,
          error: p.error,
        });
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, [updateTask]);

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
        <ListTree size={28} className="opacity-40" />
        <span>暂无传输任务</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted">
        <span>{tasks.length} 个任务</span>
        {hasDone && (
          <button
            type="button"
            onClick={clearDone}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-default-soft hover:text-foreground"
          >
            <Trash2 size={12} />
            <span>清除已完成</span>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {tasks.map((task) => {
          const pct =
            task.total > 0
              ? Math.min(100, (task.transferred / task.total) * 100)
              : 0;
          return (
            <div key={task.id} className="border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                {task.direction === "download" ? (
                  <Download size={14} className="flex-shrink-0 text-accent" />
                ) : (
                  <Upload size={14} className="flex-shrink-0 text-accent" />
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {task.filename}
                </span>
                {task.status === "active" && (
                  <Loader2
                    size={13}
                    className="flex-shrink-0 animate-spin text-accent"
                  />
                )}
                {task.status === "done" && (
                  <Check size={14} className="flex-shrink-0 text-accent" />
                )}
                {task.status === "error" && (
                  <AlertTriangle
                    size={14}
                    className="flex-shrink-0 text-danger"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  className="flex-shrink-0 rounded p-0.5 text-muted opacity-50 transition-opacity hover:bg-danger-soft hover:text-danger hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-default-soft">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      task.status === "error" ? "bg-danger" : "bg-accent"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-28 flex-shrink-0 text-right text-xs text-muted">
                  {task.status === "error"
                    ? (task.error ?? "失败").slice(0, 20)
                    : task.total > 0
                      ? `${formatBytes(task.transferred)} / ${formatBytes(task.total)}`
                      : "等待中"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
