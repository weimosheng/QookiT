import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  useDockStore,
  type TabInstance,
  type DockRegion,
  type SideRegionId,
  findTabByTool,
} from "./dockStore";
import { getTool, getTools } from "./toolRegistry";
import { useSettingsStore } from "../../stores/settingsStore";
import { TabBar } from "./TabBar";
import {
  findPaneWithTab,
  findPane,
  findDropTarget,
  collectActiveTabs,
  type LayoutNode,
  type Rect,
  type DropZone,
} from "./dockLayout";
import "./registerTools";
import { useDragStore, type DragInfo } from "./dragStore";
import { cn } from "../../lib/cn";
import { dialogAlert } from "../../lib/dialog";
import { Terminal, Plus, LayoutGrid, Save, Trash2, RotateCcw, Download, Upload } from "lucide-react";
import { useLayoutStore, createDefaultTemplate, type LayoutTemplate } from "./layoutStore";
import { createPortal } from "react-dom";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";

interface DockWorkspaceProps {
  connectionId: string;
}

export function DockWorkspace({ connectionId }: DockWorkspaceProps) {
  const { t } = useTranslation("dock");
  const dock = useDockStore((s) => s.byConnection[connectionId]);
  const ensureInit = useDockStore((s) => s.ensureInit);
  const drag = useDragStore((s) => s.drag);
  const clearDrag = useDragStore((s) => s.clear);
  const moveTabToPane = useDockStore((s) => s.moveTabToPane);
  const dropOnEdge = useDockStore((s) => s.dropOnEdge);
  const moveTabToRegion = useDockStore((s) => s.moveTabToRegion);
  const dropOnTab = useDockStore((s) => s.dropOnTab);
  const reorderIcon = useDockStore((s) => s.reorderIcon);
  const setRegionSize = useDockStore((s) => s.setRegionSize);
  const openTab = useDockStore((s) => s.openTab);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);

  /** 在指定区域打开一个尚未打开的工具（拖活动栏图标时使用）。 */
  const openTool = useCallback(
    (cid: string, toolTypeId: string, region: DockRegion, iconAnchor?: string) => {
      void openTab(cid, toolTypeId, region, undefined, iconAnchor).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        void dialogAlert(t("terminal:open_panel_failed"), msg || t("common:unknown_error"));
      });
    },
    [openTab],
  );

  useEffect(() => {
    void ensureInit(connectionId);
    void useLayoutStore.getState().init();
  }, [connectionId, ensureInit]);

  useLayoutEffect(() => {
    if (!drag || drag.connectionId !== connectionId) return;
    const container = containerRef.current;
    if (!container) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      const { panes, paneRegions, regions } = measureTargets(container);
      const cr = container.getBoundingClientRect();
      const x = e.clientX - cr.left;
      const y = e.clientY - cr.top;

      // 标签条内拖动排序：与侧边活动栏一样，先做插入位置命中
      const tabTarget = hitTabStrip(e, container, paneRegions);
      if (tabTarget) {
        dropTargetRef.current = tabTarget;
        setDropTarget(tabTarget);
        return;
      }

      // 关闭状态的侧区域不渲染容器（见下方条件渲染），measureTargets 采不到它的矩形，
      // 拖过去只会落回中心区域；这里用边缘感应带补上落点。
      const closedTarget = hitClosedRegion(e, container, dock, cr);
      if (closedTarget) {
        dropTargetRef.current = closedTarget;
        setDropTarget(closedTarget);
        return;
      }

      const paneHit = findDropTarget(panes, x, y);
      if (paneHit) {
        const t: DropTarget = {
          kind: "pane",
          paneId: paneHit.paneId,
          region: paneRegions[paneHit.paneId],
          zone: paneHit.zone,
          rect: panes[paneHit.paneId],
        };
        dropTargetRef.current = t;
        setDropTarget(t);
        return;
      }
      const activityBars = container.querySelectorAll<HTMLElement>("[data-activity-bar]");
      let activityHit = false;
      for (const bar of activityBars) {
        const barRect = bar.getBoundingClientRect();
        if (e.clientX < barRect.left || e.clientX > barRect.right ||
            e.clientY < barRect.top || e.clientY > barRect.bottom) continue;
        const sideAttr = bar.getAttribute("data-activity-bar");
        if (sideAttr !== "left" && sideAttr !== "right" && sideAttr !== "bottom") continue;
        const buttons = Array.from(bar.querySelectorAll<HTMLElement>("[data-activity-button]"));
        let insertY = 0;
        let btnW = 0;
        let btnX = 0;
        // 插入锚点：把图标插到这个工具之前；为空则追加到末尾
        let anchorToolId: string | undefined;
        if (buttons.length === 0) {
          // 空图标栏：实际会插到第 1 个位置，指示条就画在顶部（与结果一致），
          // 之前画在轨道正中间，看起来像"插到中间"，与落点结果不符。
          insertY = barRect.top - cr.top;
          btnW = 28;
          btnX = barRect.left - cr.left + (barRect.width - 28) / 2;
        } else {
          let found = false;
          for (let i = 0; i < buttons.length; i++) {
            const br = buttons[i].getBoundingClientRect();
            if (e.clientY < br.top + br.height / 2) {
              anchorToolId = buttons[i].getAttribute("data-tool-id") ?? undefined;
              // 插到第 1 个：指示条画在轨道顶部，与「空图标栏」的表现一致，
              // 否则它落在图标栏的 padding 里，看起来像没对齐。
              insertY = i === 0 ? barRect.top - cr.top : br.top - cr.top - 2;
              btnW = br.width;
              btnX = br.left - cr.left;
              found = true;
              break;
            }
          }
          if (!found) {
            // 指针在最后一个图标之下：闱入末尾，指示条也画在图标列表下方
            const last = buttons[buttons.length - 1].getBoundingClientRect();
            insertY = last.bottom - cr.top + 2;
            btnW = last.width;
            btnX = last.left - cr.left;
          }
        }
        const t: DropTarget = {
          kind: "activityBar",
          region: sideAttr,
          anchorToolId,
          rect: { x: btnX, y: insertY, w: btnW, h: 2 },
        };
        dropTargetRef.current = t;
        setDropTarget(t);
        activityHit = true;
        break;
      }
      if (activityHit) return;
      for (const r of SIDE_REGIONS) {
        const rect = regions[r];
        if (rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
          const t: DropTarget = { kind: "region", region: r, rect };
          dropTargetRef.current = t;
          setDropTarget(t);
          return;
        }
      }
      const centerRect = regions.center;
      if (centerRect && x >= centerRect.x && x <= centerRect.x + centerRect.w && y >= centerRect.y && y <= centerRect.y + centerRect.h) {
        const t: DropTarget = { kind: "region", region: "center", rect: centerRect };
        dropTargetRef.current = t;
        setDropTarget(t);
        return;
      }
      dropTargetRef.current = null;
      setDropTarget(null);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const t = dropTargetRef.current;
      if (drag && t) {
        applyDrop(connectionId, drag, t, {
          openTool,
          moveTabToPane,
          dropOnEdge,
          moveTabToRegion,
          reorderIcon,
          dropOnTab,
        });
      }
      dropTargetRef.current = null;
      setDropTarget(null);
      clearDrag();
    };
    const onDragEnd = () => {
      dropTargetRef.current = null;
      setDropTarget(null);
      clearDrag();
    };
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragend", onDragEnd, true);
    return () => {
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragend", onDragEnd, true);
    };
  }, [drag, dock, connectionId, clearDrag, openTool, moveTabToPane, dropOnEdge, moveTabToRegion, reorderIcon, dropOnTab]);

  if (!dock) {
    return <div className="h-full w-full" />;
  }

  return (
    <div ref={containerRef} className="relative flex h-full w-full">
      <SideActivityBar side="left" connectionId={connectionId} />
      {dock.left && (
        <>
          <div
            data-dock-region="left"
            style={{ width: dock.leftWidth }}
            className="overflow-hidden border-r border-border"
          >
            <RegionTree connectionId={connectionId} region="left" tree={dock.left} tabs={dock.tabs} />
          </div>
          <Resizer
            direction="horizontal"
            value={dock.leftWidth}
            min={120}
            max={500}
            onChange={(v) => setRegionSize(connectionId, "left", v)}
          />
        </>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div data-dock-region="center" className="flex-1 overflow-hidden">
          {dock.center ? (
            <RegionTree connectionId={connectionId} region="center" tree={dock.center} tabs={dock.tabs} />
          ) : (
            <EmptyCenter connectionId={connectionId} />
          )}
        </div>
        {dock.bottom && (
          <>
            <Resizer
              direction="vertical"
              value={dock.bottomHeight}
              min={60}
              max={400}
              invert
              onChange={(v) => setRegionSize(connectionId, "bottom", v)}
            />
            <div
              data-dock-region="bottom"
              style={{ height: dock.bottomHeight }}
              className="overflow-hidden border-t border-border"
            >
              <RegionTree connectionId={connectionId} region="bottom" tree={dock.bottom} tabs={dock.tabs} />
            </div>
          </>
        )}
      </div>
      {dock.right && (
        <>
          <Resizer
            direction="horizontal"
            value={dock.rightWidth}
            min={120}
            max={500}
            invert
            onChange={(v) => setRegionSize(connectionId, "right", v)}
          />
          <div
            data-dock-region="right"
            style={{ width: dock.rightWidth }}
            className="overflow-hidden border-l border-border"
          >
            <RegionTree connectionId={connectionId} region="right" tree={dock.right} tabs={dock.tabs} />
          </div>
        </>
      )}
      <SideActivityBar side="right" connectionId={connectionId} />
      {drag && dropTarget && (() => {
        // 拖活动栏图标时落点是「整个区域」，画整块面板比画半边更贴近实际结果
        const r =
          drag.toolTypeId && dropTarget.kind === "pane"
            ? dropTarget.rect
            : overlayRect(dropTarget);
        if (dropTarget.kind === "tabStrip") {
          return (
            <div
              className="pointer-events-none absolute z-50 rounded-full bg-accent transition-all duration-100 ease-out"
              style={{ left: r.x, top: r.y, width: 2, height: r.h }}
            />
          );
        }
        if (dropTarget.kind === "activityBar") {
          return (
            <div
              className="pointer-events-none absolute z-50 rounded-full bg-accent transition-all duration-150 ease-out"
              style={{ left: r.x, top: r.y, width: r.w, height: 3 }}
            />
          );
        }
        return (
          <div
            className="pointer-events-none absolute z-50 rounded-md border border-accent bg-accent/15 shadow-sm transition-all duration-150 ease-out"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
          />
        );
      })()}
    </div>
  );
}

function Resizer({
  direction,
  value,
  min,
  max,
  invert,
  onChange,
}: {
  direction: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  invert?: boolean;
  onChange: (v: number) => void;
}) {
  const startValue = useRef(0);
  const startPos = useRef(0);
  const sign = invert ? -1 : 1;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startValue.current = value;
    startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
    const onMove = (ev: MouseEvent) => {
      const pos = direction === "horizontal" ? ev.clientX : ev.clientY;
      const delta = (pos - startPos.current) * sign;
      onChange(Math.max(min, Math.min(max, startValue.current + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }, [direction, value, min, max, sign, onChange]);

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "flex-shrink-0 bg-border transition-colors hover:bg-accent-soft",
        direction === "horizontal" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
    />
  );
}

function SplitResizer({
  direction,
  onResize,
}: {
  direction: "horizontal" | "vertical";
  onResize: (deltaPercent: number) => void;
}) {
  const lastPos = useRef(0);
  const totalSize = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const parent = (e.currentTarget as HTMLElement).parentElement;
      if (!parent) return;
      const isH = direction === "horizontal";
      totalSize.current = isH ? parent.clientWidth : parent.clientHeight;
      lastPos.current = isH ? e.clientX : e.clientY;
      const onMove = (ev: MouseEvent) => {
        const pos = isH ? ev.clientX : ev.clientY;
        const deltaPx = pos - lastPos.current;
        lastPos.current = pos;
        if (totalSize.current > 0) {
          onResize((deltaPx / totalSize.current) * 100);
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = isH ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, onResize],
  );

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "flex-shrink-0 bg-border transition-colors hover:bg-accent-soft",
        direction === "horizontal" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
    />
  );
}

function EmptyCenter({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation("terminal");
  const openTab = useDockStore((s) => s.openTab);
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Terminal size={32} className="opacity-40" />
        <span className="text-sm">{t("no_terminal")}</span>
        <button
          type="button"
          onClick={() =>
            void openTab(connectionId, "terminal", "center").catch((e) => {
              const msg = e instanceof Error ? e.message : String(e);
              void dialogAlert(t("create_failed"), msg || t("common:unknown_error"));
            })
          }
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs text-accent-foreground hover:opacity-90"
        >
          <Plus size={14} />
          {t("create_terminal")}
        </button>
      </div>
    </div>
  );
}

/**
 * 按 iconOrder 排列活动栏图标。
 *
 * 不在顺序表里的条目（新注册的工具、旧模板/旧数据）按原注册顺序补在末尾，
 * 因此即使顺序表缺项，图标也不会消失。
 */
function orderByIconOrder<T extends { id: string }>(items: T[], order?: string[]): T[] {
  if (!order || order.length === 0) return items;
  const remaining = new Map(items.map((t) => [t.id, t]));
  const ordered: T[] = [];
  for (const id of order) {
    const item = remaining.get(id);
    if (item) {
      ordered.push(item);
      remaining.delete(id);
    }
  }
  for (const item of items) {
    if (remaining.has(item.id)) ordered.push(item);
  }
  return ordered;
}

function SideActivityBar({
  side,
  connectionId,
}: {
  side: SideRegionId;
  connectionId: string;
}) {
  const dock = useDockStore((s) => s.byConnection[connectionId]);
  const openTab = useDockStore((s) => s.openTab);
  const closeTab = useDockStore((s) => s.closeTab);
  const setActiveInRegion = useDockStore((s) => s.setActiveInRegion);
  const { t } = useTranslation("dock");

  const tools = getTools();
  const toolSides = dock?.toolSides ?? {};
  const hiddenTools = useSettingsStore((s) => s.hiddenTools);
  const sideTools = orderByIconOrder(
    tools.filter(
      (t) =>
        (toolSides[t.id] ?? t.defaultSide) === side &&
        !hiddenTools.includes(t.id),
    ),
    dock?.iconOrder?.[side],
  );
  const tree = dock?.[side] ?? null;
  const tabs = dock?.tabs ?? {};

  const activeTabId = useMemo(() => {
    if (!tree) return null;
    const activeSet = new Set<string>();
    collectActiveTabs(tree, activeSet);
    return activeSet.values().next().value ?? null;
  }, [tree]);
  const activeTab = activeTabId ? tabs[activeTabId] : null;

  return (
    <div
      data-activity-bar={side}
      className={cn(
        "flex w-10 flex-col items-center gap-1 bg-background/80 py-2 backdrop-blur-md",
        side === "left" ? "border-r border-border" : "border-l border-border",
      )}
    >
      {sideTools.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTab?.toolTypeId === tool.id;
        const existingTabId = findTabByTool(tree, tabs, tool.id);
        return (
          <button
            key={tool.id}
            type="button"
            data-activity-button
            data-tool-id={tool.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              const paneId =
                existingTabId && tree
                  ? findPaneWithTab(tree, existingTabId)
                  : null;
              if (existingTabId && paneId) {
                // 该工具已打开：拖动的是现有标签，可以移到其他面板/区域
                e.dataTransfer.setData("text/plain", existingTabId);
                useDragStore.getState().start({
                  connectionId,
                  tabId: existingTabId,
                  sourceRegion: side,
                  sourcePaneId: paneId,
                });
                return;
              }
              // 该工具尚未打开：拖动的是「新面板」，落点决定它开在哪个区域
              e.dataTransfer.setData("text/plain", tool.id);
              useDragStore.getState().start({
                connectionId,
                sourceRegion: side,
                toolTypeId: tool.id,
              });
            }}
            onClick={() => {
              if (isActive && activeTabId) {
                void closeTab(connectionId, activeTabId);
              } else if (existingTabId && tree) {
                const paneId = findPaneWithTab(tree, existingTabId);
                if (paneId) setActiveInRegion(connectionId, side, paneId, existingTabId);
              } else {
                void openTab(connectionId, tool.id, side);
              }
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              isActive
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-default-soft hover:text-foreground",
            )}
            title={tool.nameKey ? t(tool.nameKey) : tool.name}
          >
            <Icon size={18} />
          </button>
        );
      })}
      {side === "left" && <LayoutButton connectionId={connectionId} />}
    </div>
  );
}

function LayoutButton({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation("dock");
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-layout-panel]") && !target.closest("[data-layout-button]")) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="flex-1" />
      <button
        ref={buttonRef}
        data-layout-button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          open
            ? "bg-accent-soft text-accent"
            : "text-muted hover:bg-default-soft hover:text-foreground",
        )}
        title={t("layout_manage")}
      >
        <LayoutGrid size={18} />
      </button>
      {open && (
        <LayoutSettingsPanel
          connectionId={connectionId}
          anchorRef={buttonRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LayoutSettingsPanel({
  connectionId,
  onClose,
}: {
  connectionId: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation("dock");
  const templates = useLayoutStore((s) => s.templates);
  const saveTemplate = useLayoutStore((s) => s.save);
  const removeTemplate = useLayoutStore((s) => s.remove);
  const importTemplates = useLayoutStore((s) => s.importTemplates);
  const saveLayout = useDockStore((s) => s.saveLayout);
  const loadLayout = useDockStore((s) => s.loadLayout);

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const template = saveLayout(connectionId, trimmed);
    void saveTemplate(template);
    setName("");
    setSaving(false);
  };

  const handleExport = async () => {
    const filePath = await saveDialog({
      defaultPath: "qookit-layouts.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, JSON.stringify(templates, null, 2));
  };

  const handleImport = async () => {
    const filePath = await openDialog({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!filePath || typeof filePath !== "string") return;
    try {
      const content = await readTextFile(filePath);
      const imported = JSON.parse(content) as LayoutTemplate[];
      if (Array.isArray(imported)) {
        await importTemplates(imported);
      }
    } catch {
      // ignore parse errors
    }
  };

  const handleLoad = (template: LayoutTemplate) => {
    void loadLayout(connectionId, template).then(() => onClose());
  };

  const handleDefault = () => {
    handleLoad(createDefaultTemplate());
  };

  const handleRemove = (id: string) => {
    void removeTemplate(id);
  };

  return createPortal(
    <div
      data-layout-panel
      className="fixed z-[9999] w-64 overflow-hidden rounded-lg border border-border bg-background shadow-xl"
      style={{ left: 44, bottom: 8 }}
    >
      <div className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
        {t("layout_manage")}
      </div>
      <div className="flex flex-col gap-1 p-2">
        {saving ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setSaving(false); setName(""); }
              }}
              placeholder={t("layout_name_placeholder")}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs text-accent-foreground hover:opacity-90"
              >
                <Save size={12} />
                {t("save")}
              </button>
              <button
                type="button"
                onClick={() => { setSaving(false); setName(""); }}
                className="rounded-md border border-border px-2 py-1.5 text-xs text-muted hover:bg-default-soft"
              >
                {t("common:cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-default-soft"
          >
            <Save size={12} />
            {t("save_current")}
          </button>
        )}

        <div className="my-1 h-px bg-border" />

        <button
          type="button"
          onClick={handleDefault}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-default-soft"
        >
          <RotateCcw size={12} className="text-accent" />
          {t("default_layout")}
        </button>

        <div className="my-1 h-px bg-border" />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={templates.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-default-soft disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            {t("export")}
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-default-soft"
          >
            <Upload size={12} />
            {t("import")}
          </button>
        </div>

        {templates.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <div className="flex flex-col gap-0.5">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-default-soft"
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(tpl)}
                    className="flex flex-1 items-center px-1 text-xs text-foreground"
                  >
                    {tpl.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(tpl.id)}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 hover:text-foreground group-hover:opacity-100"
                    title={t("delete")}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface RegionTreeProps {
  connectionId: string;
  region: DockRegion;
  tree: LayoutNode;
  tabs: Record<string, TabInstance>;
}

interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function RegionTree({ connectionId, region, tree, tabs }: RegionTreeProps) {
  const { t } = useTranslation("terminal");
  const containerRef = useRef<HTMLDivElement>(null);
  const [paneRects, setPaneRects] = useState<Record<string, PaneRect>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const setActiveInRegion = useDockStore((s) => s.setActiveInRegion);
  const closePaneTab = useDockStore((s) => s.closePaneTab);
  const openTab = useDockStore((s) => s.openTab);
  const splitInRegion = useDockStore((s) => s.splitInRegion);
  const resizeSplit = useDockStore((s) => s.resizeSplit);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cr = el.getBoundingClientRect();
    const rects: Record<string, PaneRect> = {};
    el.querySelectorAll<HTMLElement>("[data-pane-content]").forEach((d) => {
      const paneId = d.getAttribute("data-pane-content");
      if (!paneId) return;
      const r = d.getBoundingClientRect();
      rects[paneId] = {
        x: r.left - cr.left,
        y: r.top - cr.top,
        w: r.width,
        h: r.height,
      };
    });
    setPaneRects(rects);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [tree, size, measure]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      measure();
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [measure]);

  const ops = useMemo(
    () => ({
      setActive: (paneId: string, tabId: string) =>
        setActiveInRegion(connectionId, region, paneId, tabId),
      closePaneTab: (paneId: string, tabId: string) => {
        void closePaneTab(connectionId, region, paneId, tabId);
      },
      newTab: () => {
        void openTab(connectionId, "terminal", region).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          void dialogAlert(t("create_failed"), msg || t("common:unknown_error"));
        });
      },
      split: (paneId: string, dir: "horizontal" | "vertical") =>
        void splitInRegion(connectionId, region, paneId, "terminal", dir),
      dragStart: (paneId: string, tabId: string) =>
        useDragStore.getState().start({
          connectionId,
          tabId,
          sourceRegion: region,
          sourcePaneId: paneId,
        }),
      resizeSplit: (splitId: string, index: number, deltaPercent: number) =>
        resizeSplit(connectionId, region, splitId, index, deltaPercent),
    }),
    [connectionId, region, setActiveInRegion, closePaneTab, openTab, splitInRegion, resizeSplit],
  );

  const regionTabIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (n: LayoutNode) => {
      if (n.type === "pane") n.tabIds.forEach((t) => ids.add(t));
      else n.children.forEach(walk);
    };
    walk(tree);
    return ids;
  }, [tree]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        {renderFramework(tree, tabs, ops)}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {Object.values(tabs).map((tab) => {
          if (!regionTabIds.has(tab.id)) return null;
          const paneId = findPaneWithTab(tree, tab.id);
          const pane = paneId ? findPane(tree, paneId) : null;
          const isActive = pane?.activeTabId === tab.id;
          const rect = paneId ? paneRects[paneId] : null;
          const tool = getTool(tab.toolTypeId);
          if (!tool) return null;
          const visible = isActive && rect;
          return (
            <div
              key={tab.id}
              style={{
                position: "absolute",
                left: rect?.x ?? 0,
                top: rect?.y ?? 0,
                width: rect?.w ?? "100%",
                height: rect?.h ?? "100%",
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? "auto" : "none",
                zIndex: visible ? 10 : 0,
              }}
            >
              {tool.render(connectionId, tab.id, tab)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderFramework(
  node: LayoutNode,
  tabs: Record<string, TabInstance>,
  ops: {
    setActive: (paneId: string, tabId: string) => void;
    closePaneTab: (paneId: string, tabId: string) => void;
    newTab: () => void;
    split: (paneId: string, dir: "horizontal" | "vertical") => void;
    dragStart: (paneId: string, tabId: string) => void;
    resizeSplit: (splitId: string, index: number, deltaPercent: number) => void;
  },
): ReactNode {
  if (node.type === "pane") {
    const paneTabs = node.tabIds
      .map((id) => tabs[id])
      .filter((t): t is TabInstance => !!t);
    return (
      <div className="flex h-full w-full flex-col">
        <TabBar
          paneId={node.id}
          tabs={paneTabs}
          activeTabId={node.activeTabId}
          onSelect={(tabId) => ops.setActive(node.id, tabId)}
          onClose={(tabId) => ops.closePaneTab(node.id, tabId)}
          onNewTab={() => ops.newTab()}
          onSplitH={() => ops.split(node.id, "horizontal")}
          onSplitV={() => ops.split(node.id, "vertical")}
          onTabDragStart={(tabId) => ops.dragStart(node.id, tabId)}
        />
        <div data-pane-content={node.id} className="relative flex-1" />
      </div>
    );
  }
  const dir = node.direction === "horizontal" ? "row" : "column";
  return (
    <div className="flex h-full w-full" style={{ flexDirection: dir }}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          <div
            style={{ flex: `${node.sizes[i]} 1 0%` }}
            className="min-w-0 min-h-0 overflow-hidden"
          >
            {renderFramework(child, tabs, ops)}
          </div>
          {i < node.children.length - 1 && (
            <SplitResizer
              direction={node.direction}
              onResize={(deltaPercent) =>
                ops.resizeSplit(node.id, i, deltaPercent)
              }
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

type DropTarget =
  | { kind: "pane"; paneId: string; region: DockRegion; zone: DropZone; rect: Rect }
  | { kind: "region"; region: DockRegion; rect: Rect }
  | { kind: "activityBar"; region: SideRegionId; rect: Rect; anchorToolId?: string }
  | { kind: "tabStrip"; paneId: string; region: DockRegion; index: number; rect: Rect };

function hitTabStrip(
  e: DragEvent,
  container: HTMLElement,
  paneRegions: Record<string, DockRegion>,
): DropTarget | null {
  const target = e.target as HTMLElement | null;
  const tabEl = target?.closest?.("[data-tab-id]") as HTMLElement | null;
  if (!tabEl) return null;
  const strip = tabEl.closest<HTMLElement>("[data-tab-strip]");
  if (!strip) return null;
  const paneId = strip.getAttribute("data-pane-id");
  const region = paneId ? paneRegions[paneId] : undefined;
  if (!paneId || !region) return null;

  const cr = container.getBoundingClientRect();
  const stripRect = strip.getBoundingClientRect();
  const tabs = Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]"));

  let index = tabs.length;
  for (let i = 0; i < tabs.length; i++) {
    const r = tabs[i].getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) {
      index = i;
      break;
    }
  }

  let indicatorX: number;
  if (index < tabs.length) {
    indicatorX = tabs[index].getBoundingClientRect().left - cr.left - 1;
  } else if (tabs.length > 0) {
    indicatorX = tabs[tabs.length - 1].getBoundingClientRect().right - cr.left - 1;
  } else {
    indicatorX = stripRect.left - cr.left;
  }

  return {
    kind: "tabStrip",
    paneId,
    region,
    index,
    rect: { x: indicatorX, y: stripRect.top - cr.top + 3, w: 2, h: Math.max(0, stripRect.height - 6) },
  };
}

const SIDE_REGIONS: SideRegionId[] = ["left", "right", "bottom"];

/** 关闭状态下侧区域的边缘感应带（像素）。 */
const CLOSED_EDGE_BAND = 72;
const CLOSED_BOTTOM_BAND = 56;

/**
 * 侧区域关闭时的边缘落点。
 *
 * 关闭的侧区域**不会渲染** `[data-dock-region]` 容器（见下方 `dock.left && …` 的条件渲染），
 * 于是 `measureTargets` 采不到它的矩形，拖拽时只有精确拖到 40px 活动栏上才能命中。
 * 这里补一条沿边缘的感应带，让「把标签拖到左侧/右侧/底部」在面板未打开时也能生效：
 * 拖上去即把标签停靠到该侧并自动展开面板。
 */
function hitClosedRegion(
  e: DragEvent,
  container: HTMLElement,
  dock:
    | {
        left: LayoutNode | null;
        right: LayoutNode | null;
        bottom: LayoutNode | null;
      }
    | undefined,
  cr: DOMRect,
): DropTarget | null {
  if (!dock) return null;
  if (dock.left && dock.right && dock.bottom) return null;

  const bars = Array.from(
    container.querySelectorAll<HTMLElement>("[data-activity-bar]"),
  );
  const railEdge = (side: string, fallback: number): number => {
    const el = bars.find((b) => b.getAttribute("data-activity-bar") === side);
    if (!el) return fallback;
    const r = el.getBoundingClientRect();
    return (side === "left" ? r.right : r.left) - cr.left;
  };
  const leftEdge = railEdge("left", 0);
  const rightEdge = railEdge("right", cr.width);
  const centerWidth = Math.max(0, rightEdge - leftEdge);
  if (centerWidth <= 0) return null;

  const x = e.clientX - cr.left;
  const y = e.clientY - cr.top;

  if (!dock.left) {
    const w = Math.min(CLOSED_EDGE_BAND, centerWidth);
    if (x >= leftEdge && x <= leftEdge + w) {
      return {
        kind: "region",
        region: "left",
        rect: { x: leftEdge, y: 0, w, h: cr.height },
      };
    }
  }
  if (!dock.right) {
    const w = Math.min(CLOSED_EDGE_BAND, centerWidth);
    if (x <= rightEdge && x >= rightEdge - w) {
      return {
        kind: "region",
        region: "right",
        rect: { x: rightEdge - w, y: 0, w, h: cr.height },
      };
    }
  }
  if (!dock.bottom) {
    const h = Math.min(CLOSED_BOTTOM_BAND, cr.height);
    if (y >= cr.height - h) {
      return {
        kind: "region",
        region: "bottom",
        rect: { x: leftEdge, y: cr.height - h, w: centerWidth, h },
      };
    }
  }
  return null;
}

function measureTargets(container: HTMLElement): {
  panes: Record<string, Rect>;
  paneRegions: Record<string, DockRegion>;
  regions: Partial<Record<DockRegion, Rect>>;
} {
  const cr = container.getBoundingClientRect();
  const panes: Record<string, Rect> = {};
  const paneRegions: Record<string, DockRegion> = {};
  const regions: Partial<Record<DockRegion, Rect>> = {};

  container.querySelectorAll<HTMLElement>("[data-pane-content]").forEach((d) => {
    const paneId = d.getAttribute("data-pane-content");
    if (!paneId) return;
    const regionEl = d.closest("[data-dock-region]");
    const regionAttr = regionEl?.getAttribute("data-dock-region");
    if (!regionAttr) return;
    const r = d.getBoundingClientRect();
    panes[paneId] = { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
    paneRegions[paneId] = regionAttr as DockRegion;
  });

  container.querySelectorAll<HTMLElement>("[data-dock-region]").forEach((d) => {
    const regionAttr = d.getAttribute("data-dock-region");
    if (!regionAttr) return;
    const r = d.getBoundingClientRect();
    const rect: Rect = { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
    const key = regionAttr as DockRegion;
    const existing = regions[key];
    if (existing) {
      const x = Math.min(existing.x, rect.x);
      const y = Math.min(existing.y, rect.y);
      const x2 = Math.max(existing.x + existing.w, rect.x + rect.w);
      const y2 = Math.max(existing.y + existing.h, rect.y + rect.h);
      regions[key] = { x, y, w: x2 - x, h: y2 - y };
    } else {
      regions[key] = rect;
    }
  });

  return { panes, paneRegions, regions };
}

function overlayRect(t: DropTarget): Rect {
  if (t.kind === "region" || t.kind === "activityBar" || t.kind === "tabStrip") return t.rect;
  const { rect, zone } = t;
  if (zone === "center") return rect;
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  if (zone === "left") return { x: rect.x, y: rect.y, w: halfW, h: rect.h };
  if (zone === "right") return { x: rect.x + halfW, y: rect.y, w: halfW, h: rect.h };
  if (zone === "top") return { x: rect.x, y: rect.y, w: rect.w, h: halfH };
  return { x: rect.x, y: rect.y + halfH, w: rect.w, h: halfH };
}

interface DropOps {
  /** 在目标区域打开一个尚未打开的工具（拖活动栏图标时使用）。 */
  openTool: (
    connectionId: string,
    toolTypeId: string,
    region: DockRegion,
    iconAnchor?: string,
  ) => void;
  /** 只在活动栏内调整图标顺序（同一侧拖动时用，不移动面板）。 */
  reorderIcon: (
    connectionId: string,
    tabId: string,
    side: SideRegionId,
    iconAnchor?: string,
  ) => void;
  moveTabToPane: (
    connectionId: string,
    tabId: string,
    fromRegion: DockRegion,
    toRegion: DockRegion,
    sourcePaneId: string,
    targetPaneId: string,
  ) => void;
  dropOnEdge: (
    connectionId: string,
    tabId: string,
    fromRegion: DockRegion,
    toRegion: DockRegion,
    sourcePaneId: string,
    targetPaneId: string,
    zone: DropZone,
  ) => void;
  moveTabToRegion: (
    connectionId: string,
    tabId: string,
    fromRegion: DockRegion,
    toRegion: DockRegion,
    iconAnchor?: string,
  ) => void;
  dropOnTab: (
    connectionId: string,
    tabId: string,
    fromRegion: DockRegion,
    toRegion: DockRegion,
    sourcePaneId: string,
    targetPaneId: string,
    index: number,
  ) => void;
}

function applyDrop(
  connectionId: string,
  drag: DragInfo,
  target: DropTarget,
  ops: DropOps,
): void {
  // 活动栏图标拖动：落点区域决定新面板开在哪一侧；落在图标栏上时按位置插入图标
  if (drag.toolTypeId) {
    ops.openTool(
      connectionId,
      drag.toolTypeId,
      target.region,
      target.kind === "activityBar" ? target.anchorToolId : undefined,
    );
    return;
  }

  const tabId = drag.tabId;
  const sourcePaneId = drag.sourcePaneId;
  if (!tabId || !sourcePaneId) return;

  if (target.kind === "tabStrip") {
    ops.dropOnTab(
      connectionId,
      tabId,
      drag.sourceRegion,
      target.region,
      sourcePaneId,
      target.paneId,
      target.index,
    );
    return;
  }

  if (target.kind === "activityBar") {
    if (target.region === drag.sourceRegion) {
      // 同一侧内拖动：只调整图标顺序，面板不动
      ops.reorderIcon(connectionId, tabId, target.region, target.anchorToolId);
    } else {
      ops.moveTabToRegion(
        connectionId,
        tabId,
        drag.sourceRegion,
        target.region,
        target.anchorToolId,
      );
    }
    return;
  }

  if (target.kind === "region") {
    ops.moveTabToRegion(connectionId, tabId, drag.sourceRegion, target.region);
    return;
  }

  if (target.zone === "center") {
    ops.moveTabToPane(
      connectionId,
      tabId,
      drag.sourceRegion,
      target.region,
      sourcePaneId,
      target.paneId,
    );
    return;
  }

  ops.dropOnEdge(
    connectionId,
    tabId,
    drag.sourceRegion,
    target.region,
    sourcePaneId,
    target.paneId,
    target.zone,
  );
}
