import { useState, useEffect, useRef } from "react";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { listen } from "@tauri-apps/api/event";
import { Loader2, CheckCircle2, XCircle, Circle } from "lucide-react";
import { CONNECTION_LOG_EVENT } from "../types/events";
import type { ConnectionLogPayload } from "../types/events";

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
  const logEndRef = useRef<HTMLDivElement>(null);

  const state = useOverlayState({ isOpen, onOpenChange: (open) => !open && onClose() });

  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setLogs([]);
      setFinished(false);
      setHasError(false);
      startedRef.current = false;
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    let unlistenFn: (() => void) | null = null;

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
        if (entry.status === "error") {
          setHasError(true);
          setFinished(true);
        }
        if (entry.step === "ready" && entry.status === "success") {
          setFinished(true);
        }
      });
      unlistenFn = unlisten;
      onConnectRef.current().catch(() => {
        setHasError(true);
        setFinished(true);
      });
    };
    setup();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [isOpen, hostId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (finished && !hasError) {
      const timer = setTimeout(onClose, 600);
      return () => clearTimeout(timer);
    }
  }, [finished, hasError, onClose]);

  const stepStatus = (step: string): "pending" | "active" | "success" | "error" => {
    const stepLogs = logs.filter((l) => l.step === step);
    if (stepLogs.some((l) => l.status === "error")) return "error";
    if (stepLogs.some((l) => l.status === "success")) return "success";
    if (hasError) return "error";
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
                {hasError ? "连接失败" : finished ? "连接成功" : `正在连接 ${hostName}`}
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
              <Button
                variant={hasError ? "danger" : "ghost"}
                onPress={onClose}
                isDisabled={!finished}
              >
                {hasError ? "关闭" : "完成"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
