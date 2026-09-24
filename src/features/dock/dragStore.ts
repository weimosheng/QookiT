import { create } from "zustand";
import type { DockRegion } from "./dockStore";

export interface DragInfo {
  connectionId: string;
  tabId: string;
  sourceRegion: DockRegion;
  sourcePaneId: string;
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
