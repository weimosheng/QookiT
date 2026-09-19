import { Group, Panel, Separator } from "react-resizable-panels";
import { FileExplorer } from "../sftp/FileExplorer";
import { TerminalManager } from "../terminal/TerminalManager";
import { CommandPalette } from "../command/CommandPalette";
import { registerPanel, getPanels } from "./panelRegistry";
import { registerActivity } from "./activityRegistry";
import { ActivityBar } from "../../components/ActivityBar";
import { Folder, Search, Gauge, Blocks, Command } from "lucide-react";

registerPanel({
  id: "sftp",
  name: "文件",
  defaultSide: "left",
  render: (id) => <ActivityBar connectionId={id} />,
});
registerPanel({
  id: "terminal",
  name: "终端",
  defaultSide: "right",
  render: (id) => <TerminalManager connectionId={id} />,
});

registerActivity({
  id: "files",
  name: "文件管理器",
  icon: Folder,
  render: (id) => <FileExplorer connectionId={id} />,
});
registerActivity({
  id: "search",
  name: "搜索",
  icon: Search,
  render: () => <EmptyActivity title="搜索" />,
});
registerActivity({
  id: "commands",
  name: "命令面板",
  icon: Command,
  render: (id) => <CommandPalette connectionId={id} />,
});
registerActivity({
  id: "performance",
  name: "性能",
  icon: Gauge,
  render: () => <EmptyActivity title="性能面板" />,
});
registerActivity({
  id: "extensions",
  name: "扩展",
  icon: Blocks,
  render: () => <EmptyActivity title="扩展商店" />,
});

function EmptyActivity({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted">{title}功能开发中</p>
    </div>
  );
}

interface ConnectionWorkspaceProps {
  connectionId: string;
}

export function ConnectionWorkspace({ connectionId }: ConnectionWorkspaceProps) {
  const panels = getPanels();
  const leftPanels = panels.filter((p) => p.defaultSide === "left");
  const rightPanels = panels.filter((p) => p.defaultSide === "right");

  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize="30%" minSize="15%">
        <div className="flex h-full flex-col">
          {leftPanels.map((p) => (
            <div key={p.id} className="flex-1 overflow-hidden">
              {p.render(connectionId)}
            </div>
          ))}
        </div>
      </Panel>
      <Separator className="w-1 bg-border hover:bg-accent-soft transition-colors" />
      <Panel defaultSize="70%" minSize="30%">
        <div className="flex h-full flex-col">
          {rightPanels.map((p) => (
            <div key={p.id} className="flex-1 overflow-hidden">
              {p.render(connectionId)}
            </div>
          ))}
        </div>
      </Panel>
    </Group>
  );
}
