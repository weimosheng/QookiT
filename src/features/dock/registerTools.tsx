import { registerTool } from "./toolRegistry";
import { TerminalView, discardTerminalBuffer } from "../terminal/TerminalView";
import { FileExplorer } from "../sftp/FileExplorer";
import { SearchPanel } from "../search/SearchPanel";
import { CommandPalette } from "../command/CommandPalette";
import { PerformancePanel } from "../performance/PerformancePanel";
import { EditorPanel } from "../editor/EditorPanel";
import { TransferQueuePanel } from "../transfer/TransferQueuePanel";
import { terminalService } from "../../services/terminalService";
import { dialogConfirm } from "../../lib/dialog";
import i18n from "../../lib/i18n";
import {
  Terminal,
  Folder,
  Search,
  Command as CommandIcon,
  Gauge,
  FileCode,
  ListTree,
} from "lucide-react";

registerTool({
  id: "terminal",
  nameKey: "dock:tool_terminal",
  icon: Terminal,
  defaultTitleKey: "dock:tool_terminal",
  defaultSide: "center",
  render: (connId, instId) => (
    <TerminalView connectionId={connId} terminalId={instId} />
  ),
  createInstance: (connId) => terminalService.open(connId, 80, 24),
  onClose: (connId, instId) => {
    discardTerminalBuffer(instId);
    terminalService.close(connId, instId);
  },
});

registerTool({
  id: "files",
  nameKey: "dock:tool_files",
  icon: Folder,
  defaultTitleKey: "dock:file_title",
  defaultSide: "left",
  render: (connId) => <FileExplorer connectionId={connId} />,
});

registerTool({
  id: "search",
  nameKey: "dock:tool_search",
  icon: Search,
  defaultTitleKey: "dock:tool_search",
  defaultSide: "left",
  render: (connId) => <SearchPanel connectionId={connId} />,
});

registerTool({
  id: "commands",
  nameKey: "dock:tool_commands",
  icon: CommandIcon,
  defaultTitleKey: "dock:command_title",
  defaultSide: "left",
  render: (connId) => <CommandPalette connectionId={connId} />,
});

registerTool({
  id: "performance",
  nameKey: "dock:tool_performance",
  icon: Gauge,
  defaultTitleKey: "dock:tool_performance",
  defaultSide: "right",
  render: (connId) => <PerformancePanel connectionId={connId} />,
});

registerTool({
  id: "editor",
  nameKey: "dock:tool_editor",
  icon: FileCode,
  defaultTitleKey: "dock:tool_editor",
  defaultSide: "center",
  excludeFromLayout: true,
  render: (connId, instId, tab) => (
    <EditorPanel
      connectionId={connId}
      instanceId={instId}
      path={typeof tab?.meta?.path === "string" ? tab.meta.path : ""}
    />
  ),
  onClose: async (_connId, _instId, tab) => {
    if (!tab?.dirty) return true;
    return dialogConfirm(
      i18n.t("dock:unsaved_changes"),
      i18n.t("dock:unsaved_changes_msg", { title: tab.title }),
      true,
    );
  },
});

registerTool({
  id: "transfer",
  nameKey: "dock:tool_transfer",
  icon: ListTree,
  defaultTitleKey: "dock:transfer_title",
  defaultSide: "bottom",
  render: (connId) => <TransferQueuePanel connectionId={connId} />,
});
