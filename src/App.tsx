import { TitleBar } from "./components/TitleBar";
import { ConnectionCenter } from "./components/ConnectionCenter";
import { DialogHost } from "./components/DialogHost";
import { ConnectionWorkspace } from "./features/connection/ConnectionWorkspace";
import { useConnectionsStore } from "./stores/connectionsStore";

function App() {
  const { tabs, activeTabId } = useConnectionsStore();

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
    </div>
  );
}

export default App;
