import { useState, useEffect, useRef } from "react";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { listen } from "@tauri-apps/api/event";
import { Loader2, CheckCircle2, XCircle, Circle } from "lucide-react";
import { CONNECTION_LOG_EVENT } from "../types/events";
import type { ConnectionLogPayload } from "../types/events";
import { connectionService } from "../services/connectionService";

interface LogEntry {
  step: string;
  message: string;
  status: string;
  timestamp: number;
}

interface ConnectingModalProps {
  hostId: string;
  hostName: string;
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => Promise<void>;
}

const STEP_LABELS: Record<string, string> = {
  resolve: "解析主机",
  tcp: "建立连接",
  auth: "身份认证",
  ready: "连接就绪",
};

const STEP_ORDER = ["resolve", "tcp", "auth", "ready"];

export function ConnectingModal({ hostId, hostName, isOpen, onClose, onConnect }: ConnectingModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [finished, setFinished] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelledRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const state = useOverlayState({ isOpen, onOpenChange: (open) => !open && onClose() });

  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  const startedRef = useRef(false);
  /** 本轮打开是否已经发起过连接：防止严格模式下把同一台主机连两次。 */
  const connectStartedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setLogs([]);
      setFinished(false);
      setHasError(false);
      setCancelled(false);
      setCancelling(false);
      cancelledRef.current = false;
      startedRef.current = false;
      connectStartedRef.current = false;
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      const unlisten = await listen<ConnectionLogPayload>(CONNECTION_LOG_EVENT, (event) => {
        if (event.payload.host_id !== hostId) return;
        const entry: LogEntry = {
          step: event.payload.step,
          message: event.payload.message,
          status: event.payload.status,
          timestamp: Date.now(),
        };
        setLogs((prev) => [...prev, entry]);
        if (entry.status === "cancelled") {
          cancelledRef.current = true;
          setCancelled(true);
          setHasError(false);
          setFinished(true);
        }
        if (entry.status === "error") {
          setHasError(true);
          setFinished(true);
        }
        if (entry.step === "ready" && entry.status === "success") {
          setFinished(true);
        }
      });
      // listen 是异步的，resolve 之前 effect 可能已被清理（卸载、关闭，
      // 或 React 严格模式下的“挂载 → 清理 → 再挂载”）。
      // 这里只放弃这次监听（不留游离监听），连接改由重新执行的那轮 effect 发起；
      // 千万不要连 onConnect 一起跳过，否则界面会永远停在「正在连接」。
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenFn = unlisten;
      if (connectStartedRef.current) return;
      connectStartedRef.current = true;
      onConnectRef.current().catch(() => {
        if (!cancelledRef.current) setHasError(true);
        setFinished(true);
      });
    };
    setup();

    return () => {
      cancelled = true;
      unlistenFn?.();
      // 复位，让下一轮 effect（严格模式的第二次执行）能重新搭监听
      startedRef.current = false;
    };
  }, [isOpen, hostId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (finished && !hasError && !cancelled) {
      const timer = setTimeout(onClose, 600);
      return () => clearTimeout(timer);
    }
  }, [finished, hasError, cancelled, onClose]);

  const handleCancel = async () => {
    if (cancelling || finished) return;
    setCancelling(true);
    try {
      await connectionService.cancelConnect(hostId);
    } catch {
      // 后端可能已自行结束，忽略
    }
  };

  const stepStatus = (step: string): "pending" | "active" | "success" | "error" => {
    const stepLogs = logs.filter((l) => l.step === step);
    if (stepLogs.some((l) => l.status === "error")) return "error";
    if (stepLogs.some((l) => l.status === "success")) return "success";
    if (hasError || cancelled) return "error";
    if (stepLogs.length > 0) return "active";
    return "pending";
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>
                {hasError
                  ? "连接失败"
                  : cancelled
                    ? "连接已取消"
                    : finished
                      ? "连接成功"
                      : `正在连接 ${hostName}`}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="mb-4 space-y-2">
                {STEP_ORDER.map((step) => {
                  const status = stepStatus(step);
                  const label = STEP_LABELS[step] || step;
                  return (
                    <div key={step} className="flex items-center gap-2 text-sm">
                      {status === "success" && (
                        <CheckCircle2 size={16} className="text-success" />
                      )}
                      {status === "error" && (
                        <XCircle size={16} className="text-danger" />
                      )}
                      {status === "active" && (
                        <Loader2 size={16} className="animate-spin text-accent" />
                      )}
                      {status === "pending" && (
                        <Circle size={16} className="text-muted" />
                      )}
                      <span
                        className={
                          status === "pending" ? "text-muted" : "text-foreground"
                        }
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-md bg-[#1e1e2e] p-3 font-mono text-xs leading-relaxed text-[#cdd6f4] max-h-48 overflow-y-auto">
                {logs.length === 0 && <div className="text-muted">等待日志...</div>}
                {logs.map((log, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    <span className="text-muted">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>{" "}
                    {log.message}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </Modal.Body>
            <Modal.Footer>
              {!finished && (
                <Button
                  variant="ghost"
                  onPress={handleCancel}
                  isDisabled={cancelling}
                >
                  {cancelling ? "取消中…" : "取消"}
                </Button>
              )}
              {finished && (
                <Button
                  variant={hasError || cancelled ? "danger" : "ghost"}
                  onPress={onClose}
                >
                  {hasError || cancelled ? "关闭" : "完成"}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
