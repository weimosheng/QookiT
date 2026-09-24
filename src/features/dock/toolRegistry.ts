import type { ComponentType, ReactNode } from "react";

export type ToolSide = "left" | "right" | "bottom" | "center";

export interface ToolType {
  id: string;
  name: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  defaultTitle: string;
  defaultSide?: ToolSide;
  render: (connectionId: string, instanceId: string) => ReactNode;
  createInstance?: (connectionId: string) => Promise<string>;
  onClose?: (connectionId: string, instanceId: string) => void | Promise<void>;
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
