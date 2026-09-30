import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { keyEventToCombo, formatCombo } from "../lib/keycombo";

interface ShortcutRecorderProps {
  value: string;
  onChange: (combo: string) => void;
  onClear: () => void;
}

/** 快捷键录制控件：点击进入录制，捕获下一次组合键写回；Esc 取消，× 清除。 */
export function ShortcutRecorder({ value, onChange, onClear }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const combo = keyEventToCombo(e);
      if (!combo) return;
      onChange(combo);
      setRecording(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording, onChange]);

  if (recording) {
    return (
      <button
        type="button"
        className="w-32 rounded-md border border-accent bg-accent-soft px-2 py-1 text-sm text-accent"
        onClick={() => setRecording(false)}
      >
        按下组合键…
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground transition-colors hover:bg-default-soft"
        onClick={() => setRecording(true)}
      >
        {formatCombo(value)}
      </button>
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="text-muted transition-colors hover:text-danger"
          title="清除"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
