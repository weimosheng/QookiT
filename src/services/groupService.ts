import { invoke } from "@tauri-apps/api/core";
import type { Group } from "../types/group";
import type { Host } from "../types/host";

export interface GroupMutationResult {
  groups: Group[];
  hosts: Host[];
}

export const groupService = {
  list: () => invoke<Group[]>("list_groups"),
  add: (group: Group) => invoke<Group[]>("add_group", { group }),
  update: (group: Group) => invoke<GroupMutationResult>("update_group", { group }),
  delete: (id: string) => invoke<GroupMutationResult>("delete_group", { id }),
};
