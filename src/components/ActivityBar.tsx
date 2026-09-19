import { useState } from "react";
import { getActivities } from "../features/connection/activityRegistry";
import { cn } from "../lib/cn";

interface ActivityBarProps {
  connectionId: string;
  defaultActivityId?: string;
}

export function ActivityBar({ connectionId, defaultActivityId = "files" }: ActivityBarProps) {
  const [activeId, setActiveId] = useState(defaultActivityId);
  const activities = getActivities();
  const active = activities.find((a) => a.id === activeId) ?? activities[0];

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex w-12 flex-shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2">
        {activities.map((a) => {
          const Icon = a.icon;
          const isActive = a.id === active?.id;
          return (
            <button
              key={a.id}
              type="button"
              title={a.name}
              onClick={() => setActiveId(a.id)}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-md transition-colors",
                isActive
                  ? "bg-accent-soft text-accent"
                  : "text-foreground hover:bg-default-soft",
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
              )}
              <Icon size={22} />
            </button>
          );
        })}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        {active ? active.render(connectionId) : null}
      </div>
    </div>
  );
}
