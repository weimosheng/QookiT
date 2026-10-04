import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { useCloseDialogStore } from "../stores/closeDialogStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { CloseAction } from "../stores/settingsStore";

export function CloseConfirmDialog() {
  const { t } = useTranslation("closeDialog");
  const resolve = useCloseDialogStore((s) => s.resolve);
  const close = useCloseDialogStore((s) => s.close);
  const [remember, setRemember] = useState(false);

  const isOpen = !!resolve;
  const state = useOverlayState({
    isOpen,
    onOpenChange: (open: boolean) => {
      if (!open && resolve) close(null);
    },
  });

  if (!resolve) return null;

  const handleAction = (action: CloseAction) => {
    if (remember) {
      useSettingsStore.getState().update({ closeAction: action });
    }
    close(action);
    setRemember(false);
  };

  const handleCancel = () => {
    close(null);
    setRemember(false);
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-foreground">{t("message")}</p>
              <label className="flex cursor-pointer items-center gap-2 pt-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 accent-[#e89a4b]"
                />
                {t("remember")}
              </label>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={handleCancel}>
                {t("cancel")}
              </Button>
              <Button
                variant="ghost"
                onPress={() => handleAction("minimizeToTray")}
              >
                {t("minimize")}
              </Button>
              <Button variant="primary" onPress={() => handleAction("close")}>
                {t("close")}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
