import { create } from "zustand";
import type { Host } from "../types/host";
import { hostService } from "../services/hostService";

interface HostsState {
  hosts: Host[];
  loading: boolean;
  load: () => Promise<void>;
  add: (host: Host) => Promise<void>;
  update: (host: Host) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useHostsStore = create<HostsState>((set) => ({
  hosts: [],
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const hosts = await hostService.list();
      set({ hosts });
    } finally {
      set({ loading: false });
    }
  },
  add: async (host) => {
    const hosts = await hostService.add(host);
    set({ hosts });
  },
  update: async (host) => {
    const hosts = await hostService.update(host);
    set({ hosts });
  },
  remove: async (id) => {
    const hosts = await hostService.delete(id);
    set({ hosts });
  },
}));
