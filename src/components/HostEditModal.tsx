import { useState, useEffect } from "react";
import {
  Modal,
  Button,
  Input,
  Label,
  TextField,
  TextArea,
  Select,
  ListBox,
  ListBoxItem,
  useOverlayState,
} from "@heroui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useHostsStore } from "../stores/hostsStore";
import type { Host } from "../types/host";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

interface HostEditModalProps {
  host: Host;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HostEditModal({ host, isOpen, onOpenChange }: HostEditModalProps) {
  const { add, update, hosts } = useHostsStore();
  const { t } = useTranslation("connection");
  const { t: tc } = useTranslation("common");
  const [form, setForm] = useState<Host>(host);
  const [portStr, setPortStr] = useState(String(host.port));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const state = useOverlayState({ isOpen, onOpenChange });

  useEffect(() => {
    setForm(host);
    setPortStr(String(host.port));
    setErrorMsg(null);
  }, [host]);

  const isNew = !hosts.some((h) => h.id === host.id);

  const handleSave = async () => {
    if (form.auth.type === "private_key" && !form.auth.key_content.trim()) {
      setErrorMsg(t("key_empty"));
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const port = Number(portStr);
      const finalForm = { ...form, port: port > 0 && port < 65536 ? port : 22 };
      if (isNew) {
        await add(finalForm);
      } else {
        await update(finalForm);
      }
      onOpenChange(false);
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  const setAuthType = (type: "password" | "private_key") => {
    if (type === "password") {
      setForm({ ...form, auth: { type: "password", password: "" } });
    } else {
      setForm({
        ...form,
        auth: { type: "private_key", key_content: "", passphrase: null },
      });
    }
  };

  const handleReadKey = async () => {
    const filePath = await open({
      multiple: false,
      filters: [{ name: t("key_file_filter"), extensions: ["pem", "key", "id_rsa", "id_ed25519", ""] }],
    });
    if (typeof filePath !== "string") return;
    try {
      const content = await readTextFile(filePath);
      if (!content.trim()) {
        setErrorMsg(t("file_empty"));
        return;
      }
      setForm((prev) => ({
        ...prev,
        auth: {
          type: "private_key",
          key_content: content,
          passphrase: prev.auth.type === "private_key" ? prev.auth.passphrase : null,
        },
      }));
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(t("read_key_failed", { error: String(e) }));
    }
  };

  const auth = form.auth;

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{isNew ? t("new_server") : t("edit_server")}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              >
                <Label>{t("name")}</Label>
                <Input />
              </TextField>

              <div className="flex gap-2">
                <TextField
                  className="flex-1"
                  value={form.host}
                  onChange={(v) => setForm({ ...form, host: v })}
                >
                  <Label>{t("host")}</Label>
                  <Input />
                </TextField>
                <TextField
                  className="w-32"
                  value={portStr}
                  onChange={(v) => {
                    setPortStr(v);
                    const n = Number(v);
                    if (v !== "" && !isNaN(n)) {
                      setForm({ ...form, port: n });
                    }
                  }}
                >
                  <Label>{t("port")}</Label>
                  <Input type="number" />
                </TextField>
              </div>

              <TextField
                value={form.username}
                onChange={(v) => setForm({ ...form, username: v })}
              >
                <Label>{t("username")}</Label>
                <Input />
              </TextField>

              <Select
                selectedKey={auth.type}
                onSelectionChange={(key) => {
                  setAuthType(key as "password" | "private_key");
                }}
              >
                <Label>{t("auth_method")}</Label>
                <Select.Trigger>
                  {auth.type === "password" ? t("password") : t("private_key")}
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBoxItem id="password">{t("password")}</ListBoxItem>
                    <ListBoxItem id="private_key">{t("private_key")}</ListBoxItem>
                  </ListBox>
                </Select.Popover>
              </Select>

              {auth.type === "password" && (
                <TextField
                  value={auth.password}
                  onChange={(v) =>
                    setForm({ ...form, auth: { type: "password", password: v } })
                  }
                >
                  <Label>{t("password")}</Label>
                  <Input type="password" />
                </TextField>
              )}

              {auth.type === "private_key" && (
                <>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>{t("key_content")}</Label>
                      <TextArea
                        className="mt-1 w-full font-mono text-xs"
                        rows={8}
                        value={auth.key_content}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            auth: {
                              type: "private_key",
                              key_content: e.target.value,
                              passphrase: auth.passphrase,
                            },
                          })
                        }
                        placeholder={t("key_content_placeholder")}
                      />
                    </div>
                    <Button variant="secondary" onPress={handleReadKey} className="flex-shrink-0">
                      <FolderOpen size={14} className="mr-1" />
                      {t("read")}
                    </Button>
                  </div>
                  <TextField
                    value={auth.passphrase ?? ""}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        auth: {
                          type: "private_key",
                          key_content: auth.key_content,
                          passphrase: v || null,
                        },
                      })
                    }
                  >
                    <Label>{t("passphrase")}</Label>
                    <Input type="password" />
                  </TextField>
                </>
              )}

              {errorMsg && (
                <div className="rounded-md bg-danger-soft p-2 text-sm text-danger">
                  {errorMsg}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button variant="primary" isDisabled={saving} onPress={handleSave}>
                {tc("save")}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
