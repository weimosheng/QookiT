import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { ShieldAlert } from "lucide-react";
import { useHostKeyStore } from "../stores/hostKeyStore";
import {
  HOST_KEY_VERIFY_EVENT,
  HOST_KEY_VERIFY_DONE_EVENT,
  type HostKeyVerifyPayload,
  type HostKeyVerifyDonePayload,
} from "../types/events";

/**
 * 首次连接（TOFU）主机密钥确认对话框。
 *
 * 只有在用户核对指纹并明确「信任」后，后端才会记录密钥并继续连接；
 * 关闭对话框（Esc / 点击遮罩）视为拒绝，避免静默信任被中间人利用。
 */
export function HostKeyVerifyDialog() {
  const { t } = useTranslation("connection");
  const current = useHostKeyStore((s) => s.queue[0] ?? null);
  const push = useHostKeyStore((s) => s.push);
  const dismiss = useHostKeyStore((s) => s.dismiss);
  const respond = useHostKeyStore((s) => s.respond);

  useEffect(() => {
    const unlisten: Array<() => void> = [];
    let disposed = false;
    const register = (fn: () => void) => {
      if (disposed) fn();
      else unlisten.push(fn);
    };
    void listen<HostKeyVerifyPayload>(HOST_KEY_VERIFY_EVENT, (e) =>
      push(e.payload),
    ).then(register);
    void listen<HostKeyVerifyDonePayload>(HOST_KEY_VERIFY_DONE_EVENT, (e) =>
      dismiss(e.payload.request_id),
    ).then(register);
    return () => {
      disposed = true;
      unlisten.forEach((fn) => fn());
    };
  }, [push, dismiss]);

  const state = useOverlayState({
    isOpen: !!current,
    onOpenChange: (open: boolean) => {
      if (!open && current) respond(current.request_id, false);
    },
  });

  if (!current) return null;

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t("host_key_verify_title")}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warning" />
                  <p className="text-foreground">
                    {t("host_key_verify_msg", {
                      host: current.host,
                      port: current.port,
                    })}
                  </p>
                </div>
                <div className="rounded-md bg-default-soft p-3 font-mono text-xs break-all text-foreground">
                  <div>{current.algorithm}</div>
                  <div className="mt-1">{current.fingerprint}</div>
                </div>
                <p className="text-xs text-muted">{t("host_key_verify_hint")}</p>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="ghost"
                onPress={() => respond(current.request_id, false)}
              >
                {t("host_key_reject")}
              </Button>
              <Button onPress={() => respond(current.request_id, true)}>
                {t("host_key_accept")}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
