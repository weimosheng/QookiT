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
  cleanupLayout,
  updateSplitSizes,
  genId,
  type PaneNode,
  type SplitNode,
} from "./dockLayout";
import { getTool, getTools, type ToolSide } from "./toolRegistry";
import type { Blueprint, LayoutTemplate } from "./layoutStore";

export type DockRegion = "left" | "right" | "bottom" | "center";
export type SideRegionId = "left" | "right" | "bottom";

export interface TabInstance {
  id: string;
  toolTypeId: string;
  title: string;
}

interface ConnectionDock {
  tabs: Record<string, TabInstance>;
  left: LayoutNode | null;
  right: LayoutNode | null;
  bottom: LayoutNode | null;
  center: LayoutNode | null;
  toolSides: Record<string, DockRegion>;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
}

function emptyDock(): ConnectionDock {
  return { tabs: {}, left: null, right: null, bottom: null, center: null, toolSides: {}, leftWidth: 320, rightWidth: 320, bottomHeight: 192 };
}

async function createTab(
  connectionId: string,
  toolTypeId: string,
): Promise<TabInstance> {
  const tool = getTool(toolTypeId);
  const id = tool?.createInstance
    ? await tool.createInstance(connectionId)
    : genId("tab");
  return { id, toolTypeId, title: tool?.defaultTitle ?? toolTypeId };
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
    const tools = tree.tabIds
      .map((id) => tabs[id]?.toolTypeId)
      .filter((t): t is string => !!t);
    const activeIndex = tree.activeTabId
      ? tree.tabIds.indexOf(tree.activeTabId)
      : -1;
    return { type: "pane", tools, activeIndex: Math.max(0, activeIndex) };
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
      const tab = await createTab(connectionId, toolTypeId);
      tabs[tab.id] = tab;
      tabIds.push(tab.id);
    }
    if (tabIds.length === 0) return { tree: null, tabs: {} };
    const activeTabId = tabIds[blueprint.activeIndex] ?? tabIds[0];
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
  ) => Promise<string>;
  splitInRegion: (
    connectionId: string,
    region: DockRegion,
    paneId: string,
    toolTypeId: string,
    direction: "horizontal" | "vertical",
  ) => Promise<string>;
  closeTab: (connectionId: string, tabId: string) => void;
  closePaneTab: (
    connectionId: string,
    region: DockRegion,
    paneId: string,
    tabId: string,
  ) => void;
  setActiveInRegion: (
    connectionId: string,
    region: DockRegion,
    paneId: string,
    tabId: string,
  ) => void;
  clearRegion: (connectionId: string, region: DockRegion) => void;
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
    if (existing && existing.center) return;
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
          leftWidth: dock.leftWidth,
          rightWidth: dock.rightWidth,
          bottomHeight: dock.bottomHeight,
        },
      },
    });
  },

  openTab: async (connectionId, toolTypeId, region) => {
    const tab = await createTab(connectionId, toolTypeId);
    const dock = getDock(get(), connectionId);
    const tabs = { ...dock.tabs, [tab.id]: tab };
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
        [connectionId]: { ...dock, tabs, [region]: tree },
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

  closeTab: (connectionId, tabId) => {
    const dock = getDock(get(), connectionId);
    const tab = dock.tabs[tabId];
    if (!tab) return;
    const tool = getTool(tab.toolTypeId);
    void tool?.onClose?.(connectionId, tabId);

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

  closePaneTab: (connectionId, region, paneId, tabId) => {
    const dock = getDock(get(), connectionId);
    const tab = dock.tabs[tabId];
    if (!tab) return;
    const tool = getTool(tab.toolTypeId);
    void tool?.onClose?.(connectionId, tabId);

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

  clearRegion: (connectionId, region) => {
    const dock = getDock(get(), connectionId);
    const tree = dock[region];
    if (!tree) return;
    const tabs = { ...dock.tabs };
    for (const tid of collectTabIds(tree)) {
      const tab = tabs[tid];
      const tool = tab && getTool(tab.toolTypeId);
      void tool?.onClose?.(connectionId, tid);
      delete tabs[tid];
    }
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

  moveTabToRegion: (connectionId, tabId, fromRegion, toRegion) => {
    if (fromRegion === toRegion) return;
    const dock = getDock(get(), connectionId);
    const fromTree = dock[fromRegion];
    if (!fromTree) return;

    const tab = dock.tabs[tabId];
    const toolSides = { ...dock.toolSides };
    if (tab) toolSides[tab.toolTypeId] = toRegion;

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
        [connectionId]: { ...dock, toolSides, [fromRegion]: newFromTree, [toRegion]: newToTree },
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
      void tool?.onClose?.(connectionId, tabId);
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
          leftWidth: template.leftWidth,
          rightWidth: template.rightWidth,
          bottomHeight: template.bottomHeight,
        },
      },
    });
  },
}));
