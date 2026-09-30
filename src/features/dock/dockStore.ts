import { create } from "zustand";
import type { LayoutNode, DropZone } from "./dockLayout";
import {
  createInitialLayout,
  findFirstPaneId,
  findPaneWithTab,
  addTabToPane,
  removeTabFromPane,
  setActiveInPane,
  splitPane,
  moveTabToPane as moveTabInTree,
  dropOnEdge as dropOnEdgeInTree,
  insertTabToPane,
  reorderTabInPane,
  cleanupLayout,
  updateSplitSizes,
  genId,
  type PaneNode,
  type SplitNode,
} from "./dockLayout";
import { getTool, getTools, type TabMeta, type ToolSide } from "./toolRegistry";
import type { Blueprint, LayoutTemplate } from "./layoutStore";

export type DockRegion = "left" | "right" | "bottom" | "center";
export type SideRegionId = "left" | "right" | "bottom";

export interface TabInstance {
  id: string;
  toolTypeId: string;
  title: string;
  meta?: TabMeta;
  dirty?: boolean;
}

interface ConnectionDock {
  tabs: Record<string, TabInstance>;
  left: LayoutNode | null;
  right: LayoutNode | null;
  bottom: LayoutNode | null;
  center: LayoutNode | null;
  toolSides: Record<string, DockRegion>;
  /** 活动栏图标的排列顺序（按侧），决定图标的显示顺序与拖放插入位置 */
  iconOrder: Record<SideRegionId, string[]>;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
}

const SIDE_IDS: SideRegionId[] = ["left", "right", "bottom"];

/** 工具实际归属的侧；归属中心（不显示图标）时为 null。 */
function resolvedSide(
  toolId: string,
  toolSides?: Record<string, DockRegion>,
): SideRegionId | null {
  const side = toolSides?.[toolId] ?? getTool(toolId)?.defaultSide ?? "center";
  return side === "left" || side === "right" || side === "bottom" ? side : null;
}

/** 默认图标顺序：按工具注册顺序分配到各自的默认侧。 */
function defaultIconOrder(): Record<SideRegionId, string[]> {
  const order: Record<SideRegionId, string[]> = { left: [], right: [], bottom: [] };
  for (const t of getTools()) {
    const side = (t.defaultSide ?? "center") as DockRegion;
    if (side === "left" || side === "right" || side === "bottom") {
      order[side].push(t.id);
    }
  }
  return order;
}

/**
 * 规范化图标顺序：
 * 1. 每个工具只保留一条记录（拖到别的侧后旧侧可能留下陈旧记录，以 `toolSides` 为准）；
 * 2. 补齐缺失的工具（新注册的工具、他人导入的旧模板）——否则它们会退化成“追加在末尾”，拖放位置失效。
 */
function normalizeIconOrder(
  raw?: Partial<Record<SideRegionId, string[]>>,
  toolSides?: Record<string, DockRegion>,
): Record<SideRegionId, string[]> {
  const out: Record<SideRegionId, string[]> = { left: [], right: [], bottom: [] };
  const seen = new Set<string>();

  for (const side of SIDE_IDS) {
    for (const id of raw?.[side] ?? []) {
      if (seen.has(id)) continue;
      // 该工具的归属已经不在这一侧了：丢弃陈旧记录，稍后按实际侧补回
      const actual = resolvedSide(id, toolSides);
      if (actual !== null && actual !== side) continue;
      seen.add(id);
      out[side].push(id);
    }
  }

  const fallback = defaultIconOrder();
  const missing: string[] = [];
  for (const side of SIDE_IDS) {
    for (const id of fallback[side]) if (!seen.has(id)) missing.push(id);
  }
  for (const id of missing) {
    if (seen.has(id)) continue;
    const side = resolvedSide(id, toolSides);
    if (side === null) continue;
    seen.add(id);
    out[side].push(id);
  }
  return out;
}

/** 把工具图标插到指定侧的锚点之前；锚点为空则追加到末尾，并从其它侧移除旧记录。 */
function placeIcon(
  order: Record<SideRegionId, string[]>,
  side: SideRegionId,
  toolId: string,
  anchorToolId?: string,
): Record<SideRegionId, string[]> {
  const next: Record<SideRegionId, string[]> = { left: [], right: [], bottom: [] };
  for (const s of SIDE_IDS) {
    next[s] = (order[s] ?? []).filter((id) => id !== toolId);
  }
  const list = next[side];
  const at = anchorToolId ? list.indexOf(anchorToolId) : -1;
  if (at >= 0) list.splice(at, 0, toolId);
  else list.push(toolId);
  return next;
}

function sameOrder(
  a: Record<SideRegionId, string[]>,
  b: Record<SideRegionId, string[]>,
): boolean {
  return SIDE_IDS.every((side) => (a[side] ?? []).join() === (b[side] ?? []).join());
}

function emptyDock(): ConnectionDock {
  return { tabs: {}, left: null, right: null, bottom: null, center: null, toolSides: {}, iconOrder: { left: [], right: [], bottom: [] }, leftWidth: 320, rightWidth: 320, bottomHeight: 192 };
}

// 每个连接的终端序号：在 createTab 内同步递增，避免异步写回 store 前竞态导致编号重复/跳号。
const terminalSeqByConn = new Map<string, number>();

async function createTab(
  connectionId: string,
  toolTypeId: string,
  meta?: TabMeta,
): Promise<TabInstance> {
  const tool = getTool(toolTypeId);
  const id = tool?.createInstance
    ? await tool.createInstance(connectionId, meta)
    : genId("tab");
  const metaTitle = typeof meta?.title === "string" ? meta.title : undefined;
  let title = metaTitle ?? tool?.defaultTitle ?? toolTypeId;
  if (toolTypeId === "terminal") {
    const seq = (terminalSeqByConn.get(connectionId) ?? 0) + 1;
    terminalSeqByConn.set(connectionId, seq);
    title = `终端 ${seq}`;
  }
  return {
    id,
    toolTypeId,
    title,
    ...(meta ? { meta } : {}),
  };
}

function getDock(state: DockState, connectionId: string): ConnectionDock {
  return state.byConnection[connectionId] ?? emptyDock();
}

function removeTabFromTree(
  tree: LayoutNode | null,
  tabId: string,
): LayoutNode | null {
  if (!tree) return null;
  const paneId = findPaneWithTab(tree, tabId);
  if (!paneId) return tree;
  const removed = removeTabFromPane(tree, tabId, paneId);
  return cleanupLayout(removed);
}

export function collectTabIds(tree: LayoutNode | null): string[] {
  if (!tree) return [];
  const ids: string[] = [];
  const walk = (n: LayoutNode) => {
    if (n.type === "pane") ids.push(...n.tabIds);
    else n.children.forEach(walk);
  };
  walk(tree);
  return ids;
}

export function findTabByTool(
  tree: LayoutNode | null,
  tabs: Record<string, TabInstance>,
  toolTypeId: string,
): string | null {
  for (const id of collectTabIds(tree)) {
    if (tabs[id]?.toolTypeId === toolTypeId) return id;
  }
  return null;
}

function treeToBlueprint(
  tree: LayoutNode | null,
  tabs: Record<string, TabInstance>,
): Blueprint | null {
  if (!tree) return null;
  if (tree.type === "pane") {
    const tools: string[] = [];
    let activeIndex = -1;
    for (const id of tree.tabIds) {
      const tab = tabs[id];
      if (!tab) continue;
      if (getTool(tab.toolTypeId)?.excludeFromLayout) continue;
      if (id === tree.activeTabId) activeIndex = tools.length;
      tools.push(tab.toolTypeId);
    }
    if (tools.length === 0) return null;
    return { type: "pane", tools, activeIndex: activeIndex < 0 ? 0 : activeIndex };
  }
  const children = tree.children
    .map((c) => treeToBlueprint(c, tabs))
    .filter((c): c is Blueprint => c !== null);
  if (children.length === 0) return null;
  return { type: "split", direction: tree.direction, children, sizes: tree.sizes };
}

async function blueprintToTree(
  blueprint: Blueprint | null,
  connectionId: string,
): Promise<{ tree: LayoutNode | null; tabs: Record<string, TabInstance> }> {
  if (!blueprint) return { tree: null, tabs: {} };
  if (blueprint.type === "pane") {
    const tabs: Record<string, TabInstance> = {};
    const tabIds: string[] = [];
    for (const toolTypeId of blueprint.tools) {
      if (getTool(toolTypeId)?.excludeFromLayout) continue;
      const tab = await createTab(connectionId, toolTypeId);
      tabs[tab.id] = tab;
      tabIds.push(tab.id);
    }
    if (tabIds.length === 0) return { tree: null, tabs: {} };
    const activeTabId =
      tabIds[Math.min(blueprint.activeIndex, tabIds.length - 1)] ?? tabIds[0];
    const tree: PaneNode = { id: genId("pane"), type: "pane", tabIds, activeTabId };
    return { tree, tabs };
  }
  const results = await Promise.all(
    blueprint.children.map((c) => blueprintToTree(c, connectionId)),
  );
  const allTabs: Record<string, TabInstance> = {};
  for (const r of results) Object.assign(allTabs, r.tabs);
  const children = results.map((r) => r.tree).filter((t): t is LayoutNode => t !== null);
  if (children.length === 0) return { tree: null, tabs: allTabs };
  if (children.length === 1) return { tree: children[0], tabs: allTabs };
  const tree: SplitNode = {
    id: genId("split"),
    type: "split",
    direction: blueprint.direction,
    children,
    sizes: blueprint.sizes,
  };
  return { tree, tabs: allTabs };
}

interface DockState {
  byConnection: Record<string, ConnectionDock>;
  ensureInit: (connectionId: string) => Promise<void>;
  openTab: (
    connectionId: string,
    toolTypeId: string,
    region: DockRegion,
    meta?: TabMeta,
    /** 拖到活动栏时：插到这个工具的图标之前（空则追加到末尾） */
    iconAnchor?: string,
  ) => Promise<string>;
  splitInRegion: (
    connectionId: string,
    region: DockRegion,
    paneId: string,
    toolTypeId: string,
    direction: "horizontal" | "vertical",
  ) => Promise<string>;
  closeTab: (connectionId: string, tabId: string) => Promise<void>;
  closePaneTab: (
    connectionId: string,
    region: DockRegion,
    paneId: string,
    tabId: string,
  ) => Promise<void>;
  focusTab: (connectionId: string, tabId: string) => void;
  setTabDirty: (connectionId: string, tabId: string, dirty: boolean) => void;
  setActiveInRegion: (
    connectionId: string,
    region: DockRegion,
    paneId: string,
    tabId: string,
  ) => void;
  clearRegion: (connectionId: string, region: DockRegion) => Promise<void>;
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
    /** 拖到活动栏时：图标插到这个工具之前（空则追加到末尾） */
    iconAnchor?: string,
  ) => void;
  /** 只在活动栏内调整图标顺序（同一侧拖动时用，不移动面板） */
  reorderIcon: (
    connectionId: string,
    tabId: string,
    side: SideRegionId,
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
  resizeSplit: (
    connectionId: string,
    region: DockRegion,
    splitId: string,
    index: number,
    deltaPercent: number,
  ) => void;
  setRegionSize: (
    connectionId: string,
    region: SideRegionId,
    size: number,
  ) => void;
  saveLayout: (connectionId: string, name: string) => LayoutTemplate;
  loadLayout: (connectionId: string, template: LayoutTemplate) => Promise<void>;
}

export const useDockStore = create<DockState>((set, get) => ({
  byConnection: {},

  ensureInit: async (connectionId) => {
    const existing = get().byConnection[connectionId];
    if (existing?.center) {
      // 已有布局：只补齐可能缺失的图标顺序（新注册的工具、旧模板导入的数据）
      const iconOrder = normalizeIconOrder(existing.iconOrder, existing.toolSides);
      if (!sameOrder(existing.iconOrder, iconOrder)) {
        set({
          byConnection: {
            ...get().byConnection,
            [connectionId]: { ...existing, iconOrder },
          },
        });
      }
      return;
    }
    const dock = existing ?? emptyDock();
    if (dock.center) return;

    const tools = getTools();
    const sideTool: Partial<Record<ToolSide, string>> = {};
    for (const t of tools) {
      const side = t.defaultSide ?? "center";
      if (!sideTool[side]) sideTool[side] = t.id;
    }

    const tabs = { ...dock.tabs };
    const toolSides = { ...dock.toolSides };
    for (const t of tools) {
      if (!toolSides[t.id]) toolSides[t.id] = t.defaultSide ?? "center";
    }
    const iconOrder = normalizeIconOrder(dock.iconOrder, toolSides);
    const sideTrees: Record<SideRegionId, LayoutNode | null> = {
      left: dock.left,
      right: dock.right,
      bottom: dock.bottom,
    };

    const centerToolId = sideTool.center ?? "terminal";
    const centerTab = await createTab(connectionId, centerToolId);
    tabs[centerTab.id] = centerTab;
    const center = createInitialLayout(centerTab.id);

    for (const side of ["left", "right", "bottom"] as SideRegionId[]) {
      if (sideTrees[side]) continue;
      const toolId = sideTool[side];
      if (toolId) {
        const tab = await createTab(connectionId, toolId);
        tabs[tab.id] = tab;
        sideTrees[side] = createInitialLayout(tab.id);
      }
    }

    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: {
          tabs,
          left: sideTrees.left,
          right: sideTrees.right,
          bottom: sideTrees.bottom,
          center,
          toolSides,
          iconOrder,
          leftWidth: dock.leftWidth,
          rightWidth: dock.rightWidth,
          bottomHeight: dock.bottomHeight,
        },
      },
    });
  },

  openTab: async (connectionId, toolTypeId, region, meta, iconAnchor) => {
    const tab = await createTab(connectionId, toolTypeId, meta);
    const dock = getDock(get(), connectionId);
    const tabs = { ...dock.tabs, [tab.id]: tab };
    // 图标跟随面板：把工具开到哪一侧，它的活动栏图标就归属哪一侧。
    // 与 moveTabToRegion 保持一致，否则「拖未打开的图标到另一侧」只会开面板、图标不动。
    const toolSides = { ...dock.toolSides, [toolTypeId]: region };
    // 拖到活动栏时按落点插入图标（iconAnchor 为空则追加到末尾）
    let iconOrder = normalizeIconOrder(dock.iconOrder, toolSides);
    if (region === "left" || region === "right") {
      iconOrder = placeIcon(iconOrder, region, toolTypeId, iconAnchor);
    }
    let tree = dock[region];
    if (!tree) {
      tree = createInitialLayout(tab.id);
    } else {
      const firstPaneId = findFirstPaneId(tree);
      tree = addTabToPane(tree, tab.id, firstPaneId);
    }
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, tabs, toolSides, iconOrder, [region]: tree },
      },
    });
    return tab.id;
  },

  splitInRegion: async (connectionId, region, paneId, toolTypeId, direction) => {
    const tab = await createTab(connectionId, toolTypeId);
    const dock = getDock(get(), connectionId);
    const tabs = { ...dock.tabs, [tab.id]: tab };
    let tree = dock[region];
    if (!tree) {
      tree = createInitialLayout(tab.id);
    } else {
      tree = splitPane(tree, paneId, tab.id, direction, false);
    }
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, tabs, [region]: tree },
      },
    });
    return tab.id;
  },

  closeTab: async (connectionId, tabId) => {
    const before = getDock(get(), connectionId);
    const tab = before.tabs[tabId];
    if (!tab) return;
    const tool = getTool(tab.toolTypeId);
    // onClose 是异步的（终端要走 IPC 关闭会话），await 期间状态可能已被其他操作改写。
    const allowed = await tool?.onClose?.(connectionId, tabId, tab);
    if (allowed === false) return;

    // 关键：await 之后重新取快照再写回。若沿用 await 之前那份快照，
    // 多个标签并发关闭时会互相覆盖，表现为「关闭其他」只关掉一个。
    const dock = getDock(get(), connectionId);
    if (!dock.tabs[tabId]) return;
    const tabs = { ...dock.tabs };
    delete tabs[tabId];

    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: {
          ...dock,
          tabs,
          left: removeTabFromTree(dock.left, tabId),
          right: removeTabFromTree(dock.right, tabId),
          bottom: removeTabFromTree(dock.bottom, tabId),
          center: removeTabFromTree(dock.center, tabId),
        },
      },
    });
  },

  closePaneTab: async (connectionId, region, paneId, tabId) => {
    const before = getDock(get(), connectionId);
    const tab = before.tabs[tabId];
    if (!tab) return;
    const tool = getTool(tab.toolTypeId);
    // 同 closeTab：await 前不能先拿快照，否则批量关闭会互相覆盖
    const allowed = await tool?.onClose?.(connectionId, tabId, tab);
    if (allowed === false) return;

    const dock = getDock(get(), connectionId);
    if (!dock.tabs[tabId]) return;
    const tabs = { ...dock.tabs };
    delete tabs[tabId];

    let tree = dock[region];
    if (tree) {
      const removed = removeTabFromPane(tree, tabId, paneId);
      tree = cleanupLayout(removed);
    }

    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, tabs, [region]: tree },
      },
    });
  },

  focusTab: (connectionId, tabId) => {
    const dock = getDock(get(), connectionId);
    for (const region of ["left", "right", "bottom", "center"] as DockRegion[]) {
      const tree = dock[region];
      if (!tree) continue;
      const paneId = findPaneWithTab(tree, tabId);
      if (!paneId) continue;
      set({
        byConnection: {
          ...get().byConnection,
          [connectionId]: {
            ...dock,
            [region]: setActiveInPane(tree, paneId, tabId),
          },
        },
      });
      return;
    }
  },

  setTabDirty: (connectionId, tabId, dirty) => {
    const dock = getDock(get(), connectionId);
    const tab = dock.tabs[tabId];
    if (!tab || !!tab.dirty === dirty) return;
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: {
          ...dock,
          tabs: { ...dock.tabs, [tabId]: { ...tab, dirty } },
        },
      },
    });
  },

  setActiveInRegion: (connectionId, region, paneId, tabId) => {
    const dock = getDock(get(), connectionId);
    const tree = dock[region];
    if (!tree) return;
    const newTree = setActiveInPane(tree, paneId, tabId);
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, [region]: newTree },
      },
    });
  },

  clearRegion: async (connectionId, region) => {
    const before = getDock(get(), connectionId);
    const tree = before[region];
    if (!tree) return;
    const ids = collectTabIds(tree);
    for (const tid of ids) {
      const tab = before.tabs[tid];
      const tool = tab && getTool(tab.toolTypeId);
      const allowed = await tool?.onClose?.(connectionId, tid, tab);
      if (allowed === false) return;
    }
    // 同上：await 之后重新取快照，避免把期间的变更覆盖掉
    const dock = getDock(get(), connectionId);
    const tabs = { ...dock.tabs };
    for (const tid of ids) delete tabs[tid];
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, tabs, [region]: null },
      },
    });
  },

  moveTabToPane: (connectionId, tabId, fromRegion, toRegion, sourcePaneId, targetPaneId) => {
    const dock = getDock(get(), connectionId);
    const fromTree = dock[fromRegion];
    const toTree = dock[toRegion];
    if (!fromTree || !toTree) return;

    if (fromRegion === toRegion) {
      const newTree = moveTabInTree(fromTree, tabId, sourcePaneId, targetPaneId);
      set({
        byConnection: {
          ...get().byConnection,
          [connectionId]: { ...dock, [fromRegion]: newTree },
        },
      });
      return;
    }

    const newFromTree = removeTabFromTree(fromTree, tabId);
    const newToTree = addTabToPane(toTree, tabId, targetPaneId);
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, [fromRegion]: newFromTree, [toRegion]: newToTree },
      },
    });
  },

  dropOnEdge: (connectionId, tabId, fromRegion, toRegion, sourcePaneId, targetPaneId, zone) => {
    const dock = getDock(get(), connectionId);
    const fromTree = dock[fromRegion];
    const toTree = dock[toRegion];
    if (!fromTree || !toTree) return;

    if (fromRegion === toRegion) {
      const newTree = dropOnEdgeInTree(fromTree, tabId, sourcePaneId, targetPaneId, zone);
      set({
        byConnection: {
          ...get().byConnection,
          [connectionId]: { ...dock, [fromRegion]: newTree },
        },
      });
      return;
    }

    const direction = zone === "left" || zone === "right" ? "horizontal" : "vertical";
    const newPaneFirst = zone === "left" || zone === "top";
    const newFromTree = removeTabFromTree(fromTree, tabId);
    const newToTree = splitPane(toTree, targetPaneId, tabId, direction, newPaneFirst);
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, [fromRegion]: newFromTree, [toRegion]: newToTree },
      },
    });
  },

  moveTabToRegion: (connectionId, tabId, fromRegion, toRegion, iconAnchor) => {
    if (fromRegion === toRegion) return;
    const dock = getDock(get(), connectionId);
    const fromTree = dock[fromRegion];
    if (!fromTree) return;

    const tab = dock.tabs[tabId];
    const toolSides = { ...dock.toolSides };
    if (tab) toolSides[tab.toolTypeId] = toRegion;
    // 图标跟随面板，并落到拖放位置
    let iconOrder = normalizeIconOrder(dock.iconOrder, toolSides);
    if (tab && (toRegion === "left" || toRegion === "right")) {
      iconOrder = placeIcon(iconOrder, toRegion, tab.toolTypeId, iconAnchor);
    }

    const newFromTree = removeTabFromTree(fromTree, tabId);
    let newToTree = dock[toRegion];
    if (!newToTree) {
      newToTree = createInitialLayout(tabId);
    } else {
      const firstPaneId = findFirstPaneId(newToTree);
      newToTree = addTabToPane(newToTree, tabId, firstPaneId);
    }

    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, toolSides, iconOrder, [fromRegion]: newFromTree, [toRegion]: newToTree },
      },
    });
  },

  reorderIcon: (connectionId, tabId, side, iconAnchor) => {
    const dock = getDock(get(), connectionId);
    const toolTypeId = dock.tabs[tabId]?.toolTypeId;
    if (!toolTypeId) return;
    const iconOrder = placeIcon(
      normalizeIconOrder(dock.iconOrder, dock.toolSides),
      side,
      toolTypeId,
      iconAnchor,
    );
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, iconOrder },
      },
    });
  },

  dropOnTab: (connectionId, tabId, fromRegion, toRegion, sourcePaneId, targetPaneId, index) => {
    const dock = getDock(get(), connectionId);
    const fromTree = dock[fromRegion];
    const toTree = dock[toRegion];
    if (!fromTree || !toTree) return;

    if (fromRegion === toRegion) {
      let tree: LayoutNode;
      if (sourcePaneId === targetPaneId) {
        tree = reorderTabInPane(fromTree, targetPaneId, tabId, index);
      } else {
        const removed = removeTabFromPane(fromTree, tabId, sourcePaneId);
        tree = cleanupLayout(insertTabToPane(removed, tabId, targetPaneId, index)) ?? removed;
      }
      if (tree === fromTree) return;
      set({
        byConnection: {
          ...get().byConnection,
          [connectionId]: { ...dock, [fromRegion]: tree },
        },
      });
      return;
    }

    const tab = dock.tabs[tabId];
    const toolSides = { ...dock.toolSides };
    if (tab) toolSides[tab.toolTypeId] = toRegion;

    const newFromTree = removeTabFromTree(fromTree, tabId);
    const newToTree = insertTabToPane(toTree, tabId, targetPaneId, index);
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: {
          ...dock,
          toolSides,
          [fromRegion]: newFromTree,
          [toRegion]: newToTree,
        },
      },
    });
  },

  resizeSplit: (connectionId, region, splitId, index, deltaPercent) => {
    const dock = getDock(get(), connectionId);
    const tree = dock[region];
    if (!tree) return;
    const newTree = updateSplitSizes(tree, splitId, index, deltaPercent);
    if (newTree === tree) return;
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, [region]: newTree },
      },
    });
  },

  setRegionSize: (connectionId, region, size) => {
    const dock = getDock(get(), connectionId);
    const key = region === "left" ? "leftWidth" : region === "right" ? "rightWidth" : "bottomHeight";
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: { ...dock, [key]: size },
      },
    });
  },

  saveLayout: (connectionId, name) => {
    const dock = getDock(get(), connectionId);
    return {
      id: genId("layout"),
      name,
      toolSides: { ...dock.toolSides },
      iconOrder: normalizeIconOrder(dock.iconOrder, dock.toolSides),
      left: treeToBlueprint(dock.left, dock.tabs),
      right: treeToBlueprint(dock.right, dock.tabs),
      bottom: treeToBlueprint(dock.bottom, dock.tabs),
      center: treeToBlueprint(dock.center, dock.tabs),
      leftWidth: dock.leftWidth,
      rightWidth: dock.rightWidth,
      bottomHeight: dock.bottomHeight,
    };
  },

  loadLayout: async (connectionId, template) => {
    const dock = getDock(get(), connectionId);
    for (const tabId of Object.keys(dock.tabs)) {
      const tab = dock.tabs[tabId];
      const tool = getTool(tab.toolTypeId);
      const allowed = await tool?.onClose?.(connectionId, tabId, tab);
      if (allowed === false) return;
    }
    const [leftR, rightR, bottomR, centerR] = await Promise.all([
      blueprintToTree(template.left, connectionId),
      blueprintToTree(template.right, connectionId),
      blueprintToTree(template.bottom, connectionId),
      blueprintToTree(template.center, connectionId),
    ]);
    const tabs: Record<string, TabInstance> = {};
    for (const r of [leftR, rightR, bottomR, centerR]) Object.assign(tabs, r.tabs);
    set({
      byConnection: {
        ...get().byConnection,
        [connectionId]: {
          tabs,
          left: leftR.tree,
          right: rightR.tree,
          bottom: bottomR.tree,
          center: centerR.tree,
          toolSides: { ...template.toolSides },
          iconOrder: normalizeIconOrder(template.iconOrder, template.toolSides),
          leftWidth: template.leftWidth,
          rightWidth: template.rightWidth,
          bottomHeight: template.bottomHeight,
        },
      },
    });
  },
}));
