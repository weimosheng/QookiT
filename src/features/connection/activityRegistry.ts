import type { ReactNode } from "react";

export interface ActivityDefinition {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  render: (connectionId: string) => ReactNode;
}

const activities = new Map<string, ActivityDefinition>();

export function registerActivity(activity: ActivityDefinition) {
  activities.set(activity.id, activity);
}

export function unregisterActivity(id: string) {
  activities.delete(id);
}

export function getActivities(): ActivityDefinition[] {
  return Array.from(activities.values());
}

export function getActivity(id: string): ActivityDefinition | undefined {
  return activities.get(id);
}
