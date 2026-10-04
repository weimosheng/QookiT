import { create } from "zustand";
import { connectionService } from "../services/connectionService";
import { systemInfoService } from "../services/systemInfoService";
import { useHostsStore } from "./hostsStore";

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
  reorderTabs: (fromId: string, toId: string, insertBefore: boolean) => void;
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
      void systemInfoService.get(info.host_id, info.connection_id).then((sysInfo) => {
        useHostsStore.setState((s) => ({
          hosts: s.hosts.map((h) =>
            h.id === info.host_id ? { ...h, system_info: sysInfo } : h,
          ),
        }));
      }).catch(() => {});
      return info.connection_id;
    } finally {
      set({ connecting: false });
    }
  },
  disconnect: async (connectionId) => {
    try {
      await connectionService.disconnect(connectionId);
    } finally {
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
    }
  },
  setActive: (connectionId) => {
    set({ activeTabId: connectionId });
  },
  reorderTabs: (fromId, toId, insertBefore) => {
    set((s) => {
      const fromIdx = s.tabs.findIndex((t) => t.connectionId === fromId);
      const toIdx = s.tabs.findIndex((t) => t.connectionId === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return {};
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIdx, 1);
      const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      tabs.splice(insertBefore ? adjustedToIdx : adjustedToIdx + 1, 0, moved);
      return { tabs };
    });
  },
}));
