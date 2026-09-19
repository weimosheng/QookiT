import { invoke } from "@tauri-apps/api/core";
import type { Host } from "../types/host";

export const hostService = {
  list: () => invoke<Host[]>("list_hosts"),
  add: (host: Host) => invoke<Host[]>("add_host", { host }),
  update: (host: Host) => invoke<Host[]>("update_host", { host }),
  delete: (id: string) => invoke<Host[]>("delete_host", { id }),
};
