import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { sftpService } from "../../services/sftpService";
import { dialogAlert } from "../../lib/dialog";
import type { FileEntry } from "../../types/sftp";

interface PermissionsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  entry: FileEntry | null;
  onApplied?: () => void;
}

const BITS = {
  owner: { read: 0o400, write: 0o200, execute: 0o100 },
  group: { read: 0o040, write: 0o020, execute: 0o010 },
  other: { read: 0o004, write: 0o002, execute: 0o001 },
} as const;

type Subject = "owner" | "group" | "other";
type Action = "read" | "write" | "execute";

const SUBJECT_LABELS: Record<Subject, string> = {
  owner: "perm_owner",
  group: "perm_group",
  other: "perm_other",
};

const ACTION_LABELS: Record<Action, string> = {
  read: "perm_read",
  write: "perm_write",
  execute: "perm_execute",
};

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * 把权限位渲染成 `-rwxr-xr-x` 形式的符号串。
 *
 * 之前这里用的是 `(mode >> 2) & 7` 之类的混合取位，会把“其他”的位当成“读取”显示，结果没有意义。
 */
function symbolicMode(mode: number, isDir: boolean): string {
  const triple = (shift: number): string => {
    const bits = (mode >> shift) & 0b111;
    return `${bits & 0b100 ? "r" : "-"}${bits & 0b010 ? "w" : "-"}${bits & 0b001 ? "x" : "-"}`;
  };
  return `${isDir ? "d" : "-"}${triple(6)}${triple(3)}${triple(0)}`;
}

export function PermissionsModal({
  isOpen,
  onOpenChange,
  connectionId,
  entry,
  onApplied,
}: PermissionsModalProps) {
  const [mode, setMode] = useState(0o755);
  const [octalInput, setOctalInput] = useState("755");
  const [applying, setApplying] = useState(false);
  const state = useOverlayState({ isOpen, onOpenChange });
  const { t } = useTranslation("sftp");
  const { t: tc } = useTranslation("common");

  useEffect(() => {
    if (isOpen && entry) {
      const perm = entry.permissions ?? 0o755;
      const m = perm & 0o777;
      setMode(m);
      setOctalInput(m.toString(8).padStart(3, "0"));
    }
  }, [isOpen, entry]);

  const toggleBit = useCallback(
    (subject: Subject, action: Action) => {
      setMode((prev) => {
        const bit = BITS[subject][action];
        const next = prev & bit ? prev & ~bit : prev | bit;
        setOctalInput(next.toString(8).padStart(3, "0"));
        return next;
      });
    },
    [],
  );

  const handleOctalChange = useCallback((value: string) => {
    setOctalInput(value);
    const parsed = parseInt(value, 8);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 0o777) {
      setMode(parsed);
    }
  }, []);

  const handleApply = useCallback(async () => {
    if (!entry) return;
    setApplying(true);
    try {
      const octal = mode.toString(8).padStart(3, "0");
      const cmd = `chmod ${octal} ${shellQuote(entry.path)}`;
      const result = await sftpService.exec(connectionId, cmd);
      if (result.exit_code !== 0) {
        await dialogAlert(t("perm_failed"), result.stderr || result.stdout);
        return;
      }
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      await dialogAlert(t("perm_failed"), String(e));
    } finally {
      setApplying(false);
    }
  }, [entry, mode, connectionId, onApplied, onOpenChange]);

  if (!entry) return null;

  const subjects: Subject[] = ["owner", "group", "other"];
  const actions: Action[] = ["read", "write", "execute"];

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t("perm_title")}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4 py-2">
                <div className="text-sm text-muted">
                  <span className="text-foreground">{entry.name}</span>
                  {entry.is_dir && (
                    <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                      {t("perm_folder")}
                    </span>
                  )}
                </div>

                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-default-soft">
                        <th className="px-3 py-1.5 text-left font-medium">{t("perm_col")}</th>
                        {actions.map((a) => (
                          <th
                            key={a}
                            className="px-3 py-1.5 text-center font-medium"
                          >
                            {t(ACTION_LABELS[a])}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map((s) => (
                        <tr
                          key={s}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-3 py-2 font-medium">
                            {t(SUBJECT_LABELS[s])}
                          </td>
                          {actions.map((a) => {
                            const bit = BITS[s][a];
                            const checked = (mode & bit) !== 0;
                            return (
                              <td
                                key={a}
                                className="px-3 py-2 text-center"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleBit(s, a)}
                                  className="h-4 w-4 cursor-pointer accent-[#e89a4b]"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted">{t("perm_octal")}</label>
                  <input
                    type="text"
                    value={octalInput}
                    onChange={(e) => handleOctalChange(e.target.value)}
                    maxLength={3}
                    className="w-20 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent"
                  />
                  <span className="text-xs text-muted">
                    {t("perm_result")}
                    <span className="ml-1 font-mono text-foreground">
                      {symbolicMode(mode, entry.is_dir)}
                    </span>
                  </span>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="ghost"
                onPress={() => onOpenChange(false)}
              >
                {tc("cancel")}
              </Button>
              <Button
                variant="primary"
                isDisabled={applying}
                onPress={() => void handleApply()}
              >
                {applying ? t("perm_applying") : t("perm_apply")}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
