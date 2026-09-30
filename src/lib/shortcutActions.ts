import { useConnectionsStore } from "../stores/connectionsStore";
import { useDockStore, findTabByTool, type DockRegion } from "../features/dock/dockStore";
import { useThemeStore } from "../stores/themeStore";
import { getTool } from "../features/dock/toolRegistry";

export type ShortcutGroup = "general" | "tools" | "connection";

export interface ShortcutAction {
  id: string;
  label: string;
  group: ShortcutGroup;
  run: () => void | Promise<void>;
}

/** 在当前连接里打开或聚焦某工具：已有标签则聚焦，否则在默认侧新建。 */
async function openOrFocusTool(toolTypeId: string): Promise<void> {
  const connId = useConnectionsStore.getState().activeTabId;
  if (!connId) return;
  const dockStore = useDockStore.getState();
  const dock = dockStore.byConnection[connId];
  if (!dock) return;
  const regions: DockRegion[] = ["left", "right", "bottom", "center"];
  for (const region of regions) {
    const existingId = findTabByTool(dock[region], dock.tabs, toolTypeId);
    if (existingId) {
      dockStore.focusTab(connId, existingId);
      return;
    }
  }
  const tool = getTool(toolTypeId);
  const region = (tool?.defaultSide ?? "center") as DockRegion;
  await dockStore.openTab(connId, toolTypeId, region);
}

/** 在连接标签之间循环切换。 */
function cycleConnection(delta: number): void {
  const { tabs, activeTabId, setActive } = useConnectionsStore.getState();
  if (tabs.length < 2) return;
  const idx = tabs.findIndex((t) => t.connectionId === activeTabId);
  const next = (idx + delta + tabs.length) % tabs.length;
  setActive(tabs[next].connectionId);
}

export const shortcutActions: ShortcutAction[] = [
  {
    id: "toggleTheme",
    label: "切换主题",
    group: "general",
    run: () => useThemeStore.getState().toggle(),
  },
  {
    id: "newTerminal",
    label: "新建终端",
    group: "tools",
    run: async () => {
      const connId = useConnectionsStore.getState().activeTabId;
      if (!connId) return;
      await useDockStore.getState().openTab(connId, "terminal", "center");
    },
  },
  {
    id: "openFiles",
    label: "文件管理器",
    group: "tools",
    run: () => openOrFocusTool("files"),
  },
  {
    id: "openSearch",
    label: "搜索",
    group: "tools",
    run: () => openOrFocusTool("search"),
  },
  {
    id: "openCommands",
    label: "命令面板",
    group: "tools",
    run: () => openOrFocusTool("commands"),
  },
  {
    id: "openEditor",
    label: "编辑器",
    group: "tools",
    run: () => openOrFocusTool("editor"),
  },
  {
    id: "openTransfer",
    label: "传输队列",
    group: "tools",
    run: () => openOrFocusTool("transfer"),
  },
  {
    id: "openPerformance",
    label: "性能",
    group: "tools",
    run: () => openOrFocusTool("performance"),
  },
  {
    id: "nextConnection",
    label: "下一个连接",
    group: "connection",
    run: () => cycleConnection(1),
  },
  {
    id: "prevConnection",
    label: "上一个连接",
    group: "connection",
    run: () => cycleConnection(-1),
  },
];

const actionMap = new Map(shortcutActions.map((a) => [a.id, a]));

export function getShortcutAction(id: string): ShortcutAction | undefined {
  return actionMap.get(id);
}
