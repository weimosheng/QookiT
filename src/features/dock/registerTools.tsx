import { registerTool } from "./toolRegistry";
import { TerminalView, discardTerminalBuffer } from "../terminal/TerminalView";
import { FileExplorer } from "../sftp/FileExplorer";
import { SearchPanel } from "../search/SearchPanel";
import { CommandPalette } from "../command/CommandPalette";
import { PerformancePanel } from "../performance/PerformancePanel";
import { EditorPanel } from "../editor/EditorPanel";
import { terminalService } from "../../services/terminalService";
import { dialogConfirm } from "../../lib/dialog";
import {
  Terminal,
  Folder,
  Search,
  Command as CommandIcon,
  Gauge,
  FileCode,
} from "lucide-react";

registerTool({
  id: "terminal",
  name: "终端",
  icon: Terminal,
  defaultTitle: "终端",
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
  name: "文件管理器",
  icon: Folder,
  defaultTitle: "文件",
  defaultSide: "left",
  render: (connId) => <FileExplorer connectionId={connId} />,
});

registerTool({
  id: "search",
  name: "搜索",
  icon: Search,
  defaultTitle: "搜索",
  defaultSide: "left",
  render: (connId) => <SearchPanel connectionId={connId} />,
});

registerTool({
  id: "commands",
  name: "命令面板",
  icon: CommandIcon,
  defaultTitle: "命令",
  defaultSide: "left",
  render: (connId) => <CommandPalette connectionId={connId} />,
});

registerTool({
  id: "performance",
  name: "性能",
  icon: Gauge,
  defaultTitle: "性能",
  defaultSide: "right",
  render: (connId) => <PerformancePanel connectionId={connId} />,
});

registerTool({
  id: "editor",
  name: "编辑器",
  icon: FileCode,
  defaultTitle: "编辑器",
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
      "未保存的更改",
      `"${tab.title}" 有未保存的更改，确定关闭吗？`,
      true,
    );
  },
});
