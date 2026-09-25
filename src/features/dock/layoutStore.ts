import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getTools } from "./toolRegistry";
import type { DockRegion } from "./dockStore";

export interface PaneBlueprint {
  type: "pane";
  tools: string[];
  activeIndex: number;
}

export interface SplitBlueprint {
  type: "split";
  direction: "horizontal" | "vertical";
  children: Blueprint[];
  sizes: number[];
}

export type Blueprint = PaneBlueprint | SplitBlueprint;

export interface LayoutTemplate {
  id: string;
  name: string;
  toolSides: Record<string, DockRegion>;
  left: Blueprint | null;
  right: Blueprint | null;
  bottom: Blueprint | null;
  center: Blueprint | null;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
}

export function createDefaultTemplate(): LayoutTemplate {
  const tools = getTools();
  const toolSides: Record<string, DockRegion> = {};
  const sideTools: Record<DockRegion, string[]> = { left: [], right: [], bottom: [], center: [] };
  for (const t of tools) {
    if (t.excludeFromLayout) continue;
    const side = (t.defaultSide ?? "center") as DockRegion;
    toolSides[t.id] = side;
    sideTools[side].push(t.id);
  }
  const make = (list: string[]): Blueprint | null =>
    list.length === 0 ? null : { type: "pane", tools: list, activeIndex: 0 };
  return {
    id: "__default__",
    name: "默认布局",
    toolSides,
    left: make(sideTools.left),
    right: make(sideTools.right),
    bottom: make(sideTools.bottom),
    center: make(sideTools.center),
    leftWidth: 320,
    rightWidth: 320,
    bottomHeight: 192,
  };
}

interface LayoutTemplateState {
  templates: LayoutTemplate[];
  loaded: boolean;
  init: () => Promise<void>;
  save: (template: LayoutTemplate) => Promise<void>;
  remove: (id: string) => Promise<void>;
  importTemplates: (newTemplates: LayoutTemplate[]) => Promise<void>;
}

async function readFromDisk(): Promise<LayoutTemplate[]> {
  try {
    const raw = await invoke<string>("read_layout_templates");
    return JSON.parse(raw) as LayoutTemplate[];
  } catch {
    return [];
  }
}

async function writeToDisk(templates: LayoutTemplate[]): Promise<void> {
  try {
    await invoke("write_layout_templates", { content: JSON.stringify(templates) });
  } catch {
    // ignore
  }
}

export const useLayoutStore = create<LayoutTemplateState>((set, get) => ({
  templates: [],
  loaded: false,
  init: async () => {
    if (get().loaded) return;
    const templates = await readFromDisk();
    set({ templates, loaded: true });
  },
  save: async (template) => {
    const state = get();
    const idx = state.templates.findIndex((t) => t.id === template.id);
    const templates =
      idx >= 0
        ? state.templates.map((t) => (t.id === template.id ? template : t))
        : [...state.templates, template];
    set({ templates });
    await writeToDisk(templates);
  },
  remove: async (id) => {
    const templates = get().templates.filter((t) => t.id !== id);
    set({ templates });
    await writeToDisk(templates);
  },
  importTemplates: async (newTemplates) => {
    const state = get();
    const existingIds = new Set(state.templates.map((t) => t.id));
    const toAdd = newTemplates.filter((t) => !existingIds.has(t.id));
    const templates = [...state.templates, ...toAdd];
    set({ templates });
    await writeToDisk(templates);
  },
}));
