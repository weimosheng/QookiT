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

interface HostEditModalProps {
  host: Host;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HostEditModal({ host, isOpen, onOpenChange }: HostEditModalProps) {
  const { add, update, hosts } = useHostsStore();
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
      setErrorMsg('私钥内容不能为空，请粘贴私钥内容或点击"读取"按钮选择文件');
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
      filters: [{ name: "私钥文件", extensions: ["pem", "key", "id_rsa", "id_ed25519", ""] }],
    });
    if (typeof filePath !== "string") return;
    try {
      const content = await readTextFile(filePath);
      if (!content.trim()) {
        setErrorMsg("所选文件内容为空");
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
      setErrorMsg(`读取私钥失败: ${e}`);
    }
  };

  const auth = form.auth;

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{isNew ? "新建服务器" : "编辑服务器"}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              >
                <Label>名称</Label>
                <Input />
              </TextField>

              <div className="flex gap-2">
                <TextField
                  className="flex-1"
                  value={form.host}
                  onChange={(v) => setForm({ ...form, host: v })}
                >
                  <Label>主机</Label>
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
                  <Label>端口</Label>
                  <Input type="number" />
                </TextField>
              </div>

              <TextField
                value={form.username}
                onChange={(v) => setForm({ ...form, username: v })}
              >
                <Label>用户名</Label>
                <Input />
              </TextField>

              <Select
                selectedKey={auth.type}
                onSelectionChange={(key) => {
                  setAuthType(key as "password" | "private_key");
                }}
              >
                <Label>认证方式</Label>
                <Select.Trigger>
                  {auth.type === "password" ? "密码" : "私钥文件"}
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBoxItem id="password">密码</ListBoxItem>
                    <ListBoxItem id="private_key">私钥文件</ListBoxItem>
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
                  <Label>密码</Label>
                  <Input type="password" />
                </TextField>
              )}

              {auth.type === "private_key" && (
                <>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>私钥内容</Label>
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
                        placeholder="粘贴私钥内容或点击右侧读取文件"
                      />
                    </div>
                    <Button variant="secondary" onPress={handleReadKey} className="flex-shrink-0">
                      <FolderOpen size={14} className="mr-1" />
                      读取
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
                    <Label>密钥口令（可选）</Label>
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
                取消
              </Button>
              <Button variant="primary" isDisabled={saving} onPress={handleSave}>
                保存
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
