import type { ComponentType, ReactNode } from "react";
import type { TabInstance } from "./dockStore";

export type ToolSide = "left" | "right" | "bottom" | "center";

export type TabMeta = Record<string, unknown>;

export interface ToolType {
  id: string;
  name: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  defaultTitle: string;
  defaultSide?: ToolSide;
  excludeFromLayout?: boolean;
  render: (
    connectionId: string,
    instanceId: string,
    tab?: TabInstance,
  ) => ReactNode;
  createInstance?: (connectionId: string, meta?: TabMeta) => Promise<string>;
  onClose?: (
    connectionId: string,
    instanceId: string,
    tab?: TabInstance,
  ) => boolean | void | Promise<boolean | void>;
  singleton?: boolean;
}

const tools = new Map<string, ToolType>();

export function registerTool(tool: ToolType) {
  tools.set(tool.id, tool);
}

export function unregisterTool(id: string) {
  tools.delete(id);
}

export function getTools(): ToolType[] {
  return Array.from(tools.values());
}

export function getTool(id: string): ToolType | undefined {
  return tools.get(id);
}
