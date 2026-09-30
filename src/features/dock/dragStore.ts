import { create } from "zustand";
import type { DockRegion } from "./dockStore";

export interface DragInfo {
  connectionId: string;
  /** 拖拽起点所在区域 */
  sourceRegion: DockRegion;
  /** 拖动已有标签时：标签 id，及其所在面板 id */
  tabId?: string;
  sourcePaneId?: string;
  /** 拖动活动栏图标、而该工具尚未打开时：要在落点区域打开的工具 id */
  toolTypeId?: string;
}

interface DragState {
  drag: DragInfo | null;
  start: (info: DragInfo) => void;
  clear: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  drag: null,
  start: (info) => set({ drag: info }),
  clear: () => set({ drag: null }),
}));
