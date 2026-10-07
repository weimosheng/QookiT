import type { ComponentType, ReactNode } from "react";
import { cn } from "../lib/cn";

export const panelHeaderClass =
  "flex items-center justify-between gap-2 border-b border-border/50 bg-background/60 px-3 py-2 backdrop-blur-md";

export const panelHeaderBtnClass =
  "flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-default-soft hover:text-foreground";

interface PanelHeaderProps {
  icon?: ComponentType<{ size?: number; className?: string }>;
  title?: string;
  leftExtra?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PanelHeader({
  icon: Icon,
  title,
  leftExtra,
  children,
  className,
}: PanelHeaderProps) {
  return (
    <div className={cn(panelHeaderClass, className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={15} className="text-accent" />}
        {title && (
          <span className="text-xs font-medium text-foreground">{title}</span>
        )}
        {leftExtra}
      </div>
      {children && <div className="flex items-center gap-1">{children}</div>}
    </div>
  );
}
