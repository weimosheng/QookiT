import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { ConnectionCenter } from "./components/ConnectionCenter";
import { DialogHost } from "./components/DialogHost";
import { HostKeyVerifyDialog } from "./components/HostKeyVerifyDialog";
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { useCloseHandler } from "./hooks/useCloseHandler";
import { ConnectionWorkspace } from "./features/connection/ConnectionWorkspace";
import { useConnectionsStore } from "./stores/connectionsStore";
import { usePackagingStore } from "./stores/packagingStore";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";

function App() {
  const { tabs, activeTabId } = useConnectionsStore();
  useGlobalShortcuts();
  useCloseHandler();

  // 判断是否为 Microsoft Store / MSIX 安装，决定是否提供自更新入口。
  useEffect(() => {
    void usePackagingStore.getState().init();
  }, []);

  // 禁用浏览器默认右键菜单（不影响组件自定义 onContextMenu）。
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TitleBar />
      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            opacity: activeTabId === null ? 1 : 0,
            pointerEvents: activeTabId === null ? "auto" : "none",
            zIndex: activeTabId === null ? 10 : 0,
          }}
        >
          <ConnectionCenter />
        </div>
        {tabs.map((tab) => {
          const active = tab.connectionId === activeTabId;
          return (
            <div
              key={tab.connectionId}
              className="absolute inset-0"
              style={{
                opacity: active ? 1 : 0,
                pointerEvents: active ? "auto" : "none",
                zIndex: active ? 10 : 0,
              }}
            >
              <ConnectionWorkspace connectionId={tab.connectionId} />
            </div>
          );
        })}
      </div>
      <DialogHost />
      <HostKeyVerifyDialog />
      <CloseConfirmDialog />
    </div>
  );
}

export default App;
