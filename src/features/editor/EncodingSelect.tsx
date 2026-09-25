import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

interface EncodingOption {
  value: string;
  label: string;
}

interface EncodingSelectProps {
  value: string;
  options: EncodingOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function EncodingSelect({
  value,
  options,
  onChange,
  disabled,
}: EncodingSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = options.find((o) => o.value === value) ?? options[0];

  const toggle = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="flex h-[22px] flex-shrink-0 items-center gap-1 rounded border border-border bg-default-soft px-1.5 text-[10px] text-muted outline-none transition-colors hover:text-foreground focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        title="编码"
      >
        <span className="max-w-[88px] truncate">{current?.label ?? value}</span>
        <ChevronDown
          size={11}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              minWidth: rect.width,
            }}
            className="z-[1000] overflow-hidden rounded-md border border-border bg-background/95 py-1 shadow-xl backdrop-blur-md"
          >
            <div className="max-h-60 overflow-y-auto">
              {options.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value + opt.label}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
                      selected
                        ? "bg-accent-soft/40 text-accent"
                        : "text-foreground hover:bg-default-soft",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {selected && <Check size={12} className="flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
