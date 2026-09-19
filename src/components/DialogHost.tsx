import { useState, useEffect, useRef } from "react";
import {
  Modal,
  Button,
  Input,
  Label,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { useDialogStore } from "../stores/dialogStore";

export function DialogHost() {
  const current = useDialogStore((s) => s.current);
  const close = useDialogStore((s) => s.close);
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current?.type === "prompt") {
      setPromptValue(current.defaultValue ?? "");
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [current]);

  const isOpen = !!current;
  const state = useOverlayState({
    isOpen,
    onOpenChange: (open: boolean) => {
      if (!open && current) {
        close(current.type === "prompt" ? null : false);
      }
    },
  });

  if (!current) return null;

  const isPrompt = current.type === "prompt";
  const isAlert = current.type === "alert";

  const handleConfirm = () => {
    if (isPrompt) close(promptValue);
    else close(true);
  };

  const handleCancel = () => {
    close(isPrompt ? null : false);
  };

  const confirmLabel = isAlert ? "确定" : "确认";
  const confirmVariant = current.danger ? "danger" : "primary";

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{current.title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {current.message && (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {current.message}
                </p>
              )}
              {isPrompt && (
                <TextField
                  value={promptValue}
                  onChange={(v) => setPromptValue(v)}
                >
                  <Label>输入</Label>
                  <Input ref={inputRef} />
                </TextField>
              )}
            </Modal.Body>
            <Modal.Footer>
              {!isAlert && (
                <Button variant="ghost" onPress={handleCancel}>
                  取消
                </Button>
              )}
              <Button variant={confirmVariant} onPress={handleConfirm}>
                {confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
