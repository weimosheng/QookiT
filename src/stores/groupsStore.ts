import { create } from "zustand";
import type { Group } from "../types/group";
import { groupService } from "../services/groupService";
import { useHostsStore } from "./hostsStore";

interface GroupsState {
  groups: Group[];
  loading: boolean;
  load: () => Promise<void>;
  add: (group: Group) => Promise<void>;
  update: (group: Group) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useGroupsStore = create<GroupsState>((set) => ({
  groups: [],
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const groups = await groupService.list();
      set({ groups });
    } finally {
      set({ loading: false });
    }
  },
  add: async (group) => {
    const groups = await groupService.add(group);
    set({ groups });
  },
  update: async (group) => {
    const { groups, hosts } = await groupService.update(group);
    set({ groups });
    useHostsStore.setState({ hosts });
  },
  remove: async (id) => {
    const { groups, hosts } = await groupService.delete(id);
    set({ groups });
    useHostsStore.setState({ hosts });
  },
}));
