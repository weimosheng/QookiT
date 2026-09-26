import { useState, useEffect, useCallback } from "react";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { sftpService } from "../../services/sftpService";
import { dialogAlert } from "../../lib/dialog";
import type { FileEntry } from "../../types/sftp";

interface ArchiveModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  entry: FileEntry | null;
  onApplied?: () => void;
}

type Format = "zip" | "tar.gz" | "tar.bz2" | "tar.xz" | "7z";

const FORMATS: { id: Format; label: string; ext: string }[] = [
  { id: "zip", label: "ZIP", ext: ".zip" },
  { id: "tar.gz", label: "TAR.GZ", ext: ".tar.gz" },
  { id: "tar.bz2", label: "TAR.BZ2", ext: ".tar.bz2" },
  { id: "tar.xz", label: "TAR.XZ", ext: ".tar.xz" },
  { id: "7z", label: "7Z", ext: ".7z" },
];

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function getCompressCommand(
  sourcePath: string,
  outputPath: string,
  format: Format,
): string {
  const src = shellQuote(sourcePath);
  const out = shellQuote(outputPath);
  switch (format) {
    case "zip":
      return `zip -r ${out} ${src}`;
    case "tar.gz":
      return `tar czf ${out} ${src}`;
    case "tar.bz2":
      return `tar cjf ${out} ${src}`;
    case "tar.xz":
      return `tar cJf ${out} ${src}`;
    case "7z":
      return `7z a ${out} ${src}`;
  }
}

export function ArchiveModal({
  isOpen,
  onOpenChange,
  connectionId,
  entry,
  onApplied,
}: ArchiveModalProps) {
  const [format, setFormat] = useState<Format>("tar.gz");
  const [outputName, setOutputName] = useState("");
  const [applying, setApplying] = useState(false);
  const state = useOverlayState({ isOpen, onOpenChange });

  useEffect(() => {
    if (isOpen && entry) {
      setFormat("tar.gz");
      setOutputName(`${entry.name}.tar.gz`);
    }
  }, [isOpen, entry]);

  const handleFormatChange = useCallback(
    (fmt: Format) => {
      setFormat(fmt);
      if (entry) {
        setOutputName(`${entry.name}.${fmt}`);
      }
    },
    [entry],
  );

  const handleApply = useCallback(async () => {
    if (!entry) return;
    setApplying(true);
    try {
      const dir = entry.is_dir
        ? entry.path
        : entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
      const outputPath =
        dir === "/" ? `/${outputName}` : `${dir}/${outputName}`;
      const cmd = getCompressCommand(entry.path, outputPath, format);
      const result = await sftpService.exec(connectionId, cmd);
      if (result.exit_code !== 0) {
        await dialogAlert("压缩失败", result.stderr || result.stdout);
        return;
      }
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      await dialogAlert("压缩失败", String(e));
    } finally {
      setApplying(false);
    }
  }, [entry, outputName, format, connectionId, onApplied, onOpenChange]);

  if (!entry) return null;

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>压缩</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4 py-2">
                <div className="text-sm text-muted">
                  <span className="text-foreground">{entry.name}</span>
                  {entry.is_dir && (
                    <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                      文件夹
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">格式</label>
                  <div className="flex flex-wrap gap-2">
                    {FORMATS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleFormatChange(f.id)}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          format === f.id
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-border text-foreground hover:bg-default-soft"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">输出文件名</label>
                  <input
                    type="text"
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => onOpenChange(false)}>
                取消
              </Button>
              <Button
                variant="primary"
                isDisabled={applying || !outputName.trim()}
                onPress={() => void handleApply()}
              >
                {applying ? "压缩中..." : "压缩"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
