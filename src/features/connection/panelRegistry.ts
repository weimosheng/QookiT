import type { ReactNode } from "react";

export interface PanelDefinition {
  id: string;
  name: string;
  icon?: React.ComponentType<{ size?: number }>;
  defaultSide: "left" | "right";
  render: (connectionId: string) => ReactNode;
}

const panels = new Map<string, PanelDefinition>();

export function registerPanel(panel: PanelDefinition) {
  panels.set(panel.id, panel);
}

export function unregisterPanel(id: string) {
  panels.delete(id);
}

export function getPanels(): PanelDefinition[] {
  return Array.from(panels.values());
}

export function getPanel(id: string): PanelDefinition | undefined {
  return panels.get(id);
}
