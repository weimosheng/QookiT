import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  Fragment,
} from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { terminalService } from "../../services/terminalService";
import { TerminalView } from "./TerminalView";
import { Plus, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useTerminalActiveStore } from "../../stores/terminalActiveStore";
import {
  type LayoutNode,
  type PaneNode,
  type DropZone,
  type Rect,
  createPane,
  addTerminalToPane,
  removeTerminalFromPane,
  cleanupLayout,
  setActiveInPane,
  moveTerminalToPane,
  dropOnEdge,
  updateSplitSizes,
  computePaneRects,
  findDropTarget,
  findFirstPaneId,
  findPaneWithTerminal,
  collectActiveTerminals,
  findSplit,
  TAB_BAR_HEIGHT,
  SEPARATOR_SIZE,
} from "./terminalLayout";

interface TerminalInstance {
  id: string;
  title: string;
  paneId: string;
}

interface TerminalManagerProps {
  connectionId: string;
}

export function TerminalManager({ connectionId }: TerminalManagerProps) {
  const [terminals, setTerminals] = useState<Record<string, TerminalInstance>>({});
  const [layout, setLayout] = useState<LayoutNode | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ paneId: string; zone: DropZone } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LayoutNode | null>(null);
  layoutRef.current = layout;
  const dragRef = useRef<{ terminalId: string; sourcePaneId: string } | null>(null);
  const titleCounter = useRef(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const createTerminal = useCallback(
    async (targetPaneId?: string) => {
      const id = await terminalService.open(connectionId, 80, 24);
      titleCounter.current += 1;
      const title = `终端 ${titleCounter.current}`;
      const prev = layoutRef.current;
      if (!prev) {
        const pane = createPane(id);
        setTerminals((t) => ({ ...t, [id]: { id, title, paneId: pane.id } }));
        setLayout(pane);
        return;
      }
      const paneId = targetPaneId ?? findFirstPaneId(prev);
      const next = addTerminalToPane(prev, id, paneId);
      setTerminals((t) => ({ ...t, [id]: { id, title, paneId } }));
      setLayout(next);
    },
    [connectionId],
  );

  const creatingRef = useRef(false);
  useEffect(() => {
    if (Object.keys(terminals).length === 0 && !creatingRef.current) {
      creatingRef.current = true;
      createTerminal().finally(() => {
        creatingRef.current = false;
      });
    }
  }, [terminals, createTerminal]);

  const cleanupTerminal = useCallback((terminalId: string) => {
    setTerminals((prev) => {
      if (!prev[terminalId]) return prev;
      const next = { ...prev };
      delete next[terminalId];
      return next;
    });
    setLayout((prev) => {
      if (!prev) return prev;
      const paneId = findPaneWithTerminal(prev, terminalId);
      if (!paneId) return prev;
      const after = removeTerminalFromPane(prev, terminalId, paneId);
      const cleaned = cleanupLayout(after);
      return cleaned ?? after;
    });
  }, []);

  const closeTerminal = useCallback(
    async (terminalId: string) => {
      try {
        await terminalService.close(connectionId, terminalId);
      } catch {
        // ignore
      }
      cleanupTerminal(terminalId);
    },
    [connectionId, cleanupTerminal],
  );

  const paneRects =
    layout && containerSize.w > 0 && containerSize.h > 0
      ? computePaneRects(layout, {
          x: 0,
          y: 0,
          w: containerSize.w,
          h: containerSize.h,
        })
      : {};
  const paneRectsRef = useRef(paneRects);
  paneRectsRef.current = paneRects;

  const handleDragStart =
    (terminalId: string, sourcePaneId: string) => (e: ReactDragEvent) => {
      dragRef.current = { terminalId, sourcePaneId };
      setDraggingId(terminalId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", terminalId);
    };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDraggingId(null);
    setDropHint(null);
  };

  useLayoutEffect(() => {
    if (!draggingId) return;
    const onOver = (e: globalThis.DragEvent) => {
      if (!dragRef.current || !e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const el = containerRef.current;
      if (!el) return;
      const cr = el.getBoundingClientRect();
      const target = findDropTarget(
        paneRectsRef.current,
        e.clientX - cr.left,
        e.clientY - cr.top,
      );
      setDropHint((prev) =>
        prev?.paneId === target?.paneId && prev?.zone === target?.zone
          ? prev
          : target
            ? { paneId: target.paneId, zone: target.zone }
            : null,
      );
    };
    const onDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      setDropHint(null);
      if (!drag) return;
      const el = containerRef.current;
      if (!el) return;
      const cr = el.getBoundingClientRect();
      const target = findDropTarget(
        paneRectsRef.current,
        e.clientX - cr.left,
        e.clientY - cr.top,
      );
      if (!target) return;
      const { paneId: targetPaneId, zone } = target;
      const prev = layoutRef.current;
      if (!prev) return;
      if (zone === "center") {
        if (drag.sourcePaneId === targetPaneId) return;
        const next = moveTerminalToPane(
          prev,
          drag.terminalId,
          drag.sourcePaneId,
          targetPaneId,
        );
        setTerminals((t) => ({
          ...t,
          [drag.terminalId]: { ...t[drag.terminalId], paneId: targetPaneId },
        }));
        setLayout(next);
      } else {
        const next = dropOnEdge(
          prev,
          drag.terminalId,
          drag.sourcePaneId,
          targetPaneId,
          zone,
        );
        const newPaneId = findPaneWithTerminal(next, drag.terminalId);
        if (newPaneId) {
          setTerminals((t) => ({
            ...t,
            [drag.terminalId]: { ...t[drag.terminalId], paneId: newPaneId },
          }));
        }
        setLayout(next);
      }
    };
    document.addEventListener("dragover", onOver, true);
    document.addEventListener("drop", onDrop, true);
    return () => {
      document.removeEventListener("dragover", onOver, true);
      document.removeEventListener("drop", onDrop, true);
    };
  }, [draggingId]);

  const handleActivate = (paneId: string, terminalId: string) => {
    setLayout((prev) => (prev ? setActiveInPane(prev, paneId, terminalId) : prev));
  };

  const handleResizeSplit = (splitId: string, index: number, deltaPx: number) => {
    const prev = layoutRef.current;
    if (!prev) return;
    const split = findSplit(prev, splitId);
    if (!split) return;
    const isH = split.direction === "horizontal";
    const total = isH ? containerSize.w : containerSize.h;
    const usable = Math.max(1, total - (split.children.length - 1) * SEPARATOR_SIZE);
    const deltaPercent = (deltaPx / usable) * 100;
    const next = updateSplitSizes(prev, splitId, index, deltaPercent);
    setLayout(next);
  };

  const activeSet = new Set<string>();
  if (layout) collectActiveTerminals(layout, activeSet);
  const primaryActiveTerminal = activeSet.values().next().value ?? null;

  const setActiveTerminal = useTerminalActiveStore((s) => s.setActive);
  useEffect(() => {
    if (primaryActiveTerminal) {
      setActiveTerminal(connectionId, primaryActiveTerminal);
    }
  }, [primaryActiveTerminal, connectionId, setActiveTerminal]);

  const frameProps: LayoutFrameProps = {
    terminals,
    draggingId,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onActivate: handleActivate,
    onClose: closeTerminal,
    onCreate: createTerminal,
    onResizeSplit: handleResizeSplit,
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#1e1e2e]"
    >
      {Object.values(terminals).map((t) => {
        const rect = paneRects[t.paneId];
        const visible =
          activeSet.has(t.id) && !!rect && rect.w > 0 && rect.h > 0;
        return (
          <div
            key={t.id}
            className="absolute overflow-hidden"
            style={{
              left: rect?.x ?? 0,
              top: rect?.y ?? 0,
              width: rect?.w ?? 0,
              height: rect?.h ?? 0,
              opacity: visible ? 1 : 0,
              pointerEvents: visible && !draggingId ? "auto" : "none",
              zIndex: visible ? 1 : 0,
            }}
          >
            <TerminalView
              connectionId={connectionId}
              terminalId={t.id}
              onExit={() => cleanupTerminal(t.id)}
            />
          </div>
        );
      })}

      {layout && (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 2 }}>
          <LayoutFrame node={layout} {...frameProps} />
        </div>
      )}

      {dropHint && paneRects[dropHint.paneId] && (
        <DropHintOverlay
          rect={paneRects[dropHint.paneId]}
          zone={dropHint.zone}
        />
      )}
    </div>
  );
}

interface LayoutFrameProps {
  terminals: Record<string, TerminalInstance>;
  draggingId: string | null;
  onDragStart: (
    terminalId: string,
    sourcePaneId: string,
  ) => (e: ReactDragEvent) => void;
  onDragEnd: () => void;
  onActivate: (paneId: string, terminalId: string) => void;
  onClose: (terminalId: string) => void;
  onCreate: (paneId: string) => Promise<void>;
  onResizeSplit: (splitId: string, index: number, deltaPx: number) => void;
}

function LayoutFrame({
  node,
  ...props
}: LayoutFrameProps & { node: LayoutNode }) {
  if (node.type === "pane") {
    return <PaneFrame node={node} {...props} />;
  }
  const isH = node.direction === "horizontal";
  return (
    <div className={cn("flex h-full w-full", isH ? "flex-row" : "flex-col")}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          <div
            className="min-w-0 min-h-0 overflow-hidden"
            style={{ flexGrow: node.sizes[i], flexBasis: 0, flexShrink: 1 }}
          >
            <LayoutFrame node={child} {...props} />
          </div>
          {i < node.children.length - 1 && (
            <Separator
              direction={node.direction}
              onResize={(delta) => props.onResizeSplit(node.id, i, delta)}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function PaneFrame({
  node,
  terminals,
  draggingId,
  onDragStart,
  onDragEnd,
  onActivate,
  onClose,
  onCreate,
}: LayoutFrameProps & { node: PaneNode }) {
  const paneTerminals = node.terminalIds
    .map((id) => terminals[id])
    .filter((t): t is TerminalInstance => !!t);

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="pointer-events-auto flex items-center gap-1 border-b border-border bg-background px-2"
        style={{ height: TAB_BAR_HEIGHT }}
      >
        {paneTerminals.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={onDragStart(t.id, node.id)}
            onDragEnd={onDragEnd}
            onClick={() => onActivate(node.id, t.id)}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors",
              t.id === node.activeTerminalId
                ? "bg-accent-soft text-accent"
                : "text-foreground hover:bg-default-soft",
              draggingId === t.id && "opacity-50",
            )}
          >
            <span className="font-mono text-xs">{">"}</span>
            <span>{t.title}</span>
            <button
              className="ml-1 rounded p-0.5 opacity-50 hover:bg-danger-soft hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          className="pointer-events-auto ml-1 rounded-md p-1 text-muted hover:bg-default-soft hover:text-accent"
          onClick={() => onCreate(node.id)}
          title="新建终端"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1" />
    </div>
  );
}

function DropHintOverlay({ rect, zone }: { rect: Rect; zone: DropZone }) {
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  const styles: Record<DropZone, React.CSSProperties> = {
    top: { left: rect.x, top: rect.y, width: rect.w, height: halfH },
    bottom: { left: rect.x, top: rect.y + halfH, width: rect.w, height: halfH },
    left: { left: rect.x, top: rect.y, width: halfW, height: rect.h },
    right: { left: rect.x + halfW, top: rect.y, width: halfW, height: rect.h },
    center: { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
  };
  return (
    <div
      className="pointer-events-none absolute border-2 border-accent bg-[rgba(232,154,75,0.2)]"
      style={{ ...styles[zone], zIndex: 20 }}
    />
  );
}

function Separator({
  direction,
  onResize,
}: {
  direction: "horizontal" | "vertical";
  onResize: (deltaPx: number) => void;
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let last = direction === "horizontal" ? e.clientX : e.clientY;
    const onMove = (ev: MouseEvent) => {
      const cur = direction === "horizontal" ? ev.clientX : ev.clientY;
      const delta = cur - last;
      last = cur;
      if (delta !== 0) onResize(delta);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "pointer-events-auto flex-shrink-0 bg-border transition-colors hover:bg-accent",
        direction === "horizontal" ? "cursor-col-resize" : "cursor-row-resize",
      )}
      style={
        direction === "horizontal"
          ? { width: SEPARATOR_SIZE }
          : { height: SEPARATOR_SIZE }
      }
    />
  );
}
