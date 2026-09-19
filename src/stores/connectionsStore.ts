import { create } from "zustand";
import { connectionService } from "../services/connectionService";

export interface ConnectionTab {
  connectionId: string;
  hostId: string;
  hostName: string;
}

interface ConnectionsState {
  tabs: ConnectionTab[];
  activeTabId: string | null;
  connecting: boolean;
  connect: (hostId: string) => Promise<string>;
  disconnect: (connectionId: string) => Promise<void>;
  setActive: (connectionId: string | null) => void;
}

export const useConnectionsStore = create<ConnectionsState>((set) => ({
  tabs: [],
  activeTabId: null,
  connecting: false,
  connect: async (hostId) => {
    set({ connecting: true });
    try {
      const info = await connectionService.connect(hostId);
      const tab: ConnectionTab = {
        connectionId: info.connection_id,
        hostId: info.host_id,
        hostName: info.host_name,
      };
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: info.connection_id,
      }));
      return info.connection_id;
    } finally {
      set({ connecting: false });
    }
  },
  disconnect: async (connectionId) => {
    await connectionService.disconnect(connectionId);
    set((s) => {
      const tabs = s.tabs.filter((t) => t.connectionId !== connectionId);
      const activeTabId =
        s.activeTabId === connectionId
          ? tabs.length > 0
            ? tabs[tabs.length - 1].connectionId
            : null
          : s.activeTabId;
      return { tabs, activeTabId };
    });
  },
  setActive: (connectionId) => {
    set({ activeTabId: connectionId });
  },
}));
